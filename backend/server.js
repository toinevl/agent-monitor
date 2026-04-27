import express from 'express';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { dirname, join as pathJoin } from 'path';
import { fileURLToPath as pathFileUrl } from 'url';

import { upsertInstance, listInstances, deleteInstance } from './instances.js';
import { storeSessionSnapshot } from './sessionHistory.js';
import { logger, httpLogger, logEvent, logError } from './logger.js';
import {
  pushLimiter,
  beaconLimiter,
  authMiddleware,
  validateWSToken,
} from './middleware.js';
import {
  pushPayloadSchema,
  beaconPayloadSchema,
  validatePayload,
} from './validation.js';

// ---------- Configuration ----------

const PORT = process.env.PORT || 3001;
const PUSH_SECRET   = process.env.PUSH_SECRET;
const BEACON_SECRET = process.env.BEACON_SECRET;
const REPORT_BASE_DIR =
  process.env.REPORT_BASE_DIR ||
  '/home/node/.openclaw/workspace/agents/results';
const BUILD_SHA = process.env.BUILD_SHA || null;
const BUILD_SHA_SHORT = BUILD_SHA ? BUILD_SHA.slice(0, 7) : null;

if (!PUSH_SECRET || !BEACON_SECRET) {
  console.error('FATAL: PUSH_SECRET and BEACON_SECRET environment variables must be set');
  process.exit(1);
}

// ---------- Express setup ----------

const app = express();
app.use(helmet({
  contentSecurityPolicy: false, // Vite SPA uses inline module scripts; CSP configured at CDN/proxy level
}));
app.use(httpLogger);

const allowedOrigins = process.env['allowed-origins']
  ? process.env['allowed-origins'].split(',').map(o => o.trim())
  : ['http://localhost:5173'];
app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '10kb' }));

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer });

// ---------- In-memory state ----------

let pushedState = null; // { agents, edges, pushedAt }
let connectedClients = 0; // Track active WebSocket connections
let lastStateUpdate = null; // timestamp of the latest valid /api/push

// ---------- REST endpoints — Session monitor ----------

// POST /api/push — receive state from local pusher
app.post('/api/push', pushLimiter, authMiddleware('PUSH_SECRET'), (req, res) => {
  const validation = validatePayload(pushPayloadSchema, req.body);
  if (!validation.valid) {
    logEvent('push_validation_error', {
      error: validation.error,
      ip: req.ip,
    });
    return res.status(400).json({
      error: 'Invalid push payload',
      details: validation.error,
    });
  }

  const { agents, edges, pushedAt } = validation.data;
  pushedState = { agents, edges, pushedAt: typeof pushedAt === 'number' ? pushedAt : Date.now() };
  lastStateUpdate = Date.now();

  logEvent('session_state_pushed', {
    agentCount: agents.length,
    edgeCount: edges.length,
    connectedClients,
  });

  const msg = JSON.stringify({ type: 'state', data: pushedState });
  let failedClients = 0;
  wss.clients.forEach(client => {
    if (client.readyState === 1) {
      client.send(msg, err => {
        if (err) {
          failedClients++;
          logError(err, { context: 'ws_broadcast_push' });
        }
      });
    }
  });

  res.json({
    ok: true,
    broadcastTo: connectedClients - failedClients,
    agentCount: agents.length,
  });
});

/**
 * GET /api/state — Fetch latest session snapshot
 */
app.get('/api/state', (req, res) => {
  if (pushedState) {
    res.json(pushedState);
  } else {
    res.json({ agents: [], edges: [], pushedAt: null });
  }
});

/**
 * GET /api/health — Health check with uptime
 */
app.get('/api/health', async (req, res) => {
  try {
    const instances = await listInstances();
    const onlineInstances = instances.filter(i => i.online).length;

    res.json({
      ok: true,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      connectedClients,
      lastStateUpdate,
      totalInstances: instances.length,
      onlineInstances,
      buildSha: BUILD_SHA,
      buildShaShort: BUILD_SHA_SHORT,
    });
  } catch (err) {
    logError(err, { context: 'health_check' });
    res.status(500).json({
      ok: false,
      error: 'Failed to compute health metrics',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /api/version — Runtime build metadata for smoke testing
 */
app.get('/api/version', (req, res) => {
  res.json({
    ok: true,
    buildSha: BUILD_SHA,
    buildShaShort: BUILD_SHA_SHORT,
    nodeEnv: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/report — Serve final markdown report + findings
 * Reports path is configurable via REPORT_BASE_DIR env var
 */
app.get('/api/report', (req, res) => {
  const reportPath = pathJoin(REPORT_BASE_DIR, 'final-report.md');
  const findings = ['costs', 'revenue', 'community', 'comparable']
    .map(name => {
      const p = pathJoin(REPORT_BASE_DIR, `findings-${name}.json`);
      if (existsSync(p)) {
        try {
          return JSON.parse(readFileSync(p, 'utf8'));
        } catch (err) {
          logError(err, { context: 'findings_parse', file: p });
          return null;
        }
      }
      return null;
    })
    .filter(Boolean);

  if (existsSync(reportPath)) {
    try {
      const markdown = readFileSync(reportPath, 'utf8');
      logEvent('report_served', { findingsCount: findings.length });
      res.json({
        ready: true,
        markdown,
        findings,
        generatedAt: new Date().toISOString(),
      });
    } catch (err) {
      logError(err, { context: 'report_read', path: reportPath });
      res.status(500).json({ error: 'Failed to read report' });
    }
  } else {
    res.json({
      ready: false,
      findings,
      markdown: null,
      reportPath, // Help with debugging
    });
  }
});

/**
 * GET /api/sessions/history — Retrieve session history for a date range
 * Query params: ?start=2026-03-29&end=2026-03-30 (optional, defaults to today)
 */
app.get('/api/sessions/history', async (req, res) => {
  try {
    const { start, end } = req.query;
    const startDate = start ? new Date(start) : new Date();
    const endDate = end ? new Date(end) : new Date(startDate);

    const { getSessionHistory } = await import('./sessionHistory.js');
    const history = await getSessionHistory(startDate, endDate);

    logEvent('session_history_retrieved', {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      snapshotCount: history.length,
    });

    res.json({
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      snapshots: history,
    });
  } catch (err) {
    logError(err, { context: 'get_session_history' });
    res.status(500).json({ error: 'Failed to retrieve session history' });
  }
});

/**
 * GET /api/sessions/stats — Get session statistics for a date
 * Query params: ?date=2026-03-29 (optional, defaults to today)
 */
app.get('/api/sessions/stats', async (req, res) => {
  try {
    const { date } = req.query;
    const statsDate = date ? new Date(date) : new Date();

    const { getSessionStats } = await import('./sessionHistory.js');
    const stats = await getSessionStats(statsDate);

    logEvent('session_stats_retrieved', {
      date: statsDate.toISOString(),
      ...stats,
    });

    res.json({
      date: statsDate.toISOString(),
      ...stats,
    });
  } catch (err) {
    logError(err, { context: 'get_session_stats' });
    res.status(500).json({ error: 'Failed to retrieve session statistics' });
  }
});

// ---------- REST endpoints — Instance beacon ----------

/**
 * POST /api/beacon — Instance registers itself
 * Rate limited to 30 requests/min, requires BEACON_SECRET auth
 */
app.post(
  '/api/beacon',
  beaconLimiter,
  authMiddleware('BEACON_SECRET'),
  async (req, res) => {
    // Validate payload schema
    const validation = validatePayload(beaconPayloadSchema, req.body);
    if (!validation.valid) {
      logEvent('beacon_validation_error', {
        error: validation.error,
        ip: req.ip,
      });
      return res.status(400).json({
        error: 'Invalid beacon payload',
        details: validation.error,
      });
    }

    const payload = validation.data;

    try {
      const record = await upsertInstance(payload);
      await broadcastInstances();

      logEvent('instance_beacon', {
        instanceId: payload.instanceId,
        version: payload.version,
        activeSessions: payload.activeSessions || 0,
      });

      res.json({ ok: true, record });
    } catch (err) {
      logError(err, { context: 'beacon_upsert', instanceId: payload.instanceId });
      res.status(500).json({ error: 'Failed to register beacon' });
    }
  }
);

/**
 * GET /api/instances — List all registered instances
 */
app.get('/api/instances', async (req, res) => {
  try {
    const instances = await listInstances();
    const onlineCount = instances.filter(i => i.online).length;

    logEvent('instances_listed', {
      totalInstances: instances.length,
      onlineCount,
    });

    res.json(instances);
  } catch (err) {
    logError(err, { context: 'list_instances' });
    res.status(500).json({ error: 'Failed to list instances' });
  }
});

/**
 * DELETE /api/instances/:id — Remove an instance
 */
app.delete(
  '/api/instances/:id',
  authMiddleware('BEACON_SECRET'),
  async (req, res) => {
    const { id } = req.params;

    try {
      await deleteInstance(id);
      await broadcastInstances();

      logEvent('instance_deleted', { instanceId: id });

      res.json({ ok: true, deletedId: id });
    } catch (err) {
      logError(err, { context: 'delete_instance', instanceId: id });
      res.status(500).json({ error: 'Failed to delete instance' });
    }
  }
);

/**
 * Helper: Broadcast instances list to all connected WebSocket clients
 */
async function broadcastInstances() {
  try {
    const instances = await listInstances();
    const msg = JSON.stringify({ type: 'instances', data: instances });
    let failedClients = 0;
    wss.clients.forEach(client => {
      if (client.readyState === 1) {
        client.send(msg, err => {
          if (err) {
            failedClients++;
            logError(err, { context: 'ws_broadcast_instances' });
          }
        });
      }
    });
  } catch (err) {
    logError(err, { context: 'broadcast_instances' });
  }
}

// ---------- Serve frontend static files ----------

const __dir = dirname(pathFileUrl(import.meta.url));
const distPath = pathJoin(__dir, '../dist');
if (existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(pathJoin(distPath, 'index.html'));
  });
  logger.info(`Serving static frontend from ${distPath}`);
}

// ---------- 404 handler ----------

app.use((req, res) => {
  logger.warn({ path: req.path, method: req.method }, 'Not found');
  res.status(404).json({ error: 'Not found' });
});

// ---------- Error handler (final catch-all) ----------

app.use((err, req, res, next) => {
  logError(err, { method: req.method, path: req.path });
  res.status(500).json({
    error: 'Internal server error',
    requestId: req.id || 'unknown',
  });
});

// ---------- WebSocket ----------

wss.on('connection', async (ws, req) => {
  // Validate WebSocket token if configured
  if (!validateWSToken(req)) {
    logger.warn(
      { ip: req.socket.remoteAddress },
      'WebSocket connection rejected: invalid token'
    );
    ws.close(1008, 'Unauthorized');
    return;
  }

  connectedClients++;
  logEvent('websocket_connected', { totalClients: connectedClients });

  // Send current state immediately on connect
  if (pushedState) {
    ws.send(JSON.stringify({ type: 'state', data: pushedState }));
  } else {
    ws.send(
      JSON.stringify({
        type: 'state',
        data: { agents: [], edges: [], pushedAt: null },
      })
    );
  }

  // Send current instances
  try {
    const instances = await listInstances();
    ws.send(JSON.stringify({ type: 'instances', data: instances }));
  } catch (err) {
    logError(err, { context: 'ws_send_initial_instances' });
  }

  ws.on('close', () => {
    connectedClients--;
    logEvent('websocket_disconnected', { totalClients: connectedClients });
  });

  ws.on('error', err => {
    logError(err, { context: 'websocket_error' });
  });
});

// ---------- Graceful shutdown ----------

function shutdown(signal) {
  logger.info({ signal }, 'Shutting down gracefully...');
  wss.clients.forEach(client => client.close(1001, 'Server shutting down'));
  httpServer.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

// ---------- Start server ----------

httpServer.listen(PORT, '0.0.0.0', () => {
  logger.info(
    {
      port: PORT,
      nodeEnv: process.env.NODE_ENV || 'development',
      reportBaseDir: REPORT_BASE_DIR,
    },
    '🚀 Agent Monitor backend started'
  );
  logger.info(
    {
      push: 'POST /api/push (Bearer PUSH_SECRET)',
      beacon: 'POST /api/beacon (Bearer BEACON_SECRET)',
      instances: 'GET /api/instances',
      health: 'GET /api/health',
      report: 'GET /api/report',
      websocket: `ws://0.0.0.0:${PORT}${process.env.WS_TOKEN ? '?token=<WS_TOKEN>' : ''}`,
    },
    'Available endpoints'
  );
});
