/**
 * instances.js — Azure Table Storage or SQLite backed store for OpenClaw instance beacons
 *
 * Falls back to a local JSON file if neither Azure nor SQLite is configured.
 * Configured via db.js abstraction layer.
 */

import { TableClient, TableServiceClient, odata } from '@azure/data-tables';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { db } from './db.js';
import { logger, logError } from './logger.js';

const TABLE_NAME  = 'OpenClawInstances';
const PARTITION   = 'instances';
const OFFLINE_THRESHOLD_MS = parseInt(process.env.OFFLINE_THRESHOLD_MS || '600000', 10);

// ---------- Determine backend ----------

const CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING || '';
const useAzure = !!CONNECTION_STRING;
const useJSON = !useAzure; // Fallback

let tableClient;

if (useAzure) {
  tableClient = TableClient.fromConnectionString(CONNECTION_STRING, TABLE_NAME);
  const svc = TableServiceClient.fromConnectionString(CONNECTION_STRING);
  svc.createTable(TABLE_NAME).catch(() => {}); // ignore "already exists"
  logger.info('[instances] Using Azure Table Storage');
} else {
  logger.info('[instances] Using JSON fallback (data/instances.json)');
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

// Fields that Azure Tables SDK might misinterpret (dates, numbers-as-strings)
// We store them with a "str_" prefix to force string type
const FORCE_STRING = ['version'];

/** Flatten complex fields to JSON strings for Table Storage */
function toEntity(payload) {
  const entity = {
    partitionKey: PARTITION,
    rowKey:       payload.instanceId,
    lastSeenAt:   payload.lastSeenAt ?? Date.now(),
  };
  for (const [k, v] of Object.entries(payload)) {
    if (k === 'instanceId') continue; // stored as rowKey
    if (typeof v === 'object' && v !== null) {
      entity[k] = JSON.stringify(v);
    } else if (FORCE_STRING.includes(k)) {
      entity[`str_${k}`] = String(v); // store as prefixed to avoid type coercion
    } else {
      entity[k] = v;
    }
  }
  return entity;
}

/** Reconstruct payload from a Table Storage entity */
function fromEntity(entity) {
  const COMPLEX  = ['agents', 'plugins'];
  const INTEGERS = ['lastSeenAt', 'uptime', 'activeSessions'];
  const record = { instanceId: entity.rowKey };
  for (const [k, v] of Object.entries(entity)) {
    if (['partitionKey', 'rowKey', 'etag', 'timestamp'].includes(k)) continue;
    // Unpack prefixed string fields
    if (k.startsWith('str_')) {
      record[k.slice(4)] = String(v);
      continue;
    }
    if (COMPLEX.includes(k) && typeof v === 'string') {
      try { record[k] = JSON.parse(v); } catch { record[k] = v; }
    } else if (INTEGERS.includes(k)) {
      record[k] = typeof v === 'number' ? v : parseInt(v, 10) || 0;
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

  try {
    if (useAzure) {
      const entity = toEntity({ ...payload, lastSeenAt: now });
      await tableClient.upsertEntity(entity, 'Replace');
      return { ...payload, lastSeenAt: now };
    } else {
      // JSON fallback
      const store = fileLoad();
      store[payload.instanceId] = { ...payload, lastSeenAt: now };
      fileSave(store);
      return store[payload.instanceId];
    }
  } catch (err) {
    logError(err, { context: 'upsert_instance', instanceId: payload.instanceId });
    throw err;
  }
}

export async function listInstances() {
  const now = Date.now();

  try {
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
      online: now - (inst.lastSeenAt || 0) < OFFLINE_THRESHOLD_MS,
      lastSeenAgo: Math.floor((now - (inst.lastSeenAt || 0)) / 1000),
    }));
  } catch (err) {
    logError(err, { context: 'list_instances' });
    return [];
  }
}

export async function deleteInstance(instanceId) {
  try {
    if (useAzure) {
      await tableClient.deleteEntity(PARTITION, instanceId).catch(() => {});
    } else {
      const store = fileLoad();
      delete store[instanceId];
      fileSave(store);
    }
  } catch (err) {
    logError(err, { context: 'delete_instance', instanceId });
    throw err;
  }
}
