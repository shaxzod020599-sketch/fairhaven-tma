const assert = require('node:assert/strict');
const test = require('node:test');
const mongoose = require('mongoose');

/**
 * The operator workbench contracts: legal status transitions with history,
 * claim conflicts, internal notes, customer block, audit redaction, dashboard
 * aggregation, global search and broadcast guards.
 *
 * Run against a real MongoDB because the properties that matter — schema
 * defaults on old documents, atomic draft→sending, aggregation shapes — are
 * enforced by the database, not by JavaScript.
 */

let mongod;
let Order;
let User;
let Product;
let AuditLog;
let Broadcast;
let workflow;
let adminAudit;
let broadcastService;
let ops;

const ADMIN = { telegramId: 10001, firstName: 'Ольга', lastName: 'Оператор', username: 'olga' };

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

function request({ params = {}, body = {}, query = {}, admin = ADMIN, bot = null } = {}) {
  return { params, body, query, admin, app: { locals: { bot } } };
}

test.before(async () => {
  const { MongoMemoryServer } = require('mongodb-memory-server');
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { dbName: 'admin-ops-test' });

  Order = require('../models/Order');
  User = require('../models/User');
  Product = require('../models/Product');
  AuditLog = require('../models/AuditLog');
  Broadcast = require('../models/Broadcast');
  workflow = require('../services/orderWorkflow');
  adminAudit = require('../services/adminAudit');
  broadcastService = require('../services/broadcastService');
  ops = require('../controllers/adminOperationsController');
});

test.after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

test.beforeEach(async () => {
  await Promise.all([
    Order.deleteMany({}),
    User.deleteMany({}),
    Product.deleteMany({}),
    AuditLog.deleteMany({}),
    Broadcast.deleteMany({}),
  ]);
});

function makeOrder(over = {}) {
  return Order.create({
    telegramId: 20001,
    items: [{ productId: new mongoose.Types.ObjectId(), name: 'ФертилАид', price: 100000, quantity: 2 }],
    subtotal: 200000,
    totalAmount: 220000,
    deliveryFee: 20000,
    status: 'pending',
    customerName: 'Дилноза Каримова',
    customerPhone: '+998901112233',
    ...over,
  });
}

// ── Workflow ────────────────────────────────────────────────────────────────

test('every legal transition is accepted and recorded in history', async () => {
  const chain = ['confirmed', 'preparing', 'delivering', 'delivered', 'returned'];
  const order = await makeOrder();
  for (const to of chain) {
    workflow.transition({ order, to, reason: to === 'returned' ? 'брак упаковки' : '', admin: ADMIN });
  }
  await order.save();

  const saved = await Order.findById(order._id).lean();
  assert.equal(saved.status, 'returned');
  assert.deepEqual(saved.statusHistory.map((h) => h.status), chain);
  assert.equal(saved.statusHistory[0].by.telegramId, 10001);
  assert.equal(saved.statusHistory[0].by.name, 'Ольга Оператор');
  assert.equal(saved.statusHistory.at(-1).reason, 'брак упаковки');
});

test('illegal and backward transitions are rejected', async () => {
  const order = await makeOrder({ status: 'delivered' });
  for (const to of ['pending', 'confirmed', 'preparing', 'delivering']) {
    assert.throws(
      () => workflow.transition({ order, to, admin: ADMIN }),
      (err) => err.code === 'illegal_transition'
    );
  }
  assert.throws(
    () => workflow.transition({ order, to: 'unknown-state', admin: ADMIN }),
    (err) => err.code === 'invalid_status'
  );
});

test('cancellation and return demand a reason', async () => {
  const order = await makeOrder();
  assert.throws(
    () => workflow.transition({ order, to: 'cancelled', reason: '   ', admin: ADMIN }),
    (err) => err.code === 'reason_required'
  );
  workflow.transition({ order, to: 'cancelled', reason: 'клиент не отвечает', admin: ADMIN });
  assert.equal(order.status, 'cancelled');
});

test('orders created before the workbench keep working: defaults are safe', async () => {
  // Simulate an old document: no history, no notes, no claim fields.
  await Order.collection.insertOne({
    telegramId: 1,
    items: [{ productId: new mongoose.Types.ObjectId(), name: 'X', price: 1, quantity: 1 }],
    totalAmount: 1,
    status: 'pending',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const order = await Order.findOne({ telegramId: 1 });
  assert.deepEqual(order.statusHistory.toObject ? order.statusHistory.toObject() : order.statusHistory, []);
  workflow.transition({ order, to: 'confirmed', admin: ADMIN });
  await order.save();
  assert.equal((await Order.findById(order._id)).statusHistory.length, 1);
});

test('transition endpoint refuses an illegal jump with the allowed list', async () => {
  const order = await makeOrder();
  const res = response();
  await ops.transitionOrder(request({ params: { id: String(order._id) }, body: { to: 'delivered' } }), res);
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.error, 'illegal_transition');
  assert.deepEqual(res.body.allowed, ['confirmed', 'cancelled']);
  assert.equal((await Order.findById(order._id)).status, 'pending');
});

test('transition endpoint moves the order and answers with next actions', async () => {
  const order = await makeOrder();
  const res = response();
  await ops.transitionOrder(request({ params: { id: String(order._id) }, body: { to: 'confirmed' } }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.order.status, 'confirmed');
  assert.deepEqual(res.body.data.actions, ['preparing', 'cancelled']);

  const audits = await AuditLog.find({ action: 'order.transition' });
  assert.equal(audits.length, 1);
  assert.equal(audits[0].summary.from, 'pending');
  assert.equal(audits[0].summary.to, 'confirmed');
});

// ── Claim and notes ─────────────────────────────────────────────────────────

test('claim conflict: the second admin is told who holds the order', async () => {
  const order = await makeOrder();
  const first = response();
  await ops.claimOrder(request({ params: { id: String(order._id) } }), first);
  assert.equal(first.body.data.claimedBy.telegramId, 10001);

  const rival = response();
  await ops.claimOrder(
    request({ params: { id: String(order._id) }, admin: { telegramId: 10002, firstName: 'Борис' } }),
    rival
  );
  assert.equal(rival.statusCode, 409);
  assert.equal(rival.body.error, 'claimed_by_other');

  const release = response();
  await ops.claimOrder(request({ params: { id: String(order._id) }, body: { release: true } }), release);
  assert.equal(release.body.data.claimedBy.telegramId, null);
});

test('internal notes record author and refuse empty text', async () => {
  const order = await makeOrder();
  const empty = response();
  await ops.addOrderNote(request({ params: { id: String(order._id) }, body: { text: '   ' } }), empty);
  assert.equal(empty.statusCode, 400);

  const res = response();
  await ops.addOrderNote(request({ params: { id: String(order._id) }, body: { text: 'Позвонить после 18:00' } }), res);
  assert.equal(res.body.data.internalNotes.length, 1);
  assert.equal(res.body.data.internalNotes[0].by.name, 'Ольга Оператор');
});

test('order detail includes customer context and legal actions', async () => {
  await User.create({ telegramId: 20001, firstName: 'Дилноза', registrationStep: 'done', consentAccepted: true });
  const order = await makeOrder();
  await makeOrder({ status: 'delivered' });

  const res = response();
  await ops.getOrderDetail(request({ params: { id: String(order._id) } }), res);
  assert.equal(res.body.data.customer.ordersCount, 2);
  assert.deepEqual(res.body.data.actions, ['confirmed', 'cancelled']);
  assert.equal(res.body.data.canRevert, false);
});

// ── Customers ───────────────────────────────────────────────────────────────

test('customer block flag flips and is audited without leaking credentials', async () => {
  await User.create({ telegramId: 20001, firstName: 'Дилноза', registrationStep: 'done', consentAccepted: true });
  const res = response();
  await ops.blockCustomer(request({ params: { telegramId: '20001' }, body: { blocked: true } }), res);
  assert.equal(res.body.data.customerBlocked, true);

  const audits = await AuditLog.find({ action: 'customer.block' });
  assert.equal(audits.length, 1);
});

test('audit redaction strips credential-shaped keys at any depth', () => {
  const cleaned = adminAudit.redact({
    name: 'ok',
    token: 'top-secret',
    nested: { clientSecret: 'x', authorization: 'Bearer y', initData: 'z', keep: 1 },
  });
  assert.deepEqual(cleaned, { name: 'ok', nested: { keep: 1 } });
});

// ── Dashboard ───────────────────────────────────────────────────────────────

test('dashboard aggregates revenue, average check and top products for the period', async () => {
  await makeOrder({ status: 'delivered', totalAmount: 300000 });
  await makeOrder({ status: 'confirmed', totalAmount: 100000 });
  await makeOrder({ status: 'cancelled', totalAmount: 999999 });
  // Outside the 7d window — must not count.
  await makeOrder({ status: 'delivered', totalAmount: 500000, createdAt: new Date(Date.now() - 10 * 86400000) });

  const res = response();
  await ops.dashboard(request({ query: { period: '7d' } }), res);
  const { metrics, topProducts, series } = res.body.data;
  assert.equal(metrics.revenue, 400000);
  assert.equal(metrics.averageCheck, 200000);
  assert.equal(metrics.cancelled, 1);
  assert.equal(topProducts[0].name, 'ФертилАид');
  assert.equal(topProducts[0].quantity, 4);
  assert.ok(series.length >= 7, `expected ≥7 daily buckets, got ${series.length}`);
  assert.equal(series.reduce((sum, b) => sum + b.value, 0), 400000);

  assert.deepEqual(res.body.data.sources.map((source) => source.source), [
    'fairhaven.uz', 'medicalka', 'uzum',
  ]);
  assert.equal(res.body.data.sources[0].state, 'fresh');
  assert.equal(res.body.data.sources[0].metrics.grossRevenue, 300000);
  assert.equal(res.body.data.sources[1].state, 'unavailable');
  assert.equal(res.body.data.sources[2].state, 'unavailable');
  assert.equal(res.body.data.billz.state, 'unavailable');
  assert.ok(res.body.data.attention.some((item) => item.destination === '/billz'));
});

// ── Search ──────────────────────────────────────────────────────────────────

test('dashboard low-stock query and projection count both independent sold holds', async () => {
  await Product.create({ name: 'Mixed holds', price: 100, category: 'vitamins', billzProductId: 'mixed-holds' });
  const mirrors = mongoose.connection.collection('billzproducts');
  await mirrors.insertOne({ billzProductId: 'mixed-holds', stock: 20, reservedQty: 1, pendingQty: 1,
    deletedInBillz: false, uzumSoldHolds: [{ quantity: 8 }], yandexSoldHolds: [{ quantity: 9 }] });
  try {
    const res = response(); await ops.dashboard(request(), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.lowStock.find((item) => item.name === 'Mixed holds').available, 1);
  } finally { await mirrors.deleteOne({ billzProductId: 'mixed-holds' }); }
});

test('global search finds orders by id suffix, customers by phone, products by sku', async () => {
  const order = await makeOrder();
  await User.create({ telegramId: 20007, firstName: 'Малика', phone: '+998977778899', registrationStep: 'done', consentAccepted: true });
  await Product.create({ name: 'OvaBoost', sku: 'FH-2090', price: 450000, category: 'vitamins' });

  const suffix = String(order._id).slice(-6);
  const bySuffix = response();
  await ops.search(request({ query: { q: suffix } }), bySuffix);
  assert.equal(bySuffix.body.data.orders.length, 1);

  const byPhone = response();
  await ops.search(request({ query: { q: '7778899' } }), byPhone);
  assert.equal(byPhone.body.data.customers.length, 1);

  const bySku = response();
  await ops.search(request({ query: { q: 'fh-2090' } }), bySku);
  assert.equal(bySku.body.data.products.length, 1);

  const tooShort = response();
  await ops.search(request({ query: { q: 'a' } }), tooShort);
  assert.deepEqual(tooShort.body.data.orders, []);
});

// ── Broadcasts ──────────────────────────────────────────────────────────────

async function seedAudience() {
  const base = { registrationStep: 'done', consentAccepted: true, role: 'user' };
  await User.create([
    { telegramId: 1, firstName: 'A', ...base },
    { telegramId: 2, firstName: 'B', ...base },
    { telegramId: 3, firstName: 'C', ...base, botBlocked: true },
    { telegramId: 4, firstName: 'D', ...base, customerBlocked: true },
    { telegramId: 5, firstName: 'E', ...base, notificationsEnabled: false },
    { telegramId: 6, firstName: 'Админ', ...base, role: 'admin' },
  ]);
  await makeOrder({ telegramId: 1 });
  await makeOrder({ telegramId: 2, createdAt: new Date(Date.now() - 40 * 86400000) });
}

test('segments exclude blocked, muted and admin accounts', async () => {
  await seedAudience();
  assert.equal((await broadcastService.resolveSegment('all')).count, 2);
  assert.deepEqual((await broadcastService.resolveSegment('recent30')).telegramIds, [1]);
  assert.deepEqual((await broadcastService.resolveSegment('inactive90')).telegramIds, []);
  await assert.rejects(() => broadcastService.resolveSegment('everyone'), (err) => err.code === 'invalid_segment');
});

test('a broadcast cannot be sent before the admin receives a test copy', async () => {
  await seedAudience();
  const sent = [];
  const bot = { telegram: { sendMessage: async (chatId, text) => { sent.push({ chatId, text }); } } };

  const created = response();
  await ops.createBroadcast(request({ body: { segment: 'all', text: 'Витамины со скидкой 20%' } }), created);
  const id = String(created.body.data._id);
  assert.equal(created.body.data.counts.targets, 2);

  const premature = response();
  await ops.sendBroadcast(request({ params: { id }, body: { confirm: true }, bot }), premature);
  assert.equal(premature.statusCode, 409);
  assert.equal(premature.body.error, 'test_required');

  const tested = response();
  await ops.testBroadcast(request({ params: { id }, bot }), tested);
  assert.equal(tested.body.data.status, 'tested');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].chatId, ADMIN.telegramId);

  const unconfirmed = response();
  await ops.sendBroadcast(request({ params: { id }, bot }), unconfirmed);
  assert.equal(unconfirmed.statusCode, 400);
  assert.equal(unconfirmed.body.error, 'confirmation_required');

  const send = response();
  await ops.sendBroadcast(request({ params: { id }, body: { confirm: true }, bot }), send);
  assert.equal(send.body.data.status, 'sending');

  // Delivery runs detached; wait for it to finish.
  for (let i = 0; i < 100; i += 1) {
    const current = await Broadcast.findById(id).lean();
    if (current.status === 'completed') break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const finished = await Broadcast.findById(id).lean();
  assert.equal(finished.status, 'completed');
  assert.equal(finished.counts.sent, 2);
  assert.equal(sent.length, 3); // 1 test + 2 recipients

  const again = response();
  await ops.sendBroadcast(request({ params: { id }, body: { confirm: true }, bot }), again);
  assert.equal(again.statusCode, 409);
  assert.equal(again.body.error, 'already_sent');
});
