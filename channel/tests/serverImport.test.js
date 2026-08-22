const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

test('server module loads before the database connection is opened', () => {
  const channelRoot = path.resolve(__dirname, '..');
  const result = spawnSync(process.execPath, ['-e', "require('./src/server')"], {
    cwd: channelRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_ENV: 'production',
      MONGO_URI: 'mongodb://127.0.0.1:27017',
      BILLZ_SECRET_TOKEN: 'test-secret',
      BILLZ_SHOP_ID: 'shop-a',
      MEDICALKA_INBOUND_ENABLED: 'true',
      MEDICALKA_PARTNER_USERNAME: 'test-user',
      MEDICALKA_PARTNER_PASSWORD: 'test-password',
      MEDICALKA_SUBORDERS_ENABLED: 'false',
      SYNC_ON_BOOT: 'false',
    },
  });

  assert.equal(result.status, 0, result.stderr);
});
