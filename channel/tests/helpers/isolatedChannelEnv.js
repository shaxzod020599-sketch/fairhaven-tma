const assert = require('node:assert/strict');

// Load before test fixtures or application imports. Never read channel/.env.
for (const key of Object.keys(process.env)) {
  if (/^(BILLZ_|.*TELEGRAM|MONGO_URI|MONGODB_URI)/.test(key)) {
    assert.ok(!process.env[key], `Live configuration must be absent: ${key}`);
  }
}
require('dotenv').config = () => ({ parsed: {} });
process.env.MONGOMS_RUNTIME_DOWNLOAD = 'false';

const localFetch = globalThis.fetch;
globalThis.fetch = (input, options) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), 'Tests may fetch only loopback URLs');
  return localFetch(input, { ...options, redirect: 'error' });
};
