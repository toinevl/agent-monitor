#!/usr/bin/env node
/**
 * beacon.js — cross-platform agent-monitor beacon
 * Works on Linux, Windows, macOS and inside containers.
 * Requires Node.js 18+ (same as OpenClaw).
 *
 * Config via environment variables:
 *   INSTANCE_ID     — unique slug for this machine (required)
 *   LABEL           — human-readable name (optional, defaults to hostname)
 *   CENTRAL_URL     — agent-monitor backend URL (required)
 *   BEACON_SECRET   — shared secret for /api/beacon (required)
 *
 * Or pass a config file path as first argument:
 *   node beacon.js /path/to/beacon-config.json
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { hostname } from 'os';

// ---- Load config ----

let config = {};
const configPath = process.argv[2] ||
  new URL('./beacon-config.json', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'); // fix Windows paths

if (existsSync(configPath)) {
  try { config = JSON.parse(readFileSync(configPath, 'utf8')); } catch {}
}

const INSTANCE_ID   = process.env.INSTANCE_ID   || config.instanceId;
const LABEL         = process.env.LABEL          || config.label        || hostname();
const CENTRAL_URL   = process.env.CENTRAL_URL    || config.centralUrl;
const BEACON_SECRET = process.env.BEACON_SECRET  || config.beaconSecret;

if (!INSTANCE_ID || !CENTRAL_URL || !BEACON_SECRET) {
  console.error('Missing required config: INSTANCE_ID, CENTRAL_URL, BEACON_SECRET');
  console.error('Set via env vars or beacon-config.json');
  process.exit(1);
}

// ---- Collect info ----

function run(cmd) {
  try { return execSync(cmd, { timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); }
  catch { return 'unknown'; }
}

const version        = run('openclaw --version').split('\n')[0];
const host           = `${process.platform} ${process.arch}`;
const activeSessions = parseInt(run('openclaw sessions list 2>/dev/null | grep -c active'), 10) || 0;

// Uptime in seconds
const uptime = Math.floor(process.uptime
  ? (() => { try { return parseInt(readFileSync('/proc/uptime', 'utf8')); } catch { return process.uptime(); } })()
  : process.uptime());

// Model + channel from openclaw config
let model = 'unknown', channel = 'unknown';
const ocConfigPaths = [
  process.env.HOME && `${process.env.HOME}/.openclaw/openclaw.json`,
  process.env.USERPROFILE && `${process.env.USERPROFILE}\\.openclaw\\openclaw.json`,
].filter(Boolean);
for (const p of ocConfigPaths) {
  if (p && existsSync(p)) {
    try {
      const oc = JSON.parse(readFileSync(p, 'utf8'));
      model   = oc.model   || model;
      channel = oc.channel || channel;
    } catch {}
    break;
  }
}

// ---- POST to beacon ----

const payload = {
  instanceId: INSTANCE_ID,
  label:      LABEL,
  version, model, host, channel,
  activeSessions, uptime,
};

const timestamp = new Date().toISOString();

try {
  const res = await fetch(`${CENTRAL_URL}/api/beacon`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${BEACON_SECRET}`,
    },
    body: JSON.stringify(payload),
  });

  if (res.ok) {
    console.log(`${timestamp} ✅ Beacon sent to ${CENTRAL_URL} as ${INSTANCE_ID}`);
  } else {
    const text = await res.text();
    console.error(`${timestamp} ❌ Beacon failed (HTTP ${res.status}): ${text}`);
    process.exit(1);
  }
} catch (err) {
  console.error(`${timestamp} ❌ Network error: ${err.message}`);
  process.exit(1);
}
