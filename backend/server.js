import express from 'express';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { dirname } from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { ProxyAgent } from 'undici';

const PORT = process.env.PORT || 3001;
const PUSH_SECRET = 'oc-push-sk-7f3a9d2e1b8c4f6a';

// ---------- ESM State (in-memory) ----------

let esmTickets = [];
let ticketCounter = 1000;

const ESM_KNOWLEDGE_BASE = [
  { q: 'wachtwoord resetten', a: 'Ga naar https://aka.ms/sspr en volg de stappen voor self-service wachtwoordreset. Heb je hulp nodig? Ik kan een ticket aanmaken.', category: 'IT' },
  { q: 'vpn instellen', a: 'Download de GlobalProtect VPN client via het IT-portaal (Software Center). Gebruik je bedrijfsaccount om in te loggen.', category: 'IT' },
  { q: 'verlof aanvragen', a: 'Verlof aanvragen doe je via HR Self Service op het medewerkersportaal. Ga naar Mijn Verlof → Nieuw verzoek.', category: 'HR' },
  { q: 'declaratie indienen', a: 'Declaraties kunnen ingediend worden via het declaratieportaal. Bewaar je bonnen en dien in binnen 30 dagen.', category: 'HR' },
  { q: 'nieuwe laptop', a: 'Een nieuwe laptop aanvragen doe je via het IT-portaal onder Hardware aanvragen. Bespreek dit eerst met je manager.', category: 'IT' },
  { q: 'thuiswerken vergoeding', a: 'De thuiswerkvergoeding bedraagt €2,15 per dag. Dit wordt automatisch verwerkt als je thuis werkt in het systeem.', category: 'HR' },
  { q: 'office installeren', a: 'Microsoft 365 installeer je via portal.office.com → Apps installeren. Log in met je bedrijfsaccount.', category: 'IT' },
  { q: 'onboarding nieuwe medewerker', a: 'Nieuw personeel wordt aangemeld via HR via het onboardingformulier. IT ontvangt automatisch een verzoek voor accounts en toegang.', category: 'HR' },
];

const proxyUrl = process.env.GLOBAL_AGENT_HTTP_PROXY || process.env.HTTPS_PROXY || process.env.https_proxy;
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  ...(proxyUrl && { fetchOptions: { dispatcher: new ProxyAgent(proxyUrl) } }),
});

const ESM_SYSTEM_PROMPT = `Je bent een slimme, vriendelijke servicedeskmedewerker voor een Enterprise Service Management systeem. Je helpt medewerkers met IT-support, HR-verzoeken en algemene vragen.

Je hebt toegang tot de volgende kennisbank:
${ESM_KNOWLEDGE_BASE.map((k, i) => `${i + 1}. [${k.category}] ${k.q}: ${k.a}`).join('\n')}

Gedragsregels:
- Antwoord altijd in het Nederlands
- Wees vriendelijk, direct en bondig
- Als je het antwoord weet uit de kennisbank, geef dat direct
- Als een probleem actie vereist (storing, toegangsprobleem, hardware, HR-verzoek), stel voor om een ticket aan te maken
- Classificeer elke vraag als: IT_INCIDENT, IT_REQUEST, HR_REQUEST, of FAQ
- Geef bij onduidelijkheid een verduidelijkingsvraag

Je antwoord MOET altijd dit JSON-formaat hebben:
{
  "message": "je antwoord aan de gebruiker",
  "intent": "IT_INCIDENT | IT_REQUEST | HR_REQUEST | FAQ",
  "confidence": 0.0-1.0,
  "suggestTicket": true/false,
  "ticketTitle": "korte titel als suggestTicket true is",
  "priority": "laag | normaal | hoog | kritiek"
}`;

function createTicket({ userId, userName, title, description, category, priority }) {
  const id = `TKT-${++ticketCounter}`;
  const ticket = {
    id,
    userId,
    userName: userName || 'Anoniem',
    title,
    description,
    category,
    priority: priority || 'normaal',
    status: 'open',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages: [{ role: 'system', content: `Ticket aangemaakt: ${description}`, at: new Date().toISOString() }],
  };
  esmTickets.unshift(ticket);
  return ticket;
}

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer });

// ---------- In-memory state ----------

let pushedState = null; // { agents, edges, pushedAt }

// ---------- ESM endpoints ----------

// POST /api/esm/chat — AI-powered chat
app.post('/api/esm/chat', async (req, res) => {
  const { message, history = [], userId = 'user-1', userName = 'Medewerker' } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });

  // Build message array: strip trailing user messages from history (we'll append the real one),
  // then ensure strict user/assistant alternation required by Claude.
  const rawHistory = history
    .map(h => ({ role: h.role, content: h.content }))
    .filter(h => h.role === 'user' || h.role === 'assistant');

  // Remove consecutive duplicate roles (keeps first of each run)
  const deduped = rawHistory.filter(
    (h, i) => i === 0 || h.role !== rawHistory[i - 1].role,
  );

  // Drop any trailing assistant message so we can safely append the user turn
  while (deduped.length && deduped[deduped.length - 1].role === 'assistant') {
    deduped.pop();
  }

  const msgs = [...deduped, { role: 'user', content: message }];

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: ESM_SYSTEM_PROMPT,
      messages: msgs,
    });

    const raw = response.content[0].text.trim();
    let parsed;
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
    } catch {
      parsed = { message: raw, intent: 'FAQ', confidence: 0.5, suggestTicket: false, priority: 'normaal' };
    }

    res.json({ ok: true, ...parsed });
  } catch (err) {
    console.error('Claude API error:', err.message);
    res.status(500).json({ error: 'AI service tijdelijk niet beschikbaar', details: err.message });
  }
});

// POST /api/esm/tickets — create ticket
app.post('/api/esm/tickets', (req, res) => {
  const { userId, userName, title, description, category, priority } = req.body;
  if (!title || !description) return res.status(400).json({ error: 'title and description required' });
  const ticket = createTicket({ userId, userName, title, description, category, priority });
  res.json({ ok: true, ticket });
});

// GET /api/esm/tickets — list tickets (optionally filter by userId)
app.get('/api/esm/tickets', (req, res) => {
  const { userId } = req.query;
  const tickets = userId ? esmTickets.filter(t => t.userId === userId) : esmTickets;
  res.json({ tickets });
});

// GET /api/esm/tickets/:id
app.get('/api/esm/tickets/:id', (req, res) => {
  const ticket = esmTickets.find(t => t.id === req.params.id);
  if (!ticket) return res.status(404).json({ error: 'niet gevonden' });
  res.json({ ticket });
});

// PATCH /api/esm/tickets/:id — update status
app.patch('/api/esm/tickets/:id', (req, res) => {
  const ticket = esmTickets.find(t => t.id === req.params.id);
  if (!ticket) return res.status(404).json({ error: 'niet gevonden' });
  const { status, message: note } = req.body;
  if (status) ticket.status = status;
  if (note) ticket.messages.push({ role: 'agent', content: note, at: new Date().toISOString() });
  ticket.updatedAt = new Date().toISOString();
  res.json({ ok: true, ticket });
});

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
