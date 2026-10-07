const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, createHmac } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
process.env.BILLZ_SECRET_TOKEN = 'local-test';
process.env.BILLZ_SHOP_ID = 'local-shop';
process.env.BILLZ_WRITE_ENABLED = 'false';
process.env.CHANNEL_TELEGRAM_ENABLED = 'false';
process.env.DISABLE_RATE_LIMIT = 'true';
process.env.YANDEX_ENABLED = 'true';
process.env.YANDEX_PLACE_ID = 'local-place';
process.env.YANDEX_TOKEN_SIGNING_KEY = 'local-yandex-signing-key-32-characters';
process.env.CHANNEL_INTERNAL_TOKEN = 'local-internal-token-32-characters';
process.env.PUBLIC_IMAGE_BASE_URL = 'https://images.example.test';
let mongod; let db; let config; let Order; let Mirror; let cards; let server; let base; let uploads; let token; let sale;
const actor = { type: 'admin-panel', telegramId: 123, name: 'Staff' };
test.before(async () => {
  const { MongoMemoryServer } = require('../../backend/node_modules/mongodb-memory-server');
  mongod = await MongoMemoryServer.create(); process.env.MONGO_URI = mongod.getUri();
  uploads = await fs.mkdtemp(path.join(os.tmpdir(), 'yandex-lifecycle-')); process.env.UPLOADS_DIR = uploads;
  await fs.writeFile(path.join(uploads, 'item.jpg'), 'local-fixture');
  db = require('../src/db'); await db.connect(); config = require('../src/config');
  Order = require('../src/models/ChannelOrder')(); Mirror = require('../src/models/BillzProduct')();
  cards = db.getConnection().collection('products'); sale = require('../src/billz/sale');
  await Promise.all([Order.init(), Mirror.init()]);
  const key = await require('../src/models/ChannelKey')().create({ channel: 'yandex', kind: 'oauth', clientId: 'fixture', hash: 'fixture-hash' });
  const payload = Buffer.from(JSON.stringify({ c: 'yandex', a: 'fairhaven-yandex', k: String(key._id), e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
  token = `${payload}.${createHmac('sha256', process.env.YANDEX_TOKEN_SIGNING_KEY).update(payload).digest('base64url')}`;
  server = require('../src/server').app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve)); base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await db?.disconnect(); await mongod?.stop();
  if (uploads) await fs.rm(uploads, { recursive: true, force: true });
});
test.beforeEach(async (t) => {
  config.yandex.enabled = true; config.billzWriteEnabled = false;
  await Promise.all([Order.deleteMany({}), Mirror.deleteMany({}), cards.deleteMany({}), db.getConnection().collection('users').deleteMany({})]);
  await db.getConnection().collection('users').insertOne({ telegramId: 123, role: 'admin', firstName: 'Staff' });
  // All external effects are replaced below the real core accounting boundary.
  t.mock.method(sale, 'reserveOrder', async ({ onProgress }) => {
    const draft = { orderId: 'local-draft', orderNumber: 'local-1' };
    await onProgress({ stage: 'draft_created', ...draft });
    await onProgress({ stage: 'before_write', operation: 'reserve', ...draft });
    return draft;
  });
  t.mock.method(sale, 'completeSale', async () => ({}));
  t.mock.method(sale, 'releaseReservation', async () => ({}));
  t.mock.method(sale, 'deleteDraft', async () => ({}));
});
async function call(method, route, body, { bearer = token, internal = true, type = 'application/json' } = {}) {
  const res = await fetch(`${base}${route}`, { method, headers: { 'Content-Type': type,
    ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
    ...(internal ? { 'X-Internal-Token': process.env.CHANNEL_INTERNAL_TOKEN } : {}) },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const raw = await res.text(); return { status: res.status, raw, body: raw ? JSON.parse(raw) : null };
}
function incoming(items = [{ id: 'p', name: 'Quoted name', price: 80, quantity: 2 }]) {
  return { discriminator: 'yandex', eatsId: randomUUID(), comment: '',
    deliveryInfo: { courierArrivementDate: '2026-09-08T18:30:00+05:00', clientName: 'Customer', phoneNumber: '+998000000000' },
    items, paymentInfo: { itemsCost: items.reduce((sum, i) => sum + i.price * i.quantity, 0), paymentType: 'CARD' } };
}
async function receive(body = incoming()) {
  const response = await call('POST', '/yandex/order', body);
  assert.equal(response.status, 200); return { id: response.body.orderId, body };
}
async function seed(id = 'p', fields = {}) {
  await Mirror.create({ billzProductId: id, stock: 20, measurementUnit: 'pcs', ...fields });
  await cards.insertOne({ billzProductId: id, name: `Catalog ${id}`, category: 'vitamins', sku: id, barcode: '4601234567893',
    imageUrl: '/uploads/item.jpg', mxikCode: '03049990001000000', packageCode: '1234567',
    channels: { yandex: { enabled: true, price: 120, minStock: 1, barcodeType: 'ean13', measure: { unit: 'GRM', value: 100 } } } });
}
const raw = (id) => Order.findOne({ internalOrderId: id }).lean();
const get = (id) => call('GET', `/internal/yandex/orders/${id}`);
const callback = (id, status, fields = {}) => call('PUT', `/yandex/order/${id}/status`, { status, ...fields }, { type: 'application/vnd.eats.order.status.v1+json' });
async function decision(id, action, extra = {}) {
  const row = await raw(id);
  return call('POST', `/internal/yandex/orders/${id}/decision`, { action, actor,
    expectedRevision: row.yandex.revision, expectedItemsRevision: row.yandex.itemsRevision, ...extra });
}
const edit = (id, items, revision = 1, extra = {}) => call('PUT', `/internal/yandex/orders/${id}/items`, { items, expectedItemsRevision: revision, actor, ...extra });
async function restart() {
  await new Promise((resolve) => server.close(resolve)); await db.disconnect();
  for (const file of Object.keys(require.cache)) if (file.startsWith(path.resolve(__dirname, '../src') + path.sep)) delete require.cache[file];
  db = require('../src/db'); await db.connect(); config = require('../src/config');
  Order = require('../src/models/ChannelOrder')(); Mirror = require('../src/models/BillzProduct')();
  cards = db.getConnection().collection('products'); sale = require('../src/billz/sale');
  server = require('../src/server').app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve)); base = `http://127.0.0.1:${server.address().port}`;
}

test('receipt durably initializes versioned state and notification without accounting effects', async () => {
  const { id, body } = await receive(); const row = await raw(id);
  assert.equal(row.yandex.version, 1); assert.equal(row.yandex.revision, 1); assert.equal(row.yandex.itemsRevision, 1);
  assert.equal(row.yandex.itemsFrozen, false); assert.equal(row.yandex.fulfillmentStatus, 'NEW');
  assert.equal(row.yandex.notification.pending, true); assert.equal(row.billz.attempts, 0);
  assert.deepEqual(row.rawIn, body);
  const dto = await get(id); assert.equal(dto.status, 200);
  assert.equal(dto.body.data.customer.name, 'Customer'); assert.equal(dto.body.data.accountingEnabled, false);
  assert.equal('notification' in dto.body.data, false); assert.equal('rawIn' in dto.body.data, false);
});

test('picking preserves quote, resolves additions on server and replay survives restart', async () => {
  await seed(); await seed('replacement');
  const { id, body } = await receive();
  const result = await edit(id, [{ billzProductId: 'p', quantity: 1 }, { billzProductId: 'replacement', quantity: 2 }]);
  assert.equal(result.status, 200); assert.equal(result.body.order.itemsRevision, 2); assert.equal(result.body.order.totalAmount, 320);
  assert.deepEqual(result.body.order.items.map((i) => [i.name, i.unitPrice]), [['Quoted name', 80], ['Catalog replacement', 120]]);
  await restart();
  const retry = await call('POST', '/yandex/order', body); assert.equal(retry.body.orderId, id);
  assert.deepEqual((await raw(id)).rawIn, body);
});

test('competing edits apply once and stale item revision cannot accept unseen composition', async () => {
  await seed(); const { id } = await receive();
  const results = await Promise.all([edit(id, [{ billzProductId: 'p', quantity: 1 }]), edit(id, [])]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  config.billzWriteEnabled = true;
  const result = await decision(id, 'accept', { expectedItemsRevision: 1 });
  assert.equal(result.status, 409); assert.equal((await raw(id)).billz.attempts, 0);
});

test('disabled acceptance leaves complete persisted order untouched', async () => {
  await seed(); const { id } = await receive(); const before = await raw(id);
  const result = await decision(id, 'accept'); assert.equal(result.status, 503);
  assert.deepEqual(await raw(id), before);
  config.yandex.enabled = false;
  assert.equal((await edit(id, [])).status, 503); assert.deepEqual(await raw(id), before);
});

test('accept freezes picks, cooking advances fulfillment and ready settles once while staying active', async () => {
  await seed(); const { id } = await receive(); config.billzWriteEnabled = true;
  const before = await raw(id); const input = { expectedRevision: before.yandex.revision, expectedItemsRevision: 1 };
  const accepted = await decision(id, 'accept', input); assert.equal(accepted.status, 200);
  assert.equal(accepted.body.order.status, 'ACCEPTED_BY_RESTAURANT'); assert.equal(accepted.body.order.itemsFrozen, true);
  assert.equal((await decision(id, 'accept', input)).body.idempotent, true);
  assert.equal((await edit(id, [])).status, 409);
  assert.equal((await decision(id, 'cooking')).body.order.status, 'COOKING');
  const priorReady = await raw(id);
  const ready = await decision(id, 'ready'); assert.equal(ready.status, 200); assert.equal(ready.body.order.status, 'READY');
  assert.equal((await decision(id, 'ready', { expectedRevision: priorReady.yandex.revision })).body.idempotent, true);
  assert.equal(sale.completeSale.mock.callCount(), 1);
  const stock = await Mirror.findOne({ billzProductId: 'p' });
  assert.equal(stock.reservedQty, 0); assert.equal(stock.yandexSoldHolds[0].quantity, 2); assert.equal(stock.availableStock(), 18);
  assert.equal((await call('GET', '/internal/yandex/orders?bucket=active')).body.meta.total, 1);
  assert.equal((await call('GET', '/internal/yandex/orders?bucket=history')).body.meta.total, 0);
});

test('callback persists cancellation immediately with writes disabled and drains local no-effect cleanup', async () => {
  const { id } = await receive();
  const result = await callback(id, 'CANCELLED'); assert.equal(result.status, 204); assert.equal(result.raw, '');
  assert.equal((await call('GET', `/yandex/order/${id}/status`)).body.status, 'CANCELLED');
  const life = require('../src/yandex/lifecycle').createLifecycle();
  await life.drainCancellations(); assert.equal((await raw(id)).status, 'cancelled');
  assert.equal(sale.releaseReservation.mock.callCount(), 0);
  assert.equal((await callback(id, 'DELIVERED')).status, 204);
  assert.equal((await call('GET', `/yandex/order/${id}/status`)).body.status, 'CANCELLED');
});

test('callback validation, durable failure and channel/auth boundaries fail closed', async (t) => {
  const { id } = await receive();
  for (const fields of [{ status: 'READY' }, { status: null }, { reason: 1 }, { comment: false },
    { updatedAt: '2026-02-30T00:00:00Z' }, { platform: [] }, { platform: 'unknown' }, { attributes: {} }, { attributes: [1] }]) {
    const res = await callback(id, 'CANCELLED', fields); assert.equal(res.status, 400); assert.ok(Array.isArray(res.body));
  }
  const other = randomUUID(); await Order.create({ channel: 'uzum', internalOrderId: other, externalId: other });
  assert.equal((await callback(other, 'CANCELLED')).status, 404);
  assert.equal((await call('PUT', `/yandex/order/${id}/status`, { status: 'CANCELLED' }, { bearer: null })).status, 401);
  t.mock.method(Order, 'findOneAndUpdate', () => { throw new Error('private durable write failed'); });
  const failed = await callback(id, 'CANCELLED'); assert.equal(failed.status, 500); assert.ok(Array.isArray(failed.body));
  assert.equal((await raw(id)).yandex.cancelRequested, null);
});

test('current admin role required for decision and picking; supplied role cannot authorize', async () => {
  await seed(); const { id } = await receive(); config.billzWriteEnabled = true;
  await db.getConnection().collection('users').updateOne({ telegramId: 123 }, { $set: { role: 'user' } });
  assert.equal((await decision(id, 'accept', { actor: { ...actor, role: 'admin' } })).status, 403);
  assert.equal((await edit(id, [], 1, { actor: { ...actor, role: 'admin' } })).status, 403);
  assert.equal((await call('GET', '/internal/yandex/orders', undefined, { internal: false })).status, 401);
  assert.equal((await raw(id)).billz.attempts, 0);
});

test('mixed sold holds reduce shared catalog and backend availability independently', async () => {
  await seed('p', { stock: 7, reservedQty: 1, pendingQty: 1,
    uzumSoldHolds: [{ orderId: 'u', quantity: 2, soldAt: new Date() }],
    yandexSoldHolds: [{ orderId: 'y', quantity: 3, soldAt: new Date() }] });
  const mirror = await Mirror.findOne({ billzProductId: 'p' });
  assert.equal(mirror.availableStock(), 0);
  assert.equal(require('../src/core/catalog').availableStock(mirror), 0);
  assert.equal(require('../../backend/services/stockReconciler').availableQuantity(mirror.toObject()), 0);
});

test('official callback optional strings and string-array attributes persist for cancellation and courier events', async () => {
  for (const status of ['CANCELLED', 'TAKEN_BY_COURIER', 'DELIVERED']) {
    for (const attributes of [[], ['paid']]) {
      const { id } = await receive();
      const metadata = { reason: 'r'.repeat(301), comment: 'c'.repeat(501), updatedAt: '2026-09-08T10:00:00+05:00', platform: 'YE', attributes };
      const result = await callback(id, status, metadata); assert.equal(result.status, 204);
      const row = await raw(id); const event = row.yandex.audit.at(-1);
      assert.deepEqual(event.metadata, { status, ...metadata });
      assert.equal(row.status, 'received'); assert.equal(sale.completeSale.mock.callCount(), 0);
    }
  }
  const { id } = await receive();
  assert.equal((await callback(id, 'CANCELLED', { reason: '', comment: '', attributes: [] })).status, 204);
});

test('picking audit reconstructs before/after quantities, removal and server price', async () => {
  await seed(); await seed('replacement'); const { id } = await receive();
  const result = await edit(id, [{ billzProductId: 'replacement', quantity: 1 }]); assert.equal(result.status, 200);
  const audit = result.body.order.audit.at(-1);
  assert.deepEqual(audit.before, [{ billzProductId: 'p', quantity: 2, unitPrice: 80 }]);
  assert.deepEqual(audit.after, [{ billzProductId: 'replacement', quantity: 1, unitPrice: 120 }]);
});

test('staff can reject READY without refund, keeps sold evidence and reconciliation active', async () => {
  await seed(); const { id } = await receive(); config.billzWriteEnabled = true;
  assert.equal((await decision(id, 'accept')).status, 200); assert.equal((await decision(id, 'ready')).status, 200);
  assert.ok((await get(id)).body.data.actions.includes('reject'));
  assert.equal((await decision(id, 'reject')).status, 200);
  const row = await raw(id); assert.equal(row.status, 'sold'); assert.equal(row.yandex.fulfillmentStatus, 'CANCELLED');
  assert.ok(row.yandex.paymentConfirmedAt); assert.equal(row.yandex.reconciliationRequired, true);
  assert.equal(sale.releaseReservation.mock.callCount(), 0); assert.equal(sale.completeSale.mock.callCount(), 1);
  assert.equal((await call('GET', '/internal/yandex/orders?bucket=history')).body.meta.total, 0);
});

function gate() { let release; const promise = new Promise((resolve) => { release = resolve; }); return { promise, release }; }
test('edit/accept race freezes displayed composition and rejects late edit', async () => {
  await seed(); const { id } = await receive(); config.billzWriteEnabled = true;
  const entered = gate(); const resume = gate();
  const life = require('../src/yandex/lifecycle').createLifecycle({ checkAvailability: async (row) => {
    entered.release(); await resume.promise; await require('../src/yandex/picking').checkAvailability(row);
  } });
  const accepting = life.decide(id, { action: 'accept', actor, expectedRevision: 1, expectedItemsRevision: 1 });
  try { await entered.promise; assert.equal((await edit(id, [])).status, 409); } finally { resume.release(); }
  assert.equal((await accepting).order.status, 'ACCEPTED_BY_RESTAURANT'); assert.equal((await raw(id)).items.length, 1);
});

test('callback/accept race before first effect cancels without creating a draft', async () => {
  await seed(); const { id } = await receive(); config.billzWriteEnabled = true;
  const entered = gate(); const resume = gate();
  const life = require('../src/yandex/lifecycle').createLifecycle({ checkAvailability: async () => { entered.release(); await resume.promise; } });
  const accepting = assert.rejects(life.decide(id, { action: 'accept', actor, expectedRevision: 1, expectedItemsRevision: 1 }), { code: 'yandex_cancelled' });
  try { await entered.promise; assert.equal((await callback(id, 'CANCELLED')).status, 204); } finally { resume.release(); }
  await accepting; assert.equal((await raw(id)).status, 'cancelled'); assert.equal(sale.reserveOrder.mock.callCount(), 0);
});

test('callback during successful reservation prevents acceptance and cleans proven reservation', async (t) => {
  await seed(); const { id } = await receive(); config.billzWriteEnabled = true;
  t.mock.method(sale, 'reserveOrder', async ({ onProgress }) => {
    await onProgress({ stage: 'draft_created', orderId: 'race-draft' });
    await onProgress({ stage: 'before_write', operation: 'reserve' });
    assert.equal((await callback(id, 'CANCELLED')).status, 204);
    return { orderId: 'race-draft' };
  });
  assert.equal((await decision(id, 'accept')).status, 409);
  assert.equal((await raw(id)).status, 'cancelled'); assert.equal((await Mirror.findOne({ billzProductId: 'p' })).reservedQty, 0);
  assert.equal(sale.releaseReservation.mock.callCount(), 1);
});

test('callback/payment race acknowledges before payment resolves and never overwrites CANCELLED', async (t) => {
  await seed(); const { id } = await receive(); config.billzWriteEnabled = true; await decision(id, 'accept');
  const entered = gate(); const resume = gate();
  t.mock.method(sale, 'completeSale', async () => { entered.release(); await resume.promise; });
  const ready = decision(id, 'ready');
  try {
    await entered.promise; const result = await callback(id, 'CANCELLED', { attributes: ['paid'] }); assert.equal(result.status, 204);
    assert.equal((await call('GET', `/yandex/order/${id}/status`)).body.status, 'CANCELLED');
  } finally { resume.release(); }
  assert.equal((await ready).status, 409);
  const row = await raw(id); assert.equal(row.status, 'sold'); assert.ok(row.yandex.paymentConfirmedAt);
  assert.equal(row.yandex.fulfillmentStatus, 'CANCELLED'); assert.equal(row.yandex.reconciliationRequired, true);
  assert.equal((await Mirror.findOne({ billzProductId: 'p' })).yandexSoldHolds[0].quantity, 2);
  assert.equal(sale.releaseReservation.mock.callCount(), 0);
});

test('unknown payment outcome retains ownership and never repeats financial effect', async (t) => {
  await seed(); const { id } = await receive(); config.billzWriteEnabled = true; await decision(id, 'accept');
  let payments = 0;
  t.mock.method(sale, 'completeSale', async () => { payments += 1; throw Object.assign(new Error('unknown'), { outcomeUnknown: true }); });
  assert.equal((await decision(id, 'ready')).status, 409);
  const row = await raw(id); assert.ok(row.billz.operationToken); assert.equal(row.billz.reconciliationRequired, true);
  assert.equal((await decision(id, 'ready')).status, 409);
  await callback(id, 'CANCELLED'); await require('../src/yandex/lifecycle').drainCancellations();
  assert.equal(payments, 1); assert.equal(sale.releaseReservation.mock.callCount(), 0);
});

test('fresh owner stays busy; stale owner requires reconciliation without takeover', async () => {
  for (const stale of [false, true]) {
    await seed(stale ? 'stale' : 'fresh'); const { id } = await receive(incoming([{ id: stale ? 'stale' : 'fresh', price: 80, quantity: 1 }]));
    config.billzWriteEnabled = true;
    await Order.updateOne({ internalOrderId: id }, { $set: { 'yandex.operation': { token: 'owner', action: 'accept', startedAt: new Date(Date.now() - (stale ? 360000 : 0)) } } });
    assert.equal((await decision(id, 'accept')).status, 409);
    const dto = (await get(id)).body.data; assert.equal(dto.reconciliationRequired, stale); assert.equal(dto.inProgress, true);
    assert.equal((await raw(id)).yandex.operation.token, 'owner');
  }
  assert.equal(sale.reserveOrder.mock.callCount(), 0);
});

test('restart keeps reserved cancellation pending while disabled, then drains once', async (t) => {
  await seed(); const { id } = await receive(); config.billzWriteEnabled = true; await decision(id, 'accept');
  await callback(id, 'CANCELLED'); await restart();
  await require('../src/yandex/lifecycle').drainCancellations();
  assert.equal((await raw(id)).status, 'reserved'); assert.equal((await get(id)).body.data.cancellationPending, true);
  t.mock.method(sale, 'releaseReservation', async () => ({})); t.mock.method(sale, 'deleteDraft', async () => ({}));
  config.billzWriteEnabled = true;
  await require('../src/yandex/lifecycle').drainCancellations(); await require('../src/yandex/lifecycle').drainCancellations();
  assert.equal((await raw(id)).status, 'cancelled'); assert.equal(sale.releaseReservation.mock.callCount(), 1);
});

test('courier callbacks advance monotonically and preserve duplicate revision', async () => {
  const { id } = await receive();
  assert.equal((await callback(id, 'DELIVERED')).status, 204); const row = await raw(id);
  assert.equal((await callback(id, 'TAKEN_BY_COURIER')).status, 204); assert.equal((await callback(id, 'DELIVERED')).status, 204);
  assert.equal((await raw(id)).yandex.revision, row.yandex.revision);
  assert.equal((await call('GET', `/yandex/order/${id}/status`)).body.status, 'DELIVERED');
});

test('phase-one upgrade preserves original input and exposes safe defaults', async () => {
  const body = incoming(); const id = randomUUID();
  await Order.collection.insertOne({ channel: 'yandex', internalOrderId: id, externalId: body.eatsId, status: 'received',
    items: [{ billzProductId: 'p', quantity: 2, unitPrice: 80 }], rawIn: body,
    yandex: { requestSnapshot: { ...body, restaurantId: 'local-place' } }, createdAt: new Date(), updatedAt: new Date() });
  assert.equal((await get(id)).body.data.itemsRevision, 1); assert.equal((await raw(id)).yandex.version, 1);
  assert.deepEqual((await raw(id)).rawIn, body); assert.equal((await call('POST', '/yandex/order', body)).body.orderId, id);
});

test('lines Yandex sends without a name carry the catalogue name into the order and edits', async () => {
  await seed();
  const { id } = await receive(incoming([{ id: 'p', price: 80, quantity: 2 }, { id: 'unknown', price: 5, quantity: 1 }]));
  assert.deepEqual((await raw(id)).items.map((item) => item.name), ['Catalog p', '']);
  assert.equal((await edit(id, [{ billzProductId: 'p', quantity: 1 }])).status, 200);
  assert.deepEqual((await raw(id)).items.map(({ name, unitPrice }) => [name, unitPrice]), [['Catalog p', 80]]);
});

test('unknown lines can be removed; invalid pieces, duplicates, prices, publication and totals cannot be accepted', async () => {
  await seed(); const { id } = await receive(incoming([{ id: 'unknown', price: 2, quantity: 0.5 }]));
  for (const items of [[{ billzProductId: 'p', quantity: 1.5 }], [{ billzProductId: 'p', quantity: 0 }],
    [{ billzProductId: 'p', quantity: 1, unitPrice: 1 }], [{ billzProductId: 'p', quantity: 1 }, { billzProductId: 'p', quantity: 1 }]]) {
    assert.equal((await edit(id, items)).status, 422);
  }
  assert.equal((await edit(id, [])).status, 200); config.billzWriteEnabled = true;
  assert.equal((await decision(id, 'accept')).status, 409);
  const rev = (await raw(id)).yandex.itemsRevision;
  assert.equal((await edit(id, [{ billzProductId: 'p', quantity: 1 }], rev)).status, 200);
  await cards.updateOne({ billzProductId: 'p' }, { $set: { barcode: '' } });
  assert.equal((await decision(id, 'accept')).status, 409); assert.equal((await raw(id)).billz.attempts, 0);
});

test('product search excludes unavailable/incomplete items and bounds query', async () => {
  await seed(); await seed('empty', { stock: 0 }); await seed('invalid');
  await cards.updateOne({ billzProductId: 'invalid' }, { $set: { imageUrl: '' } });
  const result = await call('GET', '/internal/yandex/products?search=Catalog&limit=1');
  assert.deepEqual(result.body.items, [{ billzProductId: 'p', name: 'Catalog p', unitPrice: 120, availableQuantity: 19 }]);
  for (const query of ['limit=0', 'limit=101', 'search=' + 'x'.repeat(121), 'page=1', 'limit=1&limit=2']) {
    assert.equal((await call('GET', '/internal/yandex/products?' + query)).status, 422);
  }
});

test('mixed holds share monotonic fresh/equal/stale snapshot watermark and tombstone protection', async () => {
  const at = new Date('2026-09-08T10:00:00Z'); const later = new Date(at.getTime() + 1);
  await seed('p', { stock: 10, reservedQty: 1, pendingQty: 1,
    uzumSoldHolds: [{ orderId: 'u', quantity: 2, soldAt: at }],
    yandexSoldHolds: [{ orderId: 'y', quantity: 3, soldAt: at }, { orderId: 'concurrent', quantity: 1, soldAt: later }] });
  const snapshot = require('../src/uzum/stock').snapshotUpdate;
  await Mirror.updateOne({ billzProductId: 'p' }, snapshot({ stock: 10 }, at, at));
  assert.equal((await Mirror.findOne({ billzProductId: 'p' })).availableStock(), 2);
  await Mirror.updateOne({ billzProductId: 'p' }, snapshot({ stock: 5, deletedInBillz: true }, later, later));
  await Mirror.updateOne({ billzProductId: 'p' }, snapshot({ stock: 99, deletedInBillz: false }, later, later));
  await Mirror.updateOne({ billzProductId: 'p' }, snapshot({ stock: 99, deletedInBillz: false }, at, later));
  const row = await Mirror.findOne({ billzProductId: 'p' });
  assert.equal(row.stock, 5); assert.equal(row.deletedInBillz, true); assert.equal(row.reservedQty, 1); assert.equal(row.pendingQty, 1);
  assert.deepEqual(row.uzumSoldHolds.map((h) => h.quantity), [0]); assert.deepEqual(row.yandexSoldHolds.map((h) => h.quantity), [0, 1]);
  assert.equal(row.availableStock(), 2);
});

test('covering snapshot creates zero replay marker; cleanup waits for durable finalization and replay is fenced', async (t) => {
  await seed(); const { id } = await receive(); config.billzWriteEnabled = true; await decision(id, 'accept');
  const stock = require('../src/yandex/stock'); const transfer = stock.transferSoldHold; let stale;
  t.mock.method(stock, 'transferSoldHold', async (order, soldAt) => {
    stale = order.toObject(); stale.items[0].quantity = 900;
    const at = new Date(soldAt.getTime() + 1);
    await Mirror.updateOne({ billzProductId: 'p' }, require('../src/uzum/stock').snapshotUpdate({ stock: 18 }, at, at));
    await transfer(stale, soldAt);
    await stock.cleanupSoldHolds(Mirror, Order);
    const product = await Mirror.findOne({ billzProductId: 'p' });
    assert.equal(product.reservedQty, 0); assert.equal(product.yandexSoldHolds.length, 1); assert.equal(product.yandexSoldHolds[0].quantity, 0);
  });
  assert.equal((await decision(id, 'ready')).status, 200);
  await stock.cleanupSoldHolds(Mirror, Order); assert.equal((await Mirror.findOne({ billzProductId: 'p' })).yandexSoldHolds.length, 0);
  await assert.rejects(transfer(stale, new Date()), { code: 'BILLZ_OPERATION_OWNERSHIP_LOST' });
  assert.equal((await Mirror.findOne({ billzProductId: 'p' })).reservedQty, 0);
});

for (const missing of ['first', 'second']) {
  test(`missing ${missing} mirror during paid transfer retains partial evidence and never repays`, async () => {
    await seed(); await seed('second');
    const { id } = await receive(incoming([{ id: 'p', price: 80, quantity: 2 }, { id: 'second', price: 120, quantity: 1 }]));
    config.billzWriteEnabled = true; await decision(id, 'accept');
    await Mirror.deleteOne({ billzProductId: missing === 'first' ? 'p' : 'second' });
    assert.equal((await decision(id, 'ready')).status, 409);
    const row = await raw(id); assert.equal(row.billz.reconciliationRequired, true); assert.ok(row.billz.operationToken);
    assert.equal(row.billz.reservationApplied, true); assert.ok(row.yandex.paymentConfirmedAt);
    if (missing === 'second') assert.equal((await Mirror.findOne({ billzProductId: 'p' })).yandexSoldHolds[0].quantity, 2);
    assert.equal((await decision(id, 'ready')).status, 409); assert.equal(sale.completeSale.mock.callCount(), 1);
  });
}

test('post-sale cancellation retains replay evidence after covering snapshot cleanup', async () => {
  await seed(); const { id } = await receive(); config.billzWriteEnabled = true; await decision(id, 'accept'); await decision(id, 'ready');
  await callback(id, 'CANCELLED'); const row = await raw(id); const at = new Date(row.soldAt.getTime() + 1);
  await Mirror.updateOne({ billzProductId: 'p' }, require('../src/uzum/stock').snapshotUpdate({ stock: 18 }, at, at));
  await require('../src/yandex/stock').cleanupSoldHolds(Mirror, Order);
  const product = await Mirror.findOne({ billzProductId: 'p' });
  assert.equal(product.yandexSoldHolds.length, 1); assert.equal(product.yandexSoldHolds[0].quantity, 0);
});

test('real inventory aggregation counts both sold holds without altering physical units', async () => {
  await seed('p', { stock: 7, reservedQty: 1, pendingQty: 1, retailPrice: 100,
    uzumSoldHolds: [{ orderId: 'u', quantity: 2, soldAt: new Date() }], yandexSoldHolds: [{ orderId: 'y', quantity: 3, soldAt: new Date() }] });
  const result = await require('../src/analytics/billzInventory').summarizeInventory({ ProductModel: Mirror, SyncLogModel: require('../src/models/SyncLog')() });
  assert.equal(result.physicalUnits, 7); assert.equal(result.sellableUnits, 0); assert.equal(result.estimatedRetailValue, 0);
  assert.equal(result.lowStock[0].sellableUnits, 0);
});

test('duplicate/conflicting accept and reject requests apply external reservation/release only once', async () => {
  await seed(); const { id } = await receive(); config.billzWriteEnabled = true;
  const input = { expectedRevision: 1, expectedItemsRevision: 1 };
  const results = await Promise.all([decision(id, 'accept', input), decision(id, 'accept', input)]);
  assert.equal(results.filter((r) => r.status === 200).length >= 1, true); assert.equal(sale.reserveOrder.mock.callCount(), 1);
  assert.equal((await decision(id, 'accept', input)).body.idempotent, true);
  assert.equal((await decision(id, 'accept', { ...input, reason: 'different' })).status, 409);
  const rev = (await raw(id)).yandex.revision;
  assert.equal((await decision(id, 'reject', { expectedRevision: rev })).status, 200);
  assert.equal((await decision(id, 'reject', { expectedRevision: rev })).body.idempotent, true);
  assert.equal(sale.releaseReservation.mock.callCount(), 1);
});

test('cancel at known draft checkpoint deletes only draft and never releases unproven reservation', async (t) => {
  await seed(); const { id } = await receive(); config.billzWriteEnabled = true;
  t.mock.method(sale, 'reserveOrder', async ({ onProgress }) => {
    await callback(id, 'CANCELLED');
    await onProgress({ stage: 'draft_created', orderId: 'known-draft' });
    throw new Error('cancel fence must stop progress');
  });
  assert.equal((await decision(id, 'accept')).status, 409);
  assert.equal((await raw(id)).status, 'cancelled'); assert.equal(sale.releaseReservation.mock.callCount(), 0);
  assert.equal(sale.deleteDraft.mock.callCount(), 1);
});

test('courier arriving before ready does not strand an accepted reservation', async () => {
  await seed(); const { id } = await receive(); config.billzWriteEnabled = true; await decision(id, 'accept');
  await callback(id, 'TAKEN_BY_COURIER');
  assert.ok((await get(id)).body.data.actions.includes('ready'));
  assert.equal((await decision(id, 'ready')).status, 200);
  assert.equal((await raw(id)).status, 'sold'); assert.equal((await get(id)).body.data.status, 'TAKEN_BY_COURIER');
});

test('stale lifecycle review fences next external checkpoint without clearing ownership', async (t) => {
  await seed(); const { id } = await receive(); config.billzWriteEnabled = true;
  let reserveEffect = false;
  t.mock.method(sale, 'reserveOrder', async ({ onProgress }) => {
    await onProgress({ stage: 'draft_created', orderId: 'stale-draft' });
    await Order.updateOne({ internalOrderId: id }, { $set: { 'yandex.reconciliationRequired': true } });
    await onProgress({ stage: 'before_write', operation: 'reserve' }); reserveEffect = true;
    return { orderId: 'stale-draft' };
  });
  assert.equal((await decision(id, 'accept')).status, 409); assert.equal(reserveEffect, false);
  const row = await raw(id); assert.ok(row.yandex.operation.token); assert.ok(row.billz.operationToken);
});

test('retry-safe cancellation refusal retains reservation then retries safe cleanup once', async (t) => {
  await seed(); const { id } = await receive(); config.billzWriteEnabled = true; await decision(id, 'accept');
  let releases = 0;
  t.mock.method(sale, 'releaseReservation', async () => {
    releases += 1; if (releases === 1) throw Object.assign(new Error('refused'), { retrySafe: true, outcomeUnknown: false });
  });
  await callback(id, 'CANCELLED'); await require('../src/yandex/lifecycle').drainCancellations();
  assert.equal((await Mirror.findOne({ billzProductId: 'p' })).reservedQty, 2);
  assert.equal((await get(id)).body.data.cancellationPending, true);
  await require('../src/yandex/lifecycle').drainCancellations(); assert.equal((await raw(id)).status, 'cancelled'); assert.equal(releases, 2);
});

test('delayed picking resolution cannot overwrite accepted or cancelled composition', async () => {
  for (const action of ['accept', 'cancel']) {
    const { id } = await receive(); if (action === 'accept') await seed(); config.billzWriteEnabled = true;
    const entered = gate(); const resume = gate();
    const life = require('../src/yandex/lifecycle').createLifecycle({ resolveItems: async () => { entered.release(); await resume.promise; return { items: [], totalAmount: 0 }; } });
    const editing = assert.rejects(life.updateItems(id, { items: [], expectedItemsRevision: 1, actor }), { code: 'yandex_items_revision_conflict' });
    try { await entered.promise; if (action === 'accept') await decision(id, 'accept'); else await callback(id, 'CANCELLED'); }
    finally { resume.release(); }
    await editing; assert.equal((await raw(id)).items.length, 1);
  }
});

test('receipt older than Uzum acceptance window remains acceptable for Yandex', async () => {
  await seed(); const { id } = await receive(); config.billzWriteEnabled = true;
  await Order.collection.updateOne({ internalOrderId: id }, { $set: { createdAt: new Date(Date.now() - 86400000) } });
  assert.equal((await decision(id, 'accept')).status, 200);
});

async function cancellationBacklog(overrides) {
  const old = new Date(Date.now() - 3600000);
  return Order.insertMany(Array.from({ length: 50 }, (_, index) => {
    const id = randomUUID();
    return { channel: 'yandex', internalOrderId: id, externalId: id, status: 'reserved',
      items: [{ billzProductId: 'p', quantity: 2, unitPrice: 80 }], totalAmount: 160,
      billz: { draftOrderId: `backlog-${index}`, reservationApplied: true },
      yandex: { requestSnapshot: incoming(), fulfillmentStatus: 'CANCELLED', cancellationPending: true,
        cancelRequested: { actor, at: old, reason: '' }, accountingStage: 'reserved' },
      createdAt: old, updatedAt: old, ...overrides?.(index, old) };
  }));
}
test('disabled drain reaches 51st local cancellation, preserves reserved backlog across restart, then drains enabled accounting', async (t) => {
  await seed('p', { stock: 200, reservedQty: 100 }); await cancellationBacklog();
  const { id } = await receive(); await callback(id, 'CANCELLED');
  const older = await Order.find({ internalOrderId: { $ne: id } }).sort({ _id: 1 }).lean();
  await require('../src/yandex/lifecycle').drainCancellations();
  assert.equal((await raw(id)).status, 'cancelled');
  assert.deepEqual(await Order.find({ internalOrderId: { $ne: id } }).sort({ _id: 1 }).lean(), older);
  for (const method of ['reserveOrder', 'completeSale', 'releaseReservation', 'deleteDraft']) assert.equal(sale[method].mock.callCount(), 0);
  await restart();
  const later = await receive(); await callback(later.id, 'CANCELLED');
  t.mock.method(sale, 'releaseReservation', async () => ({})); t.mock.method(sale, 'deleteDraft', async () => ({}));
  await require('../src/yandex/lifecycle').drainCancellations();
  assert.equal((await raw(later.id)).status, 'cancelled'); assert.equal(sale.releaseReservation.mock.callCount(), 0);
  config.billzWriteEnabled = true;
  await require('../src/yandex/lifecycle').drainCancellations();
  assert.equal(await Order.countDocuments({ status: 'reserved' }), 0);
  assert.equal(sale.releaseReservation.mock.callCount(), 50); assert.equal(sale.deleteDraft.mock.callCount(), 50);
  assert.equal((await Mirror.findOne({ billzProductId: 'p' })).reservedQty, 0);
});

for (const enabled of [false, true]) {
  test(`drain skips owned and otherwise ineligible old cancellations before limiting with accounting ${enabled}`, async () => {
    const cases = [
      { 'billz.operationToken': 'core-owner', 'billz.operationStartedAt': new Date() },
      { 'yandex.operation': { token: 'lifecycle-owner', startedAt: new Date() } },
      { 'billz.reconciliationRequired': true }, { 'yandex.reconciliationRequired': true },
      { status: 'sold' }, { status: 'failed', 'billz.failureDisposition': '' },
      { 'yandex.paymentConfirmedAt': new Date() }, { 'yandex.cancelRequested': null },
    ];
    const backlog = await cancellationBacklog();
    await Order.bulkWrite(backlog.map((row, index) => ({ updateOne: { filter: { _id: row._id }, update: { $set: cases[index % cases.length] } } })));
    const older = await Order.find({}).sort({ _id: 1 }).lean();
    const { id } = await receive(); await callback(id, 'CANCELLED'); config.billzWriteEnabled = enabled;
    await require('../src/yandex/lifecycle').drainCancellations();
    assert.equal((await raw(id)).status, 'cancelled');
    assert.deepEqual(await Order.find({ internalOrderId: { $ne: id } }).sort({ _id: 1 }).lean(), older);
    for (const method of ['reserveOrder', 'completeSale', 'releaseReservation', 'deleteDraft']) assert.equal(sale[method].mock.callCount(), 0);
  });
}

function raceFinalization(t, id, action, inject) {
  const original = Order.findOneAndUpdate;
  let attempts = 0;
  t.mock.method(Order, 'findOneAndUpdate', function (filter, update, options) {
    if (filter.internalOrderId === id && update.$set?.[`yandex.decisions.${action}`] && update.$set['yandex.operation'] === null) {
      return { lean: async () => {
        attempts += 1; await inject(attempts);
        return original.call(this, filter, update, options).lean();
      } };
    }
    return original.call(this, filter, update, options);
  });
  return () => attempts;
}
test('local finalization stops after bounded revision contention without another financial effect', { timeout: 5000 }, async (t) => {
  await seed(); const { id } = await receive(); config.billzWriteEnabled = true; await decision(id, 'accept');
  const attempts = raceFinalization(t, id, 'ready', async () => {
    await Order.updateOne({ internalOrderId: id }, { $inc: { 'yandex.revision': 1 } });
  });
  assert.equal((await decision(id, 'ready')).status, 409); assert.equal(attempts(), 12);
  const row = await raw(id); assert.equal(row.status, 'sold'); assert.ok(row.yandex.operation?.token);
  assert.equal(row.yandex.reconciliationRequired, true); assert.equal(sale.completeSale.mock.callCount(), 1);
});
for (const action of ['accept', 'cooking', 'ready']) {
  test(`${action} retries only local finalization after successive courier revisions without repeating accounting`, async (t) => {
    await seed(); const { id } = await receive(); config.billzWriteEnabled = true;
    if (action !== 'accept') assert.equal((await decision(id, 'accept')).status, 200);
    const before = await raw(id);
    const attempts = raceFinalization(t, id, action, async (attempt) => {
      if (attempt <= 2) assert.equal((await callback(id, attempt === 1 ? 'TAKEN_BY_COURIER' : 'DELIVERED')).status, 204);
    });
    const result = await decision(id, action); assert.equal(result.status, 200);
    assert.equal(attempts(), 3); assert.equal(result.body.order.status, 'DELIVERED');
    assert.equal(result.body.order.reconciliationRequired, false); assert.equal(result.body.order.inProgress, false);
    assert.equal(result.body.order.accountingStatus, action === 'ready' ? 'sold' : 'reserved');
    assert.ok(result.body.order.actions.includes(action === 'ready' ? 'reject' : 'ready'));
    assert.equal(result.body.order.audit.filter((entry) => entry.action === action && entry.outcome === 'applied').length, 1);
    const retry = await decision(id, action, { expectedRevision: before.yandex.revision, expectedItemsRevision: before.yandex.itemsRevision });
    assert.equal(retry.body.idempotent, true); assert.equal(attempts(), 3);
    assert.equal(sale.reserveOrder.mock.callCount(), 1); assert.equal(sale.completeSale.mock.callCount(), action === 'ready' ? 1 : 0);
  });

  test(`${action} finalization retry observes cancellation and preserves proven accounting outcome`, async (t) => {
    await seed(); const { id } = await receive(); config.billzWriteEnabled = true;
    if (action !== 'accept') await decision(id, 'accept');
    const attempts = raceFinalization(t, id, action, async (attempt) => {
      assert.equal((await callback(id, attempt === 1 ? 'TAKEN_BY_COURIER' : 'CANCELLED')).status, 204);
    });
    assert.equal((await decision(id, action)).status, 409); assert.equal(attempts(), 2);
    const row = await raw(id); assert.equal(row.yandex.fulfillmentStatus, 'CANCELLED');
    assert.equal(row.status, action === 'ready' ? 'sold' : 'cancelled');
    assert.equal(row.yandex.reconciliationRequired, action === 'ready');
    assert.equal(sale.reserveOrder.mock.callCount(), 1); assert.equal(sale.completeSale.mock.callCount(), action === 'ready' ? 1 : 0);
    assert.equal(sale.releaseReservation.mock.callCount(), action === 'ready' ? 0 : 1);
  });
}

for (const [label, fields] of [
  ['lifecycle owner changed', { 'yandex.operation': { token: 'other-owner', startedAt: new Date() } }],
  ['core owner appeared', { 'billz.operationToken': 'other-core-owner', 'billz.operationStartedAt': new Date() }],
  ['core review', { 'billz.reconciliationRequired': true }],
  ['lifecycle review', { 'yandex.reconciliationRequired': true }],
  ['accounting proof lost', { status: 'failed', 'billz.failureDisposition': '' }],
  ['lifecycle lease stale', { 'yandex.operation.startedAt': new Date(Date.now() - 3600000) }],
]) {
  test(`finalization retry fails closed when ${label}`, async (t) => {
    await seed(); const { id } = await receive(); config.billzWriteEnabled = true; await decision(id, 'accept');
    const attempts = raceFinalization(t, id, 'cooking', async (attempt) => {
      if (attempt === 1) await callback(id, 'TAKEN_BY_COURIER');
      else await Order.updateOne({ internalOrderId: id }, { $set: fields });
    });
    assert.equal((await decision(id, 'cooking')).status, 409); assert.equal(attempts(), 2);
    const row = await raw(id); assert.equal(row.yandex.fulfillmentStatus, 'TAKEN_BY_COURIER');
    assert.equal(row.yandex.reconciliationRequired, true); assert.ok(row.yandex.operation?.token);
    if (label === 'lifecycle owner changed') assert.equal(row.yandex.operation.token, 'other-owner');
    if (label === 'core owner appeared') assert.equal(row.billz.operationToken, 'other-core-owner');
    assert.equal(sale.reserveOrder.mock.callCount(), 1); assert.equal(sale.completeSale.mock.callCount(), 0);
  });
}

for (const status of ['TAKEN_BY_COURIER', 'DELIVERED']) {
  test(`${status} followed by pre-acceptance cancellation never permits manual accounting`, async () => {
    await seed(); const { id } = await receive(); config.billzWriteEnabled = true;
    await callback(id, status, { attributes: ['paid'] }); await callback(id, 'CANCELLED'); await callback(id, 'DELIVERED');
    assert.equal((await get(id)).body.data.status, 'CANCELLED');
    assert.equal((await decision(id, 'accept')).status, 409); assert.equal((await edit(id, [])).status, 409);
    await require('../src/yandex/lifecycle').drainCancellations(); assert.equal((await raw(id)).status, 'cancelled');
    for (const method of ['reserveOrder', 'completeSale', 'releaseReservation', 'deleteDraft']) assert.equal(sale[method].mock.callCount(), 0);
  });
  test(`${status} before acceptance permits only explicit staff accounting and never freezes picks from callback`, async () => {
    await seed(); const { id } = await receive();
    assert.equal((await callback(id, status, { attributes: ['paid'] })).status, 204);
    const received = await raw(id);
    assert.equal(received.status, 'received'); assert.equal(received.yandex.itemsFrozen, false);
    assert.equal(received.billz.attempts, 0); assert.equal(received.yandex.reconciliationRequired, false);
    for (const callbackStatus of [status, 'TAKEN_BY_COURIER']) assert.equal((await callback(id, callbackStatus)).status, 204);
    assert.equal((await raw(id)).yandex.revision, received.yandex.revision);
    assert.equal((await decision(id, 'accept')).status, 503); assert.deepEqual(await raw(id), received);
    config.billzWriteEnabled = true; assert.ok((await get(id)).body.data.actions.includes('accept'));
    assert.equal((await edit(id, [{ billzProductId: 'p', quantity: 1 }])).status, 200);
    assert.equal((await raw(id)).yandex.itemsFrozen, false);
    assert.equal((await decision(id, 'accept', { expectedItemsRevision: 1 })).status, 409);
    assert.equal(sale.reserveOrder.mock.callCount(), 0); assert.equal(sale.completeSale.mock.callCount(), 0);
    const accepted = await decision(id, 'accept'); assert.equal(accepted.status, 200); assert.equal(accepted.body.order.status, status);
    assert.equal((await decision(id, 'accept')).status, 409);
    assert.equal((await decision(id, 'ready')).body.order.status, status);
    assert.equal((await decision(id, 'ready')).status, 409);
    assert.equal(sale.reserveOrder.mock.callCount(), 1); assert.equal(sale.completeSale.mock.callCount(), 1);
    await callback(id, 'CANCELLED'); await callback(id, 'DELIVERED');
    assert.equal((await get(id)).body.data.status, 'CANCELLED'); assert.equal((await decision(id, 'accept')).status, 409);
    assert.equal((await raw(id)).status, 'sold'); assert.equal(sale.releaseReservation.mock.callCount(), 0);
  });
}

async function soldHoldOwner(items = [{ billzProductId: 'p', quantity: 1, unitPrice: 80 }]) {
  const id = randomUUID();
  return Order.create({ channel: 'yandex', internalOrderId: id, externalId: id, status: 'reserved', items,
    yandex: { requestSnapshot: incoming() }, billz: { reservationApplied: true, operationToken: 'stock-owner', operationAction: 'complete' } });
}
async function finalizeStockOwner(order, soldAt) {
  await Order.updateOne({ _id: order._id }, { $set: { status: 'sold', soldAt,
    'billz.reservationApplied': false, 'billz.operationToken': '', 'billz.operationAction': '' } });
}
test('Yandex delayed concurrent transfer cannot enter after winning transfer finalizes and markers are cleaned', async (t) => {
  const soldAt = new Date(); const uzum = [{ orderId: 'uzum-independent', quantity: 2, soldAt }];
  await seed('p', { stock: 10, reservedQty: 3, uzumSoldHolds: uzum }); const order = await soldHoldOwner();
  const stock = require('../src/yandex/stock'); const entered = gate(); const resume = gate();
  const original = Order.findOneAndUpdate; let delayed = false;
  t.mock.method(Order, 'findOneAndUpdate', async function (...args) {
    if (!delayed) { delayed = true; entered.release(); await resume.promise; }
    return original.apply(this, args);
  });
  const loser = assert.rejects(stock.transferSoldHold(order, soldAt, Mirror, Order), { code: 'BILLZ_OPERATION_OWNERSHIP_LOST' });
  try {
    await entered.promise; await stock.transferSoldHold(order, soldAt, Mirror, Order);
    await finalizeStockOwner(order, soldAt);
    const at = new Date(soldAt.getTime() + 1);
    await Mirror.updateOne({ billzProductId: 'p' }, require('../src/uzum/stock').snapshotUpdate({ stock: 9 }, at, at));
    await stock.cleanupSoldHolds(Mirror, Order);
    assert.equal((await Mirror.findOne({ billzProductId: 'p' })).yandexSoldHolds.length, 0);
  } finally { resume.release(); }
  await loser;
  const product = await Mirror.findOne({ billzProductId: 'p' }).lean();
  assert.equal(product.reservedQty, 2); assert.deepEqual(product.yandexSoldHolds, []);
  assert.deepEqual(product.uzumSoldHolds, [{ ...uzum[0], quantity: 0 }]);
});

test('Yandex stock ownership lost between product updates preserves untouched reservations and both channel markers', async (t) => {
  const soldAt = new Date(); const uzum = [{ orderId: 'uzum-independent', quantity: 2, soldAt }];
  await seed('p', { stock: 10, reservedQty: 3, uzumSoldHolds: uzum });
  await seed('second', { stock: 10, reservedQty: 5, uzumSoldHolds: uzum });
  const order = await soldHoldOwner([{ billzProductId: 'p', quantity: 1, unitPrice: 80 }, { billzProductId: 'second', quantity: 2, unitPrice: 80 }]);
  const original = Mirror.updateOne; let lost = false;
  t.mock.method(Mirror, 'updateOne', async function (...args) {
    const result = await original.apply(this, args);
    if (!lost) { lost = true; await Order.updateOne({ _id: order._id }, { $set: { 'billz.operationToken': 'replacement-owner' } }); }
    return result;
  });
  await assert.rejects(require('../src/yandex/stock').transferSoldHold(order, soldAt, Mirror, Order), { code: 'BILLZ_OPERATION_OWNERSHIP_LOST' });
  const first = await Mirror.findOne({ billzProductId: 'p' }).lean(); const second = await Mirror.findOne({ billzProductId: 'second' }).lean();
  assert.equal(first.reservedQty, 2); assert.equal(first.yandexSoldHolds[0].quantity, 1);
  assert.equal(second.reservedQty, 5); assert.deepEqual(second.yandexSoldHolds, []);
  assert.deepEqual(first.uzumSoldHolds, uzum); assert.deepEqual(second.uzumSoldHolds, uzum);
  const fresh = await raw(order.internalOrderId); assert.equal(fresh.billz.operationToken, 'replacement-owner'); assert.equal(fresh.billz.reservationApplied, true);
});

test('Yandex interrupted cleanup retries remaining markers without touching Uzum evidence or reservations', async (t) => {
  const at = new Date(); const order = await soldHoldOwner(); await finalizeStockOwner(order, at);
  const uzum = [{ orderId: 'uzum-independent', quantity: 0, soldAt: at }];
  for (const id of ['p', 'second']) await seed(id, { reservedQty: 3, uzumSoldHolds: uzum,
    yandexSoldHolds: [{ orderId: order.internalOrderId, quantity: 0, soldAt: at }] });
  const stock = require('../src/yandex/stock'); const original = Mirror.updateOne; let pulls = 0;
  t.mock.method(Mirror, 'updateOne', function (filter, update, ...args) {
    if (update.$pull && ++pulls === 2) throw new Error('local cleanup interrupted');
    return original.call(this, filter, update, ...args);
  });
  await assert.rejects(stock.cleanupSoldHolds(Mirror, Order), /local cleanup interrupted/);
  assert.deepEqual((await Mirror.find({}).lean()).map((p) => p.yandexSoldHolds.length).sort(), [0, 1]);
  await stock.cleanupSoldHolds(Mirror, Order); await stock.cleanupSoldHolds(Mirror, Order);
  for (const product of await Mirror.find({}).lean()) {
    assert.deepEqual(product.yandexSoldHolds, []); assert.deepEqual(product.uzumSoldHolds, uzum); assert.equal(product.reservedQty, 3);
  }
  assert.equal((await raw(order.internalOrderId)).status, 'sold'); assert.equal(sale.completeSale.mock.callCount(), 0);
});

for (const [label, fields] of [
  ['different channel', { channel: 'uzum' }], ['not sold', { status: 'reserved' }],
  ['reservation still applied', { 'billz.reservationApplied': true }], ['core owner', { 'billz.operationToken': 'core-owner' }],
  ['core reconciliation', { 'billz.reconciliationRequired': true }],
  ['Yandex owner', { 'yandex.operation': { token: 'yandex-owner', startedAt: new Date() } }],
  ['Yandex reconciliation', { 'yandex.reconciliationRequired': true }],
  ['cancellation intent', { 'yandex.cancelRequested': { at: new Date(), actor, reason: 'cancelled' }, 'yandex.cancellationPending': true }],
]) {
  test(`Yandex cleanup retains zero marker with ${label}`, async () => {
    const at = new Date(); const order = await soldHoldOwner(); await finalizeStockOwner(order, at);
    await Order.updateOne({ _id: order._id }, { $set: fields });
    const yandex = [{ orderId: order.internalOrderId, quantity: 0, soldAt: at }, { orderId: 'uncovered', quantity: 3, soldAt: at }];
    const uzum = [{ orderId: 'other-channel', quantity: 0, soldAt: at }];
    await seed('p', { reservedQty: 2, yandexSoldHolds: yandex, uzumSoldHolds: uzum });
    const before = await raw(order.internalOrderId);
    await require('../src/yandex/stock').cleanupSoldHolds(Mirror, Order);
    const product = await Mirror.findOne({ billzProductId: 'p' }).lean();
    assert.deepEqual(product.yandexSoldHolds, yandex); assert.deepEqual(product.uzumSoldHolds, uzum); assert.equal(product.reservedQty, 2);
    assert.deepEqual(await raw(order.internalOrderId), before);
  });
}
