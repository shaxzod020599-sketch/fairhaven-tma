const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const express = require('express');
const cookieParser = require('cookie-parser');
const http = require('node:http');
const { MongoMemoryServer } = require('mongodb-memory-server');
process.env.ADMIN_ORIGIN = 'http://admin.localhost';
process.env.TMA_ORIGIN = 'http://mini.localhost';
const User = require('../models/User');
const session = require('../services/adminSession');
const hub = require('../utils/channelHub');
const id = '11111111-1111-4111-8111-111111111111';
let mongod; let server; let base; let auth; let calls; let reply;
test.before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { dbName: 'yandex-actions' });
  const app = express(); app.use(express.json(), cookieParser());
  app.use('/api/admin', require('../routes/adminRoutes'));
  app.use((_req, res) => res.status(404).json({ error: 'not_found' }));
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/api/admin/yandex`;
});
test.beforeEach(async (t) => {
  await User.deleteMany({});
  const admin = await User.create({ telegramId: 77, role: 'admin', firstName: 'Ali' });
  let cookie;
  const issued = await session.issueSession({ admin, req: { hostname: 'admin.localhost', headers: {} },
    res: { cookie(name, value) { cookie = `${name}=${value}`; } } });
  auth = { cookie, 'X-FH-CSRF': issued.csrfToken };
  calls = []; reply = { ok: true, body: { order: { id }, idempotent: false } };
  t.mock.method(hub, 'requestInternal', async (...args) => { calls.push(args); return reply; });
});
test.after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect(); await mongod?.stop();
});
async function call(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? undefined : JSON.stringify(body);
    const req = http.request(`${base}${path}`, { method,
      headers: { host: 'admin.localhost', origin: 'http://admin.localhost', ...auth, 'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}), ...headers },
    }, (res) => {
      let text = ''; res.setEncoding('utf8'); res.on('data', (part) => { text += part; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(text) }); } catch (error) { reject(error); }
      });
    });
    req.on('error', reject); req.end(data);
  });
}
test('Yandex list/detail/products use bounded queries and channelHub segments', async () => {
  assert.equal((await call('GET', '/orders')).status, 200);
  assert.deepEqual(calls[0], ['GET', ['internal', 'yandex', 'orders'], { query: { bucket: 'active', page: 1, limit: 30 } }]);
  assert.equal((await call('GET', '/orders?bucket=all&page=100000&limit=100')).status, 200);
  assert.equal((await call('GET', `/orders/${id}`)).status, 200);
  assert.deepEqual(calls[2].slice(0, 2), ['GET', ['internal', 'yandex', 'orders', id]]);
  assert.equal((await call('GET', '/products?search=A%26%2F%3F%23%F0%9F%98%80&limit=100')).status, 200);
  assert.deepEqual(calls[3][2], { query: { search: 'A&/?#😀', limit: 100 } });
  assert.equal(hub.buildPath(calls[3][1], calls[3][2].query), '/internal/yandex/products?search=A%26%2F%3F%23%F0%9F%98%80&limit=100');
});
test('Yandex routes reject query coercion, overflow and encoded foreign paths before transport', async () => {
  for (const path of ['/orders?page=100001', '/orders?page=0', '/orders?page=1.5', '/orders?page=1e2',
    '/orders?page=9007199254740992', '/orders?page[]=1', '/orders?page[x]=1', '/orders?page=1&page=2',
    '/orders?limit=101', '/orders?limit=', '/orders?bucket[]=active', '/orders?bucket=done', '/orders?alien=1',
    '/products?search[x]=a', '/products?search[]=a', `/products?search=${'x'.repeat(121)}`, '/products?limit=0',
    `/orders/${encodeURIComponent('../medicalka')}`, `/orders/${id}%0A`, '/orders/%5Bobject%20Object%5D']) {
    assert.equal((await call('GET', path)).status, 422, path);
  }
  assert.equal(calls.length, 0);
});
test('panel forwards only trusted actor and picked ids/quantities with displayed revisions', async () => {
  for (const action of ['accept', 'cooking', 'ready', 'reject']) {
    const result = await call('POST', `/orders/${id}/decision`, { action, expectedRevision: Number.MAX_SAFE_INTEGER,
      expectedItemsRevision: 2, reason: ' operator ', actor: { telegramId: 999 }, role: 'admin' });
    assert.equal(result.status, 200);
    assert.deepEqual(calls.at(-1), ['POST', ['internal', 'yandex', 'orders', id, 'decision'], { body: {
      action, expectedRevision: Number.MAX_SAFE_INTEGER, expectedItemsRevision: 2, reason: 'operator',
      actor: { type: 'admin-panel', telegramId: 77, name: 'Ali' },
    } }]);
  }
  assert.equal((await call('PUT', `/orders/${id}/items`, { items: [{ billzProductId: 'p', quantity: 2 }],
    expectedItemsRevision: 3, actor: ['spoof'], role: 'admin' })).status, 200);
  assert.deepEqual(calls.at(-1), ['PUT', ['internal', 'yandex', 'orders', id, 'items'], { body: {
    items: [{ billzProductId: 'p', quantity: 2 }], expectedItemsRevision: 3, reason: '',
    actor: { type: 'admin-panel', telegramId: 77, name: 'Ali' },
  } }]);
  assert.equal((await call('PUT', `/orders/${id}/items`, { items: [], expectedItemsRevision: 1 })).status, 200);
});
test('Yandex mutations reject unsafe revisions, reasons, prices and quantities without transport', async () => {
  const decision = { action: 'accept', expectedRevision: 1, expectedItemsRevision: 1 };
  for (const patch of [{ expectedRevision: undefined }, { expectedItemsRevision: undefined },
    ...[0, -1, 1.5, '1', [1], {}, null, 9007199254740992].flatMap((value) => [{ expectedRevision: value }, { expectedItemsRevision: value }]),
    { action: ['accept'] }, { action: 'delivered' }, { reason: {} }, { reason: 'x'.repeat(301) }, { price: 10 }]) {
    assert.equal((await call('POST', `/orders/${id}/decision`, { ...decision, ...patch })).status, 422, JSON.stringify(patch));
  }
  for (const items of [null, {}, [null], [['p']], [{ billzProductId: ['p'], quantity: 1 }],
    [{ billzProductId: ' ', quantity: 1 }], [{ billzProductId: 'p'.repeat(65), quantity: 1 }],
    ...[0, -1, 1.5, '1', [1], null, 10001, 9007199254740992].map((quantity) => [{ billzProductId: 'p', quantity }]),
    [{ billzProductId: 'p', quantity: 1, unitPrice: 10 }], [{ billzProductId: 'p', quantity: 1, name: 'Spoof' }],
    [{ billzProductId: 'p', quantity: 1 }, { billzProductId: 'p', quantity: 2 }],
    Array.from({ length: 101 }, (_, i) => ({ billzProductId: `p${i}`, quantity: 1 }))]) {
    assert.equal((await call('PUT', `/orders/${id}/items`, { items, expectedItemsRevision: 1 })).status, 422);
  }
  for (const expectedItemsRevision of [undefined, 0, '1', 9007199254740992]) {
    assert.equal((await call('PUT', `/orders/${id}/items`, { items: [], expectedItemsRevision })).status, 422);
  }
  for (const body of [[], 'bad', { items: [], expectedItemsRevision: 1, price: 10 }]) {
    // JSON primitives are refused by the existing parser; arrays reach validation.
    if (typeof body === 'string') continue;
    assert.equal((await call('PUT', `/orders/${id}/items`, body)).status, 422);
  }
  assert.equal(calls.length, 0);
});
test('real host/session/CSRF gates and fresh role deny all Yandex surfaces', async () => {
  const routes = [['GET', '/orders'], ['GET', `/orders/${id}`], ['GET', '/products'],
    ['PUT', `/orders/${id}/items`], ['POST', `/orders/${id}/decision`]];
  for (const [method, path] of routes) {
    assert.equal((await call(method, path, {}, { host: 'evil.example' })).status, 421);
    assert.equal((await call(method, path, {}, { cookie: '' })).status, 401);
    if (method !== 'GET') {
      assert.equal((await call(method, path, {}, { 'X-FH-CSRF': '' })).status, 403);
      assert.equal((await call(method, path, {}, { origin: 'https://evil.example' })).status, 403);
    }
  }
  await User.updateOne({ telegramId: 77 }, { $set: { role: 'user' } });
  for (const [method, path] of routes) assert.ok([401, 403].includes((await call(method, path, { role: 'admin' })).status));
  assert.equal(calls.length, 0);
});
test('bounded channel error codes/status survive without raw body or message leakage', async (t) => {
  for (const code of ['yandex_revision_conflict', 'yandex_items_revision_conflict', 'yandex_disabled', 'yandex_operation_in_progress', 'yandex_reconciliation_required']) {
    reply = { ok: false, status: 409, body: { error: code, secret: 'private' } };
    const result = await call('GET', '/orders');
    assert.equal(result.status, 409); assert.deepEqual(result.body, { success: false, error: code });
  }
  for (const error of ['yandex_' + 'a'.repeat(1000), 'yandex_disabled\n', ['yandex_disabled'], { toString: 'yandex_disabled' }, 'yandex_<secret>', 'raw secret']) {
    reply = { ok: false, status: 418, body: { error } };
    const result = await call('GET', '/orders');
    assert.equal(result.status, 502); assert.deepEqual(result.body, { success: false, error: 'yandex_service_unavailable' });
  }
  for (const notConfigured of [true, false]) {
    t.mock.method(hub, 'requestInternal', async () => { throw Object.assign(new Error('private'), { notConfigured }); });
    const result = await call('GET', '/orders');
    assert.equal(result.status, notConfigured ? 503 : 502);
    assert.equal(result.body.error, notConfigured ? 'channel_hub_not_configured' : 'channel_hub_unreachable');
  }
});
