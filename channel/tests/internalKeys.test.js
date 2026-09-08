const assert = require('node:assert/strict');
const test = require('node:test');

process.env.BILLZ_SECRET_TOKEN = 'test-secret';
process.env.BILLZ_SHOP_ID = 'shop-a';
process.env.MONGO_DB_NAME = 'keys-test';
process.env.SYNC_ON_BOOT = 'false';
process.env.CHANNEL_TELEGRAM_ENABLED = 'false';
process.env.DISABLE_RATE_LIMIT = 'true';
process.env.CHANNEL_INTERNAL_TOKEN = 'internal-token-0123456789abcdef';

let mongod;
let db;
let server;
let base;
let ChannelKey;

/**
 * Issuing and revoking marketplace credentials from the panel.
 *
 * Two properties are the whole point. A secret exists in exactly one response
 * and is never stored in a form that can be read back — so no endpoint, log or
 * backup can leak one later. And a revocation takes effect on the next request,
 * not when a token would have expired anyway.
 */
test.before(async () => {
  const { MongoMemoryServer } = require(
    '/Users/tm/Projects/project vitamin delivery/backend/node_modules/mongodb-memory-server'
  );
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();

  db = require('../src/db');
  await db.connect();
  ChannelKey = require('../src/models/ChannelKey');

  const { app } = require('../src/server');
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  server?.close();
  await db.disconnect();
  await mongod?.stop();
});

async function call(method, path, { body, token = process.env.CHANNEL_INTERNAL_TOKEN } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(token === null ? {} : { 'X-Internal-Token': token }),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

/* ── The guard ───────────────────────────────────────────────────────────── */

test('the internal surface refuses a request with no token', async () => {
  const res = await call('GET', '/internal/keys', { token: null });
  assert.equal(res.status, 401);
});

test('a wrong token is refused, whatever its length or encoding', async () => {
  const attempts = [
    '',
    'x',
    'x'.repeat(500),
    'internal-token-0123456789abcde',      // one character short
    // Same character count as the real token, more bytes. This is the shape
    // that used to crash the process: `timingSafeEqual` throws on unequal byte
    // lengths, and the throw escaped an async handler as an unhandled
    // rejection. Hashing both sides first is what fixed it.
    'internal-token-0123456789abcdéf',
  ];
  for (const attempt of attempts) {
    const res = await call('GET', '/internal/keys', { token: attempt });
    assert.equal(res.status, 401, `accepted ${JSON.stringify(attempt)}`);
  }
});

/* ── Issuing ─────────────────────────────────────────────────────────────── */

test('a Medicalka token is returned once and stored only as a hash', async () => {
  const res = await call('POST', '/internal/keys', {
    body: { channel: 'medicalka', kind: 'token', label: 'prod' },
  });

  assert.equal(res.status, 200);
  assert.match(res.body.key, /^fhm_t_[\w-]{43}$/);

  const stored = await ChannelKey().findById(res.body.id).lean();
  assert.equal(stored.hash, ChannelKey.hashKey(res.body.key));
  assert.equal(stored.hash.includes(res.body.key), false, 'the plaintext must not be recoverable');

  // And there is no route that can hand it back.
  const listed = await call('GET', '/internal/keys');
  const row = listed.body.keys.find((k) => k.id === res.body.id);
  assert.equal('key' in row, false);
  assert.equal('hash' in row, false);
  assert.equal(row.fingerprint, `fhm_t…${res.body.key.slice(-4)}`);
});

test('a Uzum client gets an id in the clear and a hashed secret', async () => {
  // The id is an identifier they send on every token request and we look up by
  // it — a hash could not be searched for. The secret is the only secret.
  const res = await call('POST', '/internal/keys', {
    body: { channel: 'uzum', kind: 'oauth', label: 'prod' },
  });

  assert.equal(res.status, 200);
  assert.match(res.body.clientId, /^fhu_id_[\w-]{16}$/);
  assert.match(res.body.clientSecret, /^fhu_o_[\w-]{43}$/);

  const stored = await ChannelKey().findById(res.body.id).lean();
  assert.equal(stored.clientId, res.body.clientId);
  assert.equal(stored.hash, ChannelKey.hashKey(res.body.clientSecret));
});

test('two keys issued in a row are different', async () => {
  const a = await call('POST', '/internal/keys', { body: { channel: 'medicalka', kind: 'secret' } });
  const b = await call('POST', '/internal/keys', { body: { channel: 'medicalka', kind: 'secret' } });
  assert.notEqual(a.body.key, b.body.key);
});

test('a Medicalka pair is issued together and may revoke the old pair', async () => {
  const old = await call('POST', '/internal/keys', {
    body: { channel: 'medicalka', kind: 'token', label: 'old connection' },
  });

  const res = await call('POST', '/internal/keys/pair', {
    body: { label: 'new connection', revokeOld: true },
  });

  assert.equal(res.status, 200);
  assert.match(res.body.token, /^fhm_t_[\w-]{43}$/);
  assert.match(res.body.secret, /^fhm_s_[\w-]{43}$/);
  assert.notEqual(res.body.tokenId, res.body.secretId);

  const [token, secret, previous] = await Promise.all([
    ChannelKey().findById(res.body.tokenId).lean(),
    ChannelKey().findById(res.body.secretId).lean(),
    ChannelKey().findById(old.body.id).lean(),
  ]);
  assert.equal(token.hash, ChannelKey.hashKey(res.body.token));
  assert.equal(secret.hash, ChannelKey.hashKey(res.body.secret));
  assert.equal(previous.active, false);
});

test('issuing a normal Medicalka pair keeps every existing key active', async () => {
  const oldToken = await call('POST', '/internal/keys', {
    body: { channel: 'medicalka', kind: 'token', label: 'Medicalka production' },
  });
  const oldSecret = await call('POST', '/internal/keys', {
    body: { channel: 'medicalka', kind: 'secret', label: 'Medicalka production' },
  });

  const pair = await call('POST', '/internal/keys/pair', {
    body: { label: 'additional connection' },
  });

  assert.equal(pair.status, 200);
  const [token, secret] = await Promise.all([
    ChannelKey().findById(oldToken.body.id).lean(),
    ChannelKey().findById(oldSecret.body.id).lean(),
  ]);
  assert.equal(token.active, true);
  assert.equal(secret.active, true);
});

test('a kind that does not belong to a channel is refused', async () => {
  // Uzum has no read token; Medicalka has no OAuth client. Issuing one would
  // produce a credential that authenticates nothing.
  const wrongForUzum = await call('POST', '/internal/keys', {
    body: { channel: 'uzum', kind: 'token' },
  });
  const wrongForMedicalka = await call('POST', '/internal/keys', {
    body: { channel: 'medicalka', kind: 'oauth' },
  });

  assert.equal(wrongForUzum.status, 422);
  assert.equal(wrongForMedicalka.status, 422);
});

test('an unknown channel is refused', async () => {
  const res = await call('POST', '/internal/keys', { body: { channel: 'unknown', kind: 'token' } });
  assert.equal(res.status, 422);
  assert.match(res.body.error, /medicalka, uzum/);
});

/* ── Revoking ────────────────────────────────────────────────────────────── */

test('a revoked key stops authenticating immediately', async () => {
  const issued = await call('POST', '/internal/keys', {
    body: { channel: 'medicalka', kind: 'token', label: 'to revoke' },
  });

  const live = await fetch(`${base}/medicalka/v1/pharmacies?token=${issued.body.key}`);
  assert.equal(live.status, 200);

  const revoked = await call('POST', `/internal/keys/${issued.body.id}/revoke`);
  assert.equal(revoked.status, 200);

  const dead = await fetch(`${base}/medicalka/v1/pharmacies?token=${issued.body.key}`);
  assert.equal(dead.status, 403, 'a known but disabled key is forbidden, not unknown');
});

test('revoking twice reports that there was nothing to revoke', async () => {
  const issued = await call('POST', '/internal/keys', {
    body: { channel: 'medicalka', kind: 'token' },
  });
  await call('POST', `/internal/keys/${issued.body.id}/revoke`);
  const second = await call('POST', `/internal/keys/${issued.body.id}/revoke`);

  assert.equal(second.status, 404);
});

test('revoking an id that does not exist is a 404, not a crash', async () => {
  const res = await call('POST', '/internal/keys/507f1f77bcf86cd799439011/revoke');
  assert.equal(res.status, 404);
});

test('a malformed id is refused without taking the process down', async () => {
  const res = await call('POST', '/internal/keys/not-an-id/revoke');
  assert.ok([404, 500].includes(res.status));
  // The service is still answering.
  const health = await fetch(`${base}/health`);
  assert.equal(health.status, 200);
});

test('revoking one key leaves the others alone', async () => {
  const keep = await call('POST', '/internal/keys', { body: { channel: 'medicalka', kind: 'token' } });
  const drop = await call('POST', '/internal/keys', { body: { channel: 'medicalka', kind: 'token' } });

  await call('POST', `/internal/keys/${drop.body.id}/revoke`);

  const still = await fetch(`${base}/medicalka/v1/pharmacies?token=${keep.body.key}`);
  assert.equal(still.status, 200);
});
