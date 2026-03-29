/**
 * sessionHistory.js — Time-series storage for agent session snapshots
 *
 * Supports: Azure Table Storage (production), SQLite (dev), JSON (fallback)
 * Configured via db.js abstraction layer.
 */

import { TableClient, TableServiceClient, odata } from '@azure/data-tables';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { db } from './db.js';
import { logError } from './logger.js';

const TABLE_NAME = 'AgentSessions';

// ---------- Determine backend ----------

const CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING || '';
const useAzure = !!CONNECTION_STRING;
const useSQLite = db.isSQLite;
const useJSON = !useAzure && !useSQLite;

let tableClient;

if (useAzure) {
  tableClient = new TableClient(CONNECTION_STRING, TABLE_NAME);
  const svc = TableServiceClient.fromConnectionString(CONNECTION_STRING);
  svc.createTable(TABLE_NAME).catch(() => {});
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

// ---------- Public API ----------

/**
 * Store a session snapshot
 */
export async function storeSessionSnapshot(sessionData, timestamp = Date.now()) {
  if (!sessionData) return;

  try {
    if (useAzure) {
      const partition = getDatePartition();
      const rowKey = `${timestamp}-${sessionData.id || 'unknown'}`;
      const entity = {
        partitionKey: partition,
        rowKey,
        timestamp,
        sessionId: sessionData.id || '',
        agentCount: sessionData.agents?.length || 0,
        edgeCount: sessionData.edges?.length || 0,
        state: JSON.stringify(sessionData),
      };
      await tableClient.upsertEntity(entity, 'Replace');
    } else if (useSQLite) {
      const sqliteDb = db.getSQLiteDb();
      const retentionDays = parseInt(process.env.SESSION_RETENTION_DAYS || '30');
      const expiresAt = timestamp + (retentionDays * 24 * 60 * 60 * 1000);
      const stmt = sqliteDb.prepare(`
        INSERT INTO sessions (id, timestamp, agentCount, edgeCount, state, expiresAt)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        `${timestamp}-${sessionData.id || 'unknown'}`,
        timestamp,
        sessionData.agents?.length || 0,
        sessionData.edges?.length || 0,
        JSON.stringify(sessionData),
        expiresAt
      );
    } else {
      const store = fileLoad();
      const key = `${timestamp}`;
      store[key] = {
        timestamp,
        agentCount: sessionData.agents?.length || 0,
        edgeCount: sessionData.edges?.length || 0,
        state: sessionData,
      };
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
 */
export async function getSessionHistory(startDate, endDate = startDate) {
  try {
    let snapshots = [];

    if (useAzure) {
      const current = new Date(startDate);
      while (current <= endDate) {
        const partition = getDatePartition(current);
        try {
          const entities = tableClient.listEntities({
            queryOptions: { filter: odata`PartitionKey eq ${partition}` },
          });
          for await (const entity of entities) {
            snapshots.push({
              id: entity.sessionId,
              timestamp: entity.timestamp,
              agentCount: entity.agentCount,
              edgeCount: entity.edgeCount,
              state: JSON.parse(entity.state),
            });
          }
        } catch (err) {
          // Partition doesn't exist, continue
        }
        current.setDate(current.getDate() + 1);
      }
    } else if (useSQLite) {
      const sqliteDb = db.getSQLiteDb();
      const startTs = startDate.getTime();
      const endTs = endDate.getTime();
      const stmt = sqliteDb.prepare(
        'SELECT * FROM sessions WHERE timestamp >= ? AND timestamp <= ? ORDER BY timestamp DESC'
      );
      const rows = stmt.all(startTs, endTs);
      snapshots = rows.map(row => ({
        id: row.id,
        timestamp: row.timestamp,
        agentCount: row.agentCount,
        edgeCount: row.edgeCount,
        state: JSON.parse(row.state),
      }));
    } else {
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

    return snapshots.sort((a, b) => b.timestamp - a.timestamp);
  } catch (err) {
    logError(err, { context: 'get_session_history' });
    return [];
  }
}

/**
 * Get session statistics
 */
export async function getSessionStats(startDate = new Date()) {
  try {
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 1);

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
 * Clean up old session records
 */
export async function pruneOldSessions(retentionDays = 30) {
  try {
    if (useAzure) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      const current = new Date();
      current.setDate(current.getDate() - 365);

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
          // Partition doesn't exist
        }
        current.setDate(current.getDate() + 1);
      }

      return { success: true, deletedCount };
    } else if (useSQLite) {
      const sqliteDb = db.getSQLiteDb();
      const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
      const stmt = sqliteDb.prepare('DELETE FROM sessions WHERE expiresAt < ?');
      const result = stmt.run(cutoffMs);
      return { success: true, deletedCount: result.changes };
    } else {
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
