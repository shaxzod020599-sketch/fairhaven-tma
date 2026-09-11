const test = require('node:test');
const assert = require('node:assert/strict');
process.env.BILLZ_SECRET_TOKEN = 'test-only';
process.env.BILLZ_SHOP_ID = 'test-shop';
process.env.MONGO_DB_NAME = 'retail-connections-test';
process.env.SYNC_ON_BOOT = 'false';
process.env.CHANNEL_TELEGRAM_ENABLED = 'false';
process.env.DISABLE_RATE_LIMIT = 'true';
process.env.CHANNEL_INTERNAL_TOKEN = 'synthetic-internal-token-at-least-32-bytes';
let mongod, db, server, base, Keys;
test.before(async () => {
  const { MongoMemoryServer } = require('../../backend/node_modules/mongodb-memory-server');
  mongod = await MongoMemoryServer.create(); process.env.MONGO_URI = mongod.getUri();
  db = require('../src/db'); await db.connect(); Keys = require('../src/models/ChannelKey');
  server = require('../src/server').app.listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}/internal`;
});
test.after(async () => { if (server) await new Promise(r => server.close(r)); await db?.disconnect(); await mongod?.stop(); });
async function call(method, path, body, token = process.env.CHANNEL_INTERNAL_TOKEN) {
  const r = await fetch(base + path, { method, headers: { 'X-Internal-Token': token, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: r.status, headers: r.headers, body: await r.json().catch(() => null) };
}
test('metadata is guarded, groups both channels and does not invent an active place', async () => {
  assert.equal((await call('GET', '/connections', null, 'wrong')).status, 401);
  const r = await call('GET', '/connections');
  assert.equal(r.status, 200); assert.equal(r.body.place, '');
  assert.deepEqual(r.body.channels.map(x => [x.channel, x.host, x.enabled]), [
    ['uzum', 'https://api.fairhaven.uz/uzum', false], ['yandex', 'https://api.fairhaven.uz/yandex', false],
  ]);
});
test('common handoff place persists but does not enable or change runtime mappings', async () => {
  for (const place of ['', '../x', ['store'], 'x'.repeat(65)]) assert.equal((await call('PUT', '/connections/place', { place })).status, 422);
  assert.equal((await call('PUT', '/connections/place', { place: 'fairhaven-store-1' })).status, 200);
  const r = await call('GET', '/connections'); assert.equal(r.body.place, 'fairhaven-store-1');
  assert.ok(r.body.channels.every(x => !x.enabled && !x.placeConfigured));
});
test('new OAuth secret is encrypted, omitted from lists and explicitly revealable', async () => {
  for (const channel of ['uzum', 'yandex']) {
    const issued = await call('POST', '/keys', { channel, kind: 'oauth' });
    assert.equal(issued.status, 200);
    const stored = await Keys().findById(issued.body.id).select('+encryptedSecret').lean();
    assert.ok(stored.encryptedSecret); assert.equal(JSON.stringify(stored).includes(issued.body.clientSecret), false);
    const list = await call('GET', '/connections');
    assert.equal(JSON.stringify(list.body).includes(issued.body.clientSecret), false);
    assert.equal(JSON.stringify(list.body).includes(stored.encryptedSecret), false);
    const reveal = await call('POST', `/connections/${issued.body.id}/reveal`, {});
    assert.equal(reveal.status, 200); assert.equal(reveal.body.clientSecret, issued.body.clientSecret);
    assert.match(reveal.headers.get('cache-control'), /no-store/);
    await call('POST', `/keys/${issued.body.id}/revoke`, {});
    assert.equal((await call('POST', `/connections/${issued.body.id}/reveal`, {})).status, 404);
  }
});
test('restoring existing secret cannot rotate credentials or expose Medicalka', async () => {
  const secret = 'synthetic-old-secret-123';
  const key = await Keys().create({ channel: 'uzum', kind: 'oauth', clientId: 'old-client', hash: Keys.hashKey(secret), active: true });
  assert.equal((await call('POST', `/connections/${key.id}/reveal`, {})).status, 409);
  assert.equal((await call('PUT', `/connections/${key.id}/secret`, { clientSecret: 'wrong-secret' })).status, 422);
  assert.equal((await call('PUT', `/connections/${key.id}/secret`, { clientSecret: secret })).status, 200);
  const same = await Keys().findById(key.id).lean(); assert.equal(same.hash, Keys.hashKey(secret)); assert.equal(same.active, true);
  assert.equal((await call('POST', `/connections/${key.id}/reveal`, {})).body.clientSecret, secret);
  const medicalka = await call('POST', '/keys', { channel: 'medicalka', kind: 'token' });
  assert.equal((await call('PUT', `/connections/${medicalka.body.id}/secret`, { clientSecret: medicalka.body.key })).status, 404);
  assert.equal((await call('POST', `/connections/${medicalka.body.id}/reveal`, {})).status, 404);
  assert.equal((await Keys().findById(medicalka.body.id).select('+encryptedSecret').lean()).encryptedSecret, undefined);
});
test('ciphertext cannot be moved between clients or corrupted into a returned value', async () => {
  const a = await call('POST', '/keys', { channel: 'uzum', kind: 'oauth' });
  const b = await call('POST', '/keys', { channel: 'yandex', kind: 'oauth' });
  const row = await Keys().findById(a.body.id).select('+encryptedSecret').lean();
  await Keys().updateOne({ _id: b.body.id }, { $set: { encryptedSecret: row.encryptedSecret } });
  const r = await call('POST', `/connections/${b.body.id}/reveal`, {});
  assert.equal(r.status, 503); assert.equal(JSON.stringify(r.body).includes(a.body.clientSecret), false);
});
test('operator restore refuses wrong bundle before requests and preserves original hash', async () => {
  const { restore } = require('../scripts/restore-retail-copy');
  await assert.rejects(() => restore({ clientId: 'other' }, () => assert.fail('no request allowed')));
  const bundle = { clientId: 'fhu_id_99be68fa7282def81d6c87ce', clientSecret: 'synthetic-restored-original', place: '6d2c8ecc-e818-4812-9b34-146c6f312f56' };
  const key = await Keys().create({ channel: 'uzum', kind: 'oauth', clientId: bundle.clientId, hash: Keys.hashKey(bundle.clientSecret), active: true });
  const request = async (method, path, body) => {
    const r = await call(method, `/connections${path}`, body);
    assert.equal(r.status, 200); return r.body;
  };
  await assert.rejects(() => restore(bundle, request), /target_mismatch/);
  assert.equal((await Keys().findById(key.id).select('+encryptedSecret').lean()).encryptedSecret, undefined);
  await call('PUT', '/connections/place', { place: bundle.place });
  await restore(bundle, request);
  const stored = await Keys().findById(key.id).select('+encryptedSecret').lean();
  assert.equal(stored.hash, Keys.hashKey(bundle.clientSecret)); assert.equal(stored.active, true); assert.ok(stored.encryptedSecret);
});
