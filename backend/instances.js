/**
 * instances.js — Azure Table Storage backed store for OpenClaw instance beacons
 *
 * Falls back to a local JSON file if AZURE_STORAGE_CONNECTION_STRING is not set
 * (useful for local dev).
 *
 * Table: OpenClawInstances
 * PartitionKey: "instances"  (all records in one partition for easy query)
 * RowKey:       instanceId
 *
 * Complex fields (agents, plugins) are JSON-stringified before write and
 * parsed on read, since Azure Table Storage only supports flat key/value rows.
 */

import { TableClient, TableServiceClient, odata } from '@azure/data-tables';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const TABLE_NAME  = 'OpenClawInstances';
const PARTITION   = 'instances';
const OFFLINE_THRESHOLD_MS = parseInt(process.env.OFFLINE_THRESHOLD_MS || '600000', 10);

// ---------- Determine backend ----------

const CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING || '';
const useAzure = !!CONNECTION_STRING;

let tableClient;

if (useAzure) {
  tableClient = new TableClient(CONNECTION_STRING, TABLE_NAME);
  // Ensure table exists (idempotent)
  const svc = TableServiceClient.fromConnectionString(CONNECTION_STRING);
  svc.createTable(TABLE_NAME).catch(() => {}); // ignore "already exists"
  console.log(`[instances] Using Azure Table Storage — table: ${TABLE_NAME}`);
} else {
  console.log('[instances] AZURE_STORAGE_CONNECTION_STRING not set — using local JSON fallback');
}

// ---------- JSON file fallback (local dev) ----------

const __dir = dirname(fileURLToPath(import.meta.url));
const DATA_DIR   = join(__dir, '../data');
const STORE_PATH = join(DATA_DIR, 'instances.json');

function fileLoad() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(STORE_PATH)) return {};
  try { return JSON.parse(readFileSync(STORE_PATH, 'utf8')); } catch { return {}; }
}

function fileSave(store) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
}

// ---------- Serialization helpers ----------

/** Flatten complex fields to JSON strings for Table Storage */
function toEntity(payload) {
  const entity = {
    partitionKey: PARTITION,
    rowKey:       payload.instanceId,
    lastSeenAt:   payload.lastSeenAt ?? Date.now(),
  };
  for (const [k, v] of Object.entries(payload)) {
    if (k === 'instanceId') continue; // stored as rowKey
    entity[k] = (typeof v === 'object' && v !== null) ? JSON.stringify(v) : v;
  }
  return entity;
}

/** Reconstruct payload from a Table Storage entity */
function fromEntity(entity) {
  const COMPLEX = ['agents', 'plugins'];
  const record = { instanceId: entity.rowKey };
  for (const [k, v] of Object.entries(entity)) {
    if (['partitionKey', 'rowKey', 'etag', 'timestamp'].includes(k)) continue;
    if (COMPLEX.includes(k) && typeof v === 'string') {
      try { record[k] = JSON.parse(v); } catch { record[k] = v; }
    } else {
      record[k] = v;
    }
  }
  return record;
}

// ---------- Public API ----------

export async function upsertInstance(payload) {
  if (!payload?.instanceId) throw new Error('instanceId is required');
  const now = Date.now();

  if (useAzure) {
    const entity = toEntity({ ...payload, lastSeenAt: now });
    await tableClient.upsertEntity(entity, 'Replace');
    return { ...payload, lastSeenAt: now };
  } else {
    const store = fileLoad();
    store[payload.instanceId] = { ...payload, lastSeenAt: now };
    fileSave(store);
    return store[payload.instanceId];
  }
}

export async function listInstances() {
  const now = Date.now();

  let records;
  if (useAzure) {
    const entities = tableClient.listEntities({
      queryOptions: { filter: odata`PartitionKey eq ${PARTITION}` },
    });
    records = [];
    for await (const entity of entities) {
      records.push(fromEntity(entity));
    }
  } else {
    records = Object.values(fileLoad());
  }

  return records.map(inst => ({
    ...inst,
    online:      now - (inst.lastSeenAt || 0) < OFFLINE_THRESHOLD_MS,
    lastSeenAgo: Math.floor((now - (inst.lastSeenAt || 0)) / 1000),
  }));
}

export async function deleteInstance(instanceId) {
  if (useAzure) {
    await tableClient.deleteEntity(PARTITION, instanceId).catch(() => {});
  } else {
    const store = fileLoad();
    delete store[instanceId];
    fileSave(store);
  }
}
