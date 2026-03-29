/**
 * sessionHistory.js — Store and retrieve agent session history
 *
 * Sessions are stored in Azure Table Storage with time-based partitions:
 * PartitionKey: "session-2026-03-29"  (date-based, for easy TTL/cleanup)
 * RowKey:       "timestamp-sessionId"  (unique, sortable by time)
 *
 * Falls back to JSON file in dev mode (data/sessions.json)
 */

import { TableClient, TableServiceClient, odata } from '@azure/data-tables';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logError } from './logger.js';

const TABLE_NAME = 'AgentSessions';

// ---------- Determine backend ----------

const CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING || '';
const useAzure = !!CONNECTION_STRING;

let tableClient;

if (useAzure) {
  tableClient = new TableClient(CONNECTION_STRING, TABLE_NAME);
  // Ensure table exists
  const svc = TableServiceClient.fromConnectionString(CONNECTION_STRING);
  svc.createTable(TABLE_NAME).catch(() => {}); // ignore "already exists"
} else {
  console.log('[sessionHistory] Using JSON fallback (dev mode)');
}

// ---------- JSON file fallback (local dev) ----------

const __dir = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dir, '../data');
const SESSIONS_PATH = join(DATA_DIR, 'sessions.json');

function fileLoad() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(SESSIONS_PATH)) return {};
  try {
    return JSON.parse(readFileSync(SESSIONS_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function fileSave(store) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(SESSIONS_PATH, JSON.stringify(store, null, 2), 'utf8');
}

// ---------- Helpers ----------

function getDatePartition(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `session-${year}-${month}-${day}`;
}

function toEntity(sessionData, timestamp = Date.now()) {
  const partition = getDatePartition();
  const rowKey = `${timestamp}-${sessionData.id || 'unknown'}`;

  return {
    partitionKey: partition,
    rowKey,
    timestamp,
    sessionId: sessionData.id || '',
    agentCount: sessionData.agents?.length || 0,
    edgeCount: sessionData.edges?.length || 0,
    state: JSON.stringify(sessionData), // Full session data as JSON string
  };
}

function fromEntity(entity) {
  return {
    id: entity.sessionId,
    timestamp: entity.timestamp,
    agentCount: entity.agentCount,
    edgeCount: entity.edgeCount,
    state: typeof entity.state === 'string' ? JSON.parse(entity.state) : entity.state,
  };
}

// ---------- Public API ----------

/**
 * Store a session snapshot in history
 * @param {Object} sessionData - { agents: [], edges: [] }
 * @param {number} timestamp - Unix timestamp (optional, defaults to now)
 */
export async function storeSessionSnapshot(sessionData, timestamp = Date.now()) {
  if (!sessionData) return;

  try {
    if (useAzure) {
      const entity = toEntity(sessionData, timestamp);
      await tableClient.upsertEntity(entity, 'Replace');
    } else {
      // File-based: store as array of snapshots, keep last 100
      const store = fileLoad();
      const key = `${timestamp}`;
      store[key] = {
        timestamp,
        agentCount: sessionData.agents?.length || 0,
        edgeCount: sessionData.edges?.length || 0,
        state: sessionData,
      };

      // Prune old entries (keep last 100)
      const keys = Object.keys(store).sort((a, b) => parseInt(b) - parseInt(a));
      if (keys.length > 100) {
        keys.slice(100).forEach(k => delete store[k]);
      }
      fileSave(store);
    }
  } catch (err) {
    logError(err, { context: 'store_session_snapshot' });
  }
}

/**
 * Retrieve session history for a date range
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date (optional, defaults to startDate)
 * @returns {Array} Session snapshots sorted by timestamp
 */
export async function getSessionHistory(startDate, endDate = startDate) {
  try {
    let snapshots = [];

    if (useAzure) {
      // Query Azure Table Storage across date partitions
      const current = new Date(startDate);
      while (current <= endDate) {
        const partition = getDatePartition(current);
        try {
          const entities = tableClient.listEntities({
            queryOptions: { filter: odata`PartitionKey eq ${partition}` },
          });
          for await (const entity of entities) {
            snapshots.push(fromEntity(entity));
          }
        } catch (err) {
          // Partition might not exist yet, ignore
        }
        current.setDate(current.getDate() + 1);
      }
    } else {
      // File-based: simple lookup
      const store = fileLoad();
      const startTs = startDate.getTime();
      const endTs = endDate.getTime();
      snapshots = Object.entries(store)
        .filter(([ts]) => {
          const t = parseInt(ts);
          return t >= startTs && t <= endTs;
        })
        .map(([, data]) => data);
    }

    // Sort by timestamp descending (newest first)
    return snapshots.sort((a, b) => b.timestamp - a.timestamp);
  } catch (err) {
    logError(err, { context: 'get_session_history' });
    return [];
  }
}

/**
 * Get session statistics (agent count trends, etc.)
 * @param {Date} startDate - Start date
 * @returns {Object} Stats: { avgAgentCount, maxAgentCount, snapshotCount }
 */
export async function getSessionStats(startDate = new Date()) {
  try {
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 1); // 24-hour window

    const snapshots = await getSessionHistory(startDate, endDate);

    if (snapshots.length === 0) {
      return {
        avgAgentCount: 0,
        maxAgentCount: 0,
        minAgentCount: 0,
        snapshotCount: 0,
      };
    }

    const agentCounts = snapshots.map(s => s.agentCount);
    const avgAgentCount = Math.round(agentCounts.reduce((a, b) => a + b) / agentCounts.length);
    const maxAgentCount = Math.max(...agentCounts);
    const minAgentCount = Math.min(...agentCounts);

    return {
      avgAgentCount,
      maxAgentCount,
      minAgentCount,
      snapshotCount: snapshots.length,
    };
  } catch (err) {
    logError(err, { context: 'get_session_stats' });
    return { avgAgentCount: 0, maxAgentCount: 0, minAgentCount: 0, snapshotCount: 0 };
  }
}

/**
 * Clean up old session records (older than N days)
 * Azure Table Storage TTL not available, so manual cleanup needed
 * @param {number} retentionDays - Delete records older than this many days
 */
export async function pruneOldSessions(retentionDays = 30) {
  try {
    if (useAzure) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      const current = new Date();
      current.setDate(current.getDate() - 365); // Go back up to 1 year

      let deletedCount = 0;

      while (current <= cutoffDate) {
        const partition = getDatePartition(current);
        try {
          const entities = tableClient.listEntities({
            queryOptions: { filter: odata`PartitionKey eq ${partition}` },
          });

          for await (const entity of entities) {
            await tableClient.deleteEntity(entity.partitionKey, entity.rowKey).catch(() => {});
            deletedCount++;
          }
        } catch (err) {
          // Partition doesn't exist, continue
        }
        current.setDate(current.getDate() + 1);
      }

      return { success: true, deletedCount };
    } else {
      // File-based: prune old entries from JSON
      const store = fileLoad();
      const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
      const before = Object.keys(store).length;

      Object.keys(store).forEach(ts => {
        if (parseInt(ts) < cutoffMs) delete store[ts];
      });

      fileSave(store);
      const after = Object.keys(store).length;

      return { success: true, deletedCount: before - after };
    }
  } catch (err) {
    logError(err, { context: 'prune_old_sessions' });
    return { success: false, error: err.message };
  }
}
