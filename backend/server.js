import express from 'express';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { dirname } from 'path';

import { upsertInstance, listInstances, deleteInstance } from './instances.js';

const PORT = process.env.PORT || 3001;
const PUSH_SECRET   = process.env.PUSH_SECRET;
const BEACON_SECRET = process.env.BEACON_SECRET;

if (!PUSH_SECRET || !BEACON_SECRET) {
  console.error('FATAL: PUSH_SECRET and BEACON_SECRET environment variables must be set');
  process.exit(1);
}

const app = express();

app.use(helmet());

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:5173'];
app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '10kb' }));

const pushLimiter = rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false });
const beaconLimiter = rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false });

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer });

// ---------- In-memory state (agent session monitor) ----------

let pushedState = null; // { agents, edges, pushedAt }

// ---------- REST endpoints — agent session monitor ----------

// POST /api/push — receive state from local pusher
app.post('/api/push', pushLimiter, (req, res) => {
  const auth = req.headers['authorization'] || '';
  if (auth !== `Bearer ${PUSH_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { agents, edges, pushedAt } = req.body;
  if (!Array.isArray(agents) || !Array.isArray(edges)) {
    return res.status(400).json({ error: 'agents and edges must be arrays' });
  }
  if (agents.length > 500 || edges.length > 1000) {
    return res.status(400).json({ error: 'Payload exceeds maximum allowed size' });
  }

  pushedState = { agents, edges, pushedAt: typeof pushedAt === 'number' ? pushedAt : Date.now() };

  const msg = JSON.stringify({ type: 'state', data: pushedState });
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(msg);
  });

  res.json({ ok: true });
});

// GET /api/state — current snapshot (last pushed, or empty)
app.get('/api/state', (req, res) => {
  if (pushedState) {
    res.json(pushedState);
  } else {
    res.json({ agents: [], edges: [], pushedAt: null });
  }
});

// GET /api/health
app.get('/api/health', (_, res) => res.json({ ok: true, uptime: process.uptime() }));

// GET /api/report — serve the final markdown report
app.get('/api/report', (req, res) => {
  const reportPath = '/home/node/.openclaw/workspace/agents/results/final-report.md';
  const findingsDir = '/home/node/.openclaw/workspace/agents/results';
  const findings = ['costs', 'revenue', 'community', 'comparable'].map(name => {
    const p = `${findingsDir}/findings-${name}.json`;
    if (existsSync(p)) {
      try { return JSON.parse(readFileSync(p, 'utf8')); } catch {}
    }
    return null;
  }).filter(Boolean);

  if (existsSync(reportPath)) {
    res.json({
      ready: true,
      markdown: readFileSync(reportPath, 'utf8'),
      findings,
      generatedAt: new Date().toISOString(),
    });
  } else {
    res.json({ ready: false, findings, markdown: null });
  }
});

// ---------- REST endpoints — instance beacon ----------

// POST /api/beacon — instance registers itself
app.post('/api/beacon', beaconLimiter, async (req, res) => {
  const auth = req.headers['authorization'] || '';
  if (auth !== `Bearer ${BEACON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const payload = req.body;
  if (!payload || !payload.instanceId) {
    return res.status(400).json({ error: 'Missing instanceId in body' });
  }

  try {
    const record = await upsertInstance(payload);
    broadcastInstances();
    res.json({ ok: true, record });
  } catch (err) {
    console.error('Beacon error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/instances — list all known instances
app.get('/api/instances', async (req, res) => {
  try {
    res.json(await listInstances());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/instances/:id — remove an instance
app.delete('/api/instances/:id', async (req, res) => {
  const auth = req.headers['authorization'] || '';
  if (auth !== `Bearer ${BEACON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  await deleteInstance(req.params.id);
  broadcastInstances();
  res.json({ ok: true });
});

async function broadcastInstances() {
  try {
    const instances = await listInstances();
    const msg = JSON.stringify({ type: 'instances', data: instances });
    wss.clients.forEach(client => {
      if (client.readyState === 1) client.send(msg);
    });
  } catch (err) {
    console.error('broadcastInstances error:', err);
  }
}

// Serve frontend static files in production
import { join as pathJoin } from 'path';
import { fileURLToPath as pathFileUrl } from 'url';
const __dir = dirname(pathFileUrl(import.meta.url));
const distPath = pathJoin(__dir, '../dist');
if (existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/ws')) return next();
    res.sendFile(pathJoin(distPath, 'index.html'));
  });
  console.log(`Serving static frontend from ${distPath}`);
}

// ---------- WebSocket ----------

wss.on('connection', async (ws) => {
  console.log('Client connected');

  // Send current agent session state immediately on connect
  if (pushedState) {
    ws.send(JSON.stringify({ type: 'state', data: pushedState }));
  } else {
    ws.send(JSON.stringify({ type: 'state', data: { agents: [], edges: [], pushedAt: null } }));
  }

  // Also send current instances on connect
  try {
    const instances = await listInstances();
    ws.send(JSON.stringify({ type: 'instances', data: instances }));
  } catch (err) {
    console.error('Error sending instances on connect:', err);
  }

  ws.on('close', () => console.log('Client disconnected'));
});

// ---------- Start ----------

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Agent Monitor backend running on http://0.0.0.0:${PORT}`);
  console.log(`WebSocket: ws://0.0.0.0:${PORT}`);
  console.log(`Push endpoint:   POST /api/push   (Bearer PUSH_SECRET)`);
  console.log(`Beacon endpoint: POST /api/beacon (Bearer BEACON_SECRET)`);
});
