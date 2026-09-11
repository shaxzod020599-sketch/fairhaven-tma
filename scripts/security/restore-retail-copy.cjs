'use strict';
// Explicit operator request: restore the already-issued Uzum secret, never rotate.
const { spawnSync } = require('node:child_process');
try {
  const input = process.env.UZUM_CONNECTION_JSON;
  if (!input || input.length > 16384) throw new Error();
  const env = { HOME: process.env.HOME, PATH: '/usr/bin:/bin' };
  if (process.env.SSH_AUTH_SOCK) env.SSH_AUTH_SOCK = process.env.SSH_AUTH_SOCK;
  const result = spawnSync('/usr/bin/ssh', ['-T', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', '-o', 'StrictHostKeyChecking=yes',
    'movixa-bridge2@95.182.119.86', 'cd /home/movixa-bridge2/fairhaven-tma/channel && node scripts/restore-retail-copy.js'],
  { input, env, encoding: 'utf8', timeout: 30000, maxBuffer: 65536 });
  if (result.status !== 0) throw new Error();
  console.log('Existing Uzum copy restored; no keys rotated');
} catch (_) { console.error('Copy restore not confirmed; inspect without credentials before retry'); process.exitCode = 1; }
