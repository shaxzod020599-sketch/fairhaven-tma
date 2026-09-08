const test = require('node:test');
const assert = require('node:assert/strict');
const { IncomingMessage, ServerResponse } = require('node:http');
const { Duplex } = require('node:stream');
const { memoryModel } = require('./helpers/uzumMemoryModel');
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/uzum-receipt-fake';
process.env.BILLZ_SECRET_TOKEN = 'test-secret'; process.env.BILLZ_SHOP_ID = 'test-shop';
process.env.UZUM_ENABLED = 'true'; process.env.UZUM_STORE_ID = 'store'; process.env.DISABLE_RATE_LIMIT = 'true';
process.env.CHANNEL_INTERNAL_TOKEN = 'test-internal';
const rows = []; const Model = memoryModel(rows);
Model.create = async (input) => { const row = { ...structuredClone(input), _id: `row-${rows.length}`, createdAt: new Date(), updatedAt: new Date(), billz: {} }; rows.push(row); return { toObject: () => structuredClone(row) }; };
const modelPath = require.resolve('../src/models/ChannelOrder'); require.cache[modelPath] = { exports: () => Model };
const adminPath = require.resolve('../src/models/AdminView');
const admins = [{ role: 'admin', telegramId: 77 }]; require.cache[adminPath] = { exports: () => memoryModel(admins) };
const catalog = require('../src/core/catalog');
let catalogReads = 0;
catalog.findForChannel = async () => { catalogReads += 1; return { card: { name: 'Vitamin' }, mirror: { measurementUnit: 'шт', billzProductId: 'p' } }; };
catalog.priceFor = () => 100; catalog.publishedQuantity = () => 10; catalog.isAvailable = () => true;
require('../src/media/images').hasUsableImage = () => true;
// These fixtures only replace external accounting and partner authentication;
// receipt storage, duplicate rules, lifecycle and internal auth remain real.
require('../src/adapters/uzum/oauth').requireBearer = (_req, _res, next) => next();
const core = require('../src/core/orders'); const calls = [];
core.reserveOrder = async (id) => { calls.push('reserve'); const row = rows.find((entry) => entry.internalOrderId === id); row.status = 'reserved'; row.billz.reservationApplied = true; return row; };
core.completeOrder = async (id) => { calls.push('complete'); const row = rows.find((entry) => entry.internalOrderId === id); row.status = 'sold'; row.soldAt = new Date(); row.billz.reservationApplied = false; return row; };
core.cancelOrder = async (id) => { calls.push('cancel'); const row = rows.find((entry) => entry.internalOrderId === id); row.status = 'cancelled'; row.billz.reservationApplied = false; return row; };
const express = require('express'); const app = express(); const router = require('../src/adapters/uzum/routes');
app.use('/uzum/v1', router); app.use('/uzum', router);
app.use('/internal/uzum', express.json(), require('../src/middleware/internalAuth').requireInternalToken, require('../src/uzum/internal'));
function request(method, url, body, token = '') {
  return new Promise((resolve, reject) => {
    const raw = body ? JSON.stringify(body) : '';
    const socket = new Duplex({ read() {}, write(_data, _encoding, done) { done(); } });
    const req = new IncomingMessage(socket); req.method = method; req.url = url;
    req.headers = { 'content-type': 'application/json', 'content-length': Buffer.byteLength(raw), 'x-internal-token': token };
    const res = new ServerResponse(req); res.end = (data) => resolve({ status: res.statusCode, body: data ? JSON.parse(String(data)) : null });
    app.handle(req, res, reject); req.push(raw); req.push(null);
  });
}
const order = { eatsId: 'eats', comment: '', promos: [], restaurantId: 'store', items: [{ id: 'p', quantity: 1, price: 100, modifications: [], promos: [] }] };
test('real POST stores durable inert NEW once, both mounts preserve retries and GET snapshot', async () => {
  const first = await request('POST', '/uzum/order', order);
  assert.equal(first.status, 200); assert.equal(rows.length, 1);
  assert.equal(rows[0].uzum.version, 1); assert.equal(rows[0].uzum.notification.pending, true);
  assert.deepEqual(calls, []);
  const reads = catalogReads;
  const again = await request('POST', '/uzum/v1/order', order);
  assert.deepEqual(again.body, first.body); assert.equal(catalogReads, reads);
  assert.equal((await request('GET', `/uzum/order/${first.body.orderId}/status`)).body.status, 'NEW');
  assert.deepEqual((await request('GET', '/uzum/v1/order/eats')).body, order);
  assert.equal((await request('POST', '/uzum/order', { ...order, comment: 'conflict' })).status, 422);
  assert.deepEqual(calls, []);
});
test('internal boundary rejects missing token, spoofed partner actor, demoted admin and cross-channel ids', async () => {
  const id = rows[0].internalOrderId;
  const path = `/internal/uzum/orders/${id}/decision`;
  const input = { action: 'accept', actor: { type: 'admin-panel', telegramId: 77, name: 'Admin' } };
  assert.equal((await request('POST', path, input)).status, 401);
  assert.equal((await request('POST', path, { ...input, actor: { type: 'uzum' } }, 'test-internal')).status, 422);
  admins[0].role = 'user'; assert.equal((await request('POST', path, input, 'test-internal')).status, 403); admins[0].role = 'admin';
  rows[0].channel = 'medicalka'; assert.equal((await request('POST', path, input, 'test-internal')).status, 404); rows[0].channel = 'uzum';
  assert.deepEqual(calls, []);
  assert.equal((await request('POST', path, input, 'test-internal')).body.order.status, 'ACCEPTED_BY_RESTAURANT');
  assert.equal((await request('POST', path, { ...input, action: 'ready' }, 'test-internal')).body.order.status, 'READY');
  assert.equal((await request('GET', '/uzum/v1/order/eats/status')).body.status, 'READY');
  assert.equal((await request('DELETE', '/uzum/order/eats', { eatsId: 'eats' })).status, 409);
  assert.deepEqual(calls, ['reserve', 'complete']);
});

test('unexpected internal database failures report service unavailability without inventing a stock shortage', async () => {
  const original = Model.findOne;
  Model.findOne = () => ({ lean: async () => { throw new Error('private database diagnostic'); } });
  try {
    const result = await request('GET', `/internal/uzum/orders/${rows[0].internalOrderId}`, undefined, 'test-internal');
    assert.equal(result.status, 503);
    assert.deepEqual(result.body, { error: 'uzum_service_unavailable' });
  } finally { Model.findOne = original; }
});
