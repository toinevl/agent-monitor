/**
 * instances.js — JSON-file-backed store for OpenClaw instance beacons
 *
 * Each instance registers itself by POSTing to /api/beacon with an
 * instanceId and a bearer token (BEACON_SECRET env var).
 * The last beacon per instanceId is stored to data/instances.json.
 * Instances are marked "offline" when last beacon is older than
 * OFFLINE_THRESHOLD_MS (default 10 min).
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const DATA_DIR  = join(__dir, '../data');
const STORE_PATH = join(DATA_DIR, 'instances.json');
const OFFLINE_THRESHOLD_MS = parseInt(process.env.OFFLINE_THRESHOLD_MS || '600000', 10); // 10 min

// Ensure data dir exists
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

/** Load store from disk (returns {[instanceId]: instanceRecord}) */
function load() {
  if (!existsSync(STORE_PATH)) return {};
  try {
    return JSON.parse(readFileSync(STORE_PATH, 'utf8'));
  } catch {
    return {};
  }
}

/** Persist store to disk */
function save(store) {
  writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
}

/** Upsert an instance beacon payload */
export function upsertInstance(payload) {
  const store = load();
  const { instanceId } = payload;
  if (!instanceId) throw new Error('instanceId is required');
  store[instanceId] = { ...payload, lastSeenAt: Date.now() };
  save(store);
  return store[instanceId];
}

/** Return all instances, with an online/offline status derived from lastSeenAt */
export function listInstances() {
  const store = load();
  const now = Date.now();
  return Object.values(store).map(inst => ({
    ...inst,
    online: now - (inst.lastSeenAt || 0) < OFFLINE_THRESHOLD_MS,
    lastSeenAgo: Math.floor((now - (inst.lastSeenAt || 0)) / 1000),
  }));
}

/** Delete an instance by id */
export function deleteInstance(instanceId) {
  const store = load();
  delete store[instanceId];
  save(store);
}
