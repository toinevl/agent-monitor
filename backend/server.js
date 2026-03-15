import express from 'express';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { dirname } from 'path';

const PORT = process.env.PORT || 3001;
const PUSH_SECRET = 'oc-push-sk-7f3a9d2e1b8c4f6a';

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer });

// ---------- In-memory state ----------

let pushedState = null; // { agents, edges, pushedAt }

// ---------- REST endpoints ----------

// POST /api/push — receive state from local pusher
app.post('/api/push', (req, res) => {
  const auth = req.headers['authorization'] || '';
  if (auth !== `Bearer ${PUSH_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { agents, edges, pushedAt } = req.body;
  if (!agents || !edges) {
    return res.status(400).json({ error: 'Missing agents or edges in body' });
  }

  pushedState = { agents, edges, pushedAt: pushedAt || Date.now() };

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

wss.on('connection', (ws) => {
  console.log('Client connected');

  // Send current state immediately on connect
  if (pushedState) {
    ws.send(JSON.stringify({ type: 'state', data: pushedState }));
  } else {
    ws.send(JSON.stringify({ type: 'state', data: { agents: [], edges: [], pushedAt: null } }));
  }

  ws.on('close', () => console.log('Client disconnected'));
});

// ---------- Start ----------

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Agent Monitor backend running on http://0.0.0.0:${PORT}`);
  console.log(`WebSocket: ws://0.0.0.0:${PORT}`);
  console.log(`Push endpoint: POST /api/push (bearer auth required)`);
});
