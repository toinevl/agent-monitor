/**
 * db.js — Database configuration and initialization
 * Supports: Azure Table Storage (production), SQLite (dev), JSON files (fallback)
 */

import { TableClient, TableServiceClient } from '@azure/data-tables';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import Database from 'better-sqlite3';
import { logger } from './logger.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dir, '../data');

// ---------- Backend selection ----------

const USE_AZURE = !!process.env.AZURE_STORAGE_CONNECTION_STRING;
const USE_SQLITE = process.env.DB_ENGINE === 'sqlite' || (!USE_AZURE && process.env.NODE_ENV === 'development');
const USE_JSON = !USE_AZURE && !USE_SQLITE; // Fallback

logger.info(
  {
    useAzure: USE_AZURE,
    useSQLite: USE_SQLITE,
    useJson: USE_JSON,
  },
  `[db] Storage backend selected`
);

// ---------- Azure Table Storage setup ----------

let azureServiceClient = null;
let azureTableClients = {};

if (USE_AZURE) {
  try {
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    azureServiceClient = new TableServiceClient(connectionString);

    // Create tables if they don't exist
    const tableNames = ['OpenClawInstances', 'AgentSessions'];
    for (const tableName of tableNames) {
      azureServiceClient.createTable(tableName).catch(() => {
        // Ignore "already exists" errors
      });
      azureTableClients[tableName] = new TableClient(connectionString, tableName);
    }

    logger.info(`[db] Azure Table Storage initialized with ${tableNames.length} tables`);
  } catch (err) {
    logger.error(err, '[db] Failed to initialize Azure Table Storage');
    process.exit(1);
  }
}

// ---------- SQLite setup ----------

let sqliteDb = null;

if (USE_SQLITE) {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

    const dbPath = join(DATA_DIR, 'agent-monitor.db');
    sqliteDb = new Database(dbPath);
    sqliteDb.pragma('journal_mode = WAL'); // Write-Ahead Logging for concurrency

    // Initialize schema
    sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS instances (
        instanceId TEXT PRIMARY KEY,
        label TEXT,
        version TEXT,
        model TEXT,
        host TEXT,
        channel TEXT,
        agents TEXT,
        activeSessions INTEGER,
        plugins TEXT,
        uptime INTEGER,
        lastSeenAt INTEGER,
        createdAt INTEGER DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        timestamp INTEGER,
        agentCount INTEGER,
        edgeCount INTEGER,
        state TEXT,
        createdAt INTEGER DEFAULT CURRENT_TIMESTAMP,
        expiresAt INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_timestamp ON sessions(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_sessions_expiresAt ON sessions(expiresAt);
    `);

    logger.info(`[db] SQLite initialized at ${dbPath}`);
  } catch (err) {
    logger.error(err, '[db] Failed to initialize SQLite');
    process.exit(1);
  }
}

// ---------- Public API ----------

export const db = {
  // Database type
  isAzure: USE_AZURE,
  isSQLite: USE_SQLITE,
  isJSON: USE_JSON,

  // Get table client (Azure only)
  getTableClient(tableName) {
    if (!USE_AZURE) throw new Error('Azure not configured');
    return azureTableClients[tableName];
  },

  // Get SQLite connection
  getSQLiteDb() {
    if (!USE_SQLITE) throw new Error('SQLite not configured');
    return sqliteDb;
  },

  // Close connections gracefully
  close() {
    if (sqliteDb) {
      sqliteDb.close();
      logger.info('[db] SQLite connection closed');
    }
  },

  // Get info about current config
  getConfig() {
    return {
      backend: USE_AZURE ? 'Azure' : USE_SQLITE ? 'SQLite' : 'JSON',
      dataDir: DATA_DIR,
      azureEnabled: USE_AZURE,
      sqliteEnabled: USE_SQLITE,
    };
  },
};

export default db;
