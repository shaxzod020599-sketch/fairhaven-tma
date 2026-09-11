const test = require('node:test'); const assert = require('node:assert/strict');
const mongoose = require('mongoose'); const express = require('express'); const cookieParser = require('cookie-parser');
const http = require('node:http'); const { MongoMemoryServer } = require('mongodb-memory-server');
process.env.ADMIN_ORIGIN = 'http://admin.localhost'; process.env.TMA_ORIGIN = 'http://mini.localhost';
const User = require('../models/User'); const session = require('../services/adminSession'); const hub = require('../utils/channelHub');
let mongod, server, base, auth, calls, reply;
const id = '111111111111111111111111';
test.before(async () => {
  mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri());
  const app = express(); app.use(express.json(), cookieParser()); app.use('/api/admin', require('../routes/adminRoutes'));
  server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api/admin/channels/connections`;
});
test.beforeEach(async t => {
  await User.deleteMany({}); const admin = await User.create({ telegramId: 123, role: 'admin' });
  let cookie; const s = await session.issueSession({ admin, req: { hostname: 'admin.localhost', headers: {} }, res: { cookie(n, v) { cookie = `${n}=${v}`; } } });
  auth = { cookie, 'X-FH-CSRF': s.csrfToken }; calls = [];
  reply = { ok: true, body: { id, channel: 'uzum', clientId: 'client', clientSecret: 'synthetic-secret', encryptedSecret: 'must-not-leak' } };
  t.mock.method(hub, 'requestInternal', async (...args) => { calls.push(args); return reply; });
});
test.after(async () => { if (server) await new Promise(r => server.close(r)); await mongoose.disconnect(); await mongod?.stop(); });
async function call(method, path, body = {}, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = method === 'GET' ? undefined : JSON.stringify(body);
    const req = http.request(base + path, { method, headers: { host: 'admin.localhost', origin: 'http://admin.localhost', ...auth,
      'Content-Type': 'application/json', ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}), ...headers } }, res => {
      let text = ''; res.on('data', x => { text += x; }); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text, body: (() => { try { return JSON.parse(text); } catch { return null; } })() }));
    }); req.on('error', reject); req.end(data);
  });
}
test('reveal needs admin host, current admin, session and CSRF', async () => {
  for (const headers of [{ cookie: '' }, { 'X-FH-CSRF': '' }, { host: 'mini.localhost' }, { origin: 'https://evil.example' }]) {
    const result = await call('POST', `/${id}/reveal`, {}, headers);
    assert.ok((headers.host ? [421] : [401, 403]).includes(result.status));
  }
  assert.equal(calls.length, 0);
  await User.updateOne({ telegramId: 123 }, { $set: { role: 'user' } });
  assert.ok([401, 403].includes((await call('POST', `/${id}/reveal`)).status)); assert.equal(calls.length, 0);
});
test('reveal is no-store, strips extra fields and rejects untrusted paths', async () => {
  const r = await call('POST', `/${id}/reveal`); assert.equal(r.status, 200);
  assert.match(r.headers['cache-control'], /no-store/); assert.equal(r.body.data.clientSecret, 'synthetic-secret');
  assert.equal(r.text.includes('must-not-leak'), false);
  for (const bad of ['x', '%2e%2e%2fmedicalka', `${id}%0A`]) assert.equal((await call('POST', `/${bad}/reveal`)).status, 422);
  assert.equal(calls.length, 1);
});
test('upstream failures never echo credentials and restore whitelists body', async () => {
  reply = { ok: false, status: 503, body: { error: 'synthetic-secret' } };
  const failed = await call('POST', `/${id}/reveal`); assert.equal(failed.status, 503); assert.equal(failed.text.includes('synthetic-secret'), false);
  reply = { ok: true, body: { saved: true } };
  assert.equal((await call('PUT', `/${id}/secret`, { clientSecret: 'matching-secret', hash: 'spoof', active: true })).status, 200);
  assert.deepEqual(calls.at(-1), ['PUT', ['internal', 'connections', id, 'secret'], { body: { clientSecret: 'matching-secret' } }]);
});
