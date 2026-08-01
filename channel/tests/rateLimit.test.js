const assert = require('node:assert/strict');
const test = require('node:test');

process.env.BILLZ_SECRET_TOKEN = 'test-secret';
process.env.BILLZ_SHOP_ID = 'shop-a';
process.env.MONGO_DB_NAME = 'ratelimit-test';
process.env.SYNC_ON_BOOT = 'false';
process.env.CHANNEL_TELEGRAM_ENABLED = 'false';
process.env.CHANNEL_INTERNAL_TOKEN = 'internal-token-0123456789abcdef';
// Deliberately tiny so the boundary is reachable without thousands of requests.
process.env.RATE_LIMIT_CHANNEL_AUTH_MAX = '5';
process.env.RATE_LIMIT_CHANNEL_MAX = '1000';
delete process.env.DISABLE_RATE_LIMIT;

let mongod;
let db;
let server;
let base;
let token;

/**
 * Inbound limits.
 *
 * The rule that matters is which requests count. A limiter named for
 * authentication failures that in fact counts every request is not a security
 * control, it is an outage waiting for the first busy day: Uzum's own contract
 * asks for a status check per open order per minute, which passes sixty in five
 * minutes with ten orders open.
 */
test.before(async () => {
  const { MongoMemoryServer } = require(
    '/Users/tm/Projects/project vitamin delivery/backend/node_modules/mongodb-memory-server'
  );
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();

  db = require('../src/db');
  await db.connect();

  const ChannelKey = require('../src/models/ChannelKey');
  token = ChannelKey.generateKey('medicalka', 'token');
  const shape = ChannelKey.describeKey(token);
  await ChannelKey().create({
    channel: 'medicalka', kind: 'token', hash: ChannelKey.hashKey(token),
    prefix: shape.prefix, last4: shape.last4, active: true,
  });

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

test('a polling integrator is never cut off by the auth-failure limiter', async () => {
  // Well past the failure budget of 5, all authenticated.
  for (let i = 0; i < 25; i += 1) {
    const res = await fetch(`${base}/medicalka/v1/pharmacies?token=${token}`);
    assert.equal(res.status, 200, `refused on request ${i + 1}`);
  }
});

test('repeated bad keys are cut off', async () => {
  const seen = [];
  for (let i = 0; i < 12; i += 1) {
    const res = await fetch(`${base}/medicalka/v1/pharmacies?token=fhm_t_${'x'.repeat(43)}`);
    seen.push(res.status);
  }

  assert.ok(seen.includes(401), 'the first guesses are answered normally');
  assert.ok(seen.includes(429), 'a guessing loop is eventually refused');
  assert.equal(seen.at(-1), 429);
});

test('once an IP has flooded, everything from it is throttled', async () => {
  // Documented rather than celebrated: the limiter is keyed per IP, so a
  // marketplace sharing an egress address with a broken script loses its good
  // traffic too. That collateral is why the real budget is 300 rejections per
  // five minutes and not the 5 this file forces — a rate no integrator having a
  // bad morning reaches, and one that still stops a flood at one per second.
  const res = await fetch(`${base}/medicalka/v1/pharmacies?token=${token}`);
  assert.equal(res.status, 429);
});

test('the shipped budgets clear the polling schedules the contracts ask for', () => {
  // Loaded without the tiny override this file sets, so these are the numbers
  // that ship.
  const previous = process.env.RATE_LIMIT_CHANNEL_AUTH_MAX;
  delete process.env.RATE_LIMIT_CHANNEL_AUTH_MAX;
  delete require.cache[require.resolve('../src/middleware/rateLimit')];
  const { LIMITS } = require('../src/middleware/rateLimit');
  if (previous !== undefined) process.env.RATE_LIMIT_CHANNEL_AUTH_MAX = previous;

  // Uzum's own contract: availability every 5 minutes, catalogue hourly, and a
  // status check per open order per minute. Fifty open orders is a good day.
  const uzumPerMinute = 50 + 1;
  assert.ok(
    LIMITS.channelPerMinute > uzumPerMinute * 2,
    `${LIMITS.channelPerMinute}/min leaves no headroom over ${uzumPerMinute}/min of contracted polling`
  );

  // The failure budget is about database load, not key discovery — 256-bit
  // keys are not guessed at any rate — so it must sit far above an integrator
  // having a bad morning behind a shared egress IP.
  assert.ok(
    LIMITS.authFailuresPerFiveMinutes >= 300,
    'too tight a failure budget takes a marketplace down for someone else’s broken script'
  );
});
