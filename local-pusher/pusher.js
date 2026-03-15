/**
 * agent-monitor local pusher
 * Polls `openclaw sessions --json --all-agents` every 3 seconds and pushes
 * the transformed state to the Azure-hosted agent-monitor backend.
 *
 * No npm dependencies — uses only Node.js built-ins + native fetch (Node 18+).
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const PUSH_URL   = 'https://agent-monitor.bluecliff-bb323f5a.northeurope.azurecontainerapps.io/api/push';
const PUSH_TOKEN = 'oc-push-sk-7f3a9d2e1b8c4f6a';
const POLL_MS    = 3000;

// ---------- Session → Agent transform ----------

function classifySession(session) {
  const key   = (session.key   || '').toLowerCase();
  const label = (session.label || '').toLowerCase();
  const kind  = (session.kind  || '').toLowerCase();

  // Only the true main session is the orchestrator
  if (key === 'agent:main:main') return 'orchestrator';

  // Named investigator sub-agents
  if (label.includes('invest') || label.includes('research')) return 'investigator';

  // Named worker sub-agents
  if (label.includes('work') || label.includes('write') || label.includes('exec') || label.includes('report') || label.includes('synth')) return 'worker';

  // Sub-agents by kind
  if (kind === 'subagent' || kind === 'acp') return 'worker';

  // Other direct sessions (slash commands, channel sessions) → worker
  return 'worker';
}

function sessionToAgent(session) {
  const now    = Date.now();
  const ageSec = Math.floor((now - session.updatedAt) / 1000);

  const isMain = session.kind === 'direct' || (session.key || '').includes(':main:');
  let status   = isMain ? 'listening' : 'idle';
  if (ageSec < 45)    status = 'running';
  else if (ageSec < 3600) status = isMain ? 'listening' : 'done';

  return {
    id:        session.sessionId || session.key,
    key:       session.key,
    type:      classifySession(session),
    label:     session.label || session.key?.split(':').pop() || 'Agent',
    status,
    model:     session.model    || 'unknown',
    tokens:    session.totalTokens || 0,
    updatedAt: session.updatedAt,
    ageSec,
    task:      session.lastTask || 'Active session',
  };
}

function buildEdges(agents) {
  const orchestrator = agents.find(a => a.type === 'orchestrator');
  if (!orchestrator) return [];

  return agents
    .filter(a => a.id !== orchestrator.id)
    .map(a => ({
      id:     `e-${orchestrator.id}-${a.id}`,
      source: orchestrator.id,
      target: a.id,
      label:  a.status === 'done' ? 'completed' : 'assigned',
    }));
}

// ---------- Poll & push loop ----------

async function pollAndPush() {
  // 1. Fetch sessions
  let raw;
  try {
    const { stdout } = await execAsync('openclaw sessions --json --all-agents', { timeout: 8000 });
    raw = JSON.parse(stdout);
  } catch (err) {
    console.error(`[pusher] Failed to get sessions: ${err.message}`);
    return;
  }

  // 2. Transform
  const agents   = (raw.sessions || []).map(sessionToAgent);
  const edges    = buildEdges(agents);
  const pushedAt = Date.now();

  // 3. Push to Azure backend
  try {
    const res = await fetch(PUSH_URL, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${PUSH_TOKEN}`,
      },
      body: JSON.stringify({ agents, edges, pushedAt }),
    });

    if (res.ok) {
      console.log(`[pusher] ✓ Pushed ${agents.length} agent(s) at ${new Date(pushedAt).toISOString()}`);
    } else {
      const text = await res.text();
      console.error(`[pusher] ✗ Push failed (${res.status}): ${text}`);
    }
  } catch (err) {
    console.error(`[pusher] ✗ Network error: ${err.message}`);
  }
}

// Run immediately, then on interval
pollAndPush();
setInterval(pollAndPush, POLL_MS);

console.log(`[pusher] Started — pushing to ${PUSH_URL} every ${POLL_MS}ms`);
