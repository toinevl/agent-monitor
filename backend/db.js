/**
 * db.js — Database configuration
 * Supports: Azure Table Storage (production) + JSON fallback (dev/testing)
 */

import { TableClient, TableServiceClient } from '@azure/data-tables';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { logger } from './logger.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dir, '../data');

// ---------- Backend selection ----------

const CONNECTION_STRING_SET = !!process.env.AZURE_STORAGE_CONNECTION_STRING;
let USE_AZURE = CONNECTION_STRING_SET;
let USE_JSON = !USE_AZURE; // Fallback

logger.info(
  {
    backend: USE_AZURE ? 'Azure Table Storage' : 'JSON (dev/testing)',
  },
  '[db] Storage backend selected'
);

// ---------- Azure Table Storage setup ----------

let azureTableClients = {};

if (USE_AZURE) {
  try {
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    const serviceClient = TableServiceClient.fromConnectionString(connectionString);

    // Create tables if they don't exist
    const tableNames = ['OpenClawInstances', 'AgentSessions'];
    for (const tableName of tableNames) {
      serviceClient.createTable(tableName).catch(() => {
        // Ignore "already exists" errors
      });
      azureTableClients[tableName] = TableClient.fromConnectionString(connectionString, tableName);
    }

    logger.info(`Azure Table Storage: ${tableNames.length} tables ready`);
  } catch (err) {
    logger.error(err, 'Failed to initialize Azure Table Storage, falling back to JSON');
    azureTableClients = {};
    USE_AZURE = false;
    USE_JSON = true;
    // Don't exit — fall back to JSON storage so server keeps running
  }
}

// ---------- Public API ----------

export const db = {
  isAzure: USE_AZURE,
  isJSON: USE_JSON,

  getTableClient(tableName) {
    if (!USE_AZURE) throw new Error('Azure not configured; set AZURE_STORAGE_CONNECTION_STRING');
    return azureTableClients[tableName];
  },

  getConfig() {
    return {
      backend: USE_AZURE ? 'Azure Table Storage' : 'JSON',
      dataDir: DATA_DIR,
    };
  },
};

export default db;
