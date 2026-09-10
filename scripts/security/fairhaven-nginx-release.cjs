'use strict';

// Authorized release operations only. Password travels on SSH stdin, never argv.
const { spawnSync } = require('node:child_process');
const commands = {
  check: '/usr/sbin/nginx -t',
  install: '/usr/bin/install -m 644 /home/movixa-bridge2/fairhaven-retail-candidate-20260909.XwDi4L/source/deploy/nginx/api.fairhaven.uz /etc/nginx/sites-available/api.fairhaven.uz',
  reload: '/usr/sbin/nginx -s reload',
  rollback: '/usr/bin/install -m 644 /home/movixa-bridge2/fairhaven-retail-candidate-20260909.XwDi4L/nginx-before /etc/nginx/sites-available/api.fairhaven.uz',
};
function execute(mode, { password, env = process.env, spawn = spawnSync } = {}) {
  if (!Object.hasOwn(commands, mode) || typeof password !== 'string' || !password || /[\r\n\0]/.test(password)) {
    throw new Error('invalid release operation or credential');
  }
  const childEnv = { PATH: '/usr/bin:/bin:/usr/local/bin', HOME: env.HOME };
  if (env.SSH_AUTH_SOCK) childEnv.SSH_AUTH_SOCK = env.SSH_AUTH_SOCK;
  return spawn('/usr/bin/ssh', ['-T', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', '-o', 'StrictHostKeyChecking=yes',
    'movixa-bridge2@95.182.119.86', `sudo -S -p '' ${commands[mode]}`], {
    input: `${password}\n`, env: childEnv, encoding: 'utf8', timeout: 30000, maxBuffer: 65536,
  });
}
if (require.main === module) {
  try {
    const result = execute(process.argv[2], { password: process.env.SUDO_PASSWORD });
    // Never relay arbitrary remote diagnostics to a credential-bearing log.
    if (result.status !== 0) console.error('nginx release operation failed; inspect server configuration without credentials');
    else console.log(`nginx ${process.argv[2]} succeeded`);
    process.exitCode = result.status === 0 ? 0 : 1;
  } catch { console.error('nginx release operation refused'); process.exitCode = 1; }
}
module.exports = { execute };
