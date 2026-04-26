#!/usr/bin/env node
import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function log(message) {
  console.log(`✅ ${message}`);
}

function warn(message) {
  console.warn(`⚠️ ${message}`);
}

function fail(message) {
  console.error(`❌ ${message}`);
  process.exit(1);
}

function runCommand(cmd) {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 }).toString().trim();
  } catch (err) {
    return null;
  }
}

function loadConfig() {
  const configPath = process.argv[2] || join(__dirname, 'beacon-config.json');
  if (existsSync(configPath)) {
    try {
      return JSON.parse(readFileSync(configPath, 'utf8'));
    } catch {
      warn(`Unable to parse JSON from ${configPath}`);
    }
  }
  return {};
}

async function fetchHealth(url) {
  try {
    const res = await fetch(url, { method: 'GET' });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

async function main() {
  console.log('=== Agent Monitor onboarding check ===');

  const config = loadConfig();
  const instanceId = process.env.INSTANCE_ID || config.instanceId;
  const centralUrl = process.env.CENTRAL_URL || config.centralUrl;
  const beaconSecret = process.env.BEACON_SECRET || config.beaconSecret;
  const pushUrl = process.env.PUSH_URL;
  const pushSecret = process.env.PUSH_SECRET;

  if (!instanceId) fail('Missing INSTANCE_ID (env or beacon-config.json)');
  log(`Instance ID configured: ${instanceId}`);

  if (!centralUrl) fail('Missing CENTRAL_URL (env or beacon-config.json)');
  log(`Central URL configured: ${centralUrl}`);

  if (!beaconSecret) fail('Missing BEACON_SECRET (env or beacon-config.json)');
  log('Beacon secret configured');

  const health = await fetchHealth(`${centralUrl.replace(/\/$/, '')}/api/health`);
  if (!health) fail(`Unable to reach backend health endpoint at ${centralUrl}/api/health`);
  log(`Backend health check OK (${health.ok ? 'ok' : 'not ok'})`);

  if (pushUrl || pushSecret) {
    if (!pushUrl) fail('PUSH_URL is required when PUSH_SECRET is provided');
    if (!pushSecret) fail('PUSH_SECRET is required when PUSH_URL is provided');
    log(`Push settings configured: ${pushUrl}`);
  }

  const openclawVersion = runCommand('openclaw --version');
  if (openclawVersion) {
    log(`OpenClaw command available: ${openclawVersion.split('\n')[0]}`);
  } else {
    warn('OpenClaw command not available on PATH. The beacon may still work if you use a container or a custom command.');
  }

  console.log('---');
  log('Agent onboarding configuration looks good.');
  if (!openclawVersion) {
    warn('Install or expose OpenClaw if you want the local session pusher to work on this machine.');
  }
  process.exit(0);
}

main();
