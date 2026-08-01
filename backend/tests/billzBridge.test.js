const assert = require('node:assert/strict');
const test = require('node:test');
const http = require('node:http');
const mongoose = require('mongoose');

/**
 * The bridge that carries bot orders into Billz.
 *
 * Run against a real MongoDB and a real HTTP hub, because the two properties
 * that matter are enforced by neither JavaScript nor a mock: the atomic claim
 * that stops two backend instances working the same order, and the scan that
 * derives a goal from status rather than from an event someone remembered to
 * fire. A stubbed `findOneAndUpdate` proves nothing about the first, and a
 * stubbed queue hides the second entirely.
 */

let mongod;
let Order;
let Product;
let bridge;
let hub;
let hubCalls = [];
let hubReply = () => ({ status: 200, body: { ok: true, status: 'reserved', applied: true } });

test.before(async () => {
  const { MongoMemoryServer } = require('mongodb-memory-server');
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { dbName: 'bridge-test' });

  Order = require('../models/Order');
  Product = require('../models/Product');
  bridge = require('../services/billzBridge');

  hub = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      const payload = body ? JSON.parse(body) : {};
      hubCalls.push({ path: req.url, token: req.headers['x-internal-token'], payload });
      const reply = hubReply(payload);
      res.writeHead(reply.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(reply.body));
    });
  });
  await new Promise((resolve) => hub.listen(0, '127.0.0.1', resolve));

  process.env.BILLZ_BRIDGE_ENABLED = 'true';
  process.env.CHANNEL_INTERNAL_TOKEN = 'internal-token-for-tests';
  process.env.BILLZ_BRIDGE_SINCE = '2026-01-01T00:00:00.000Z';
  process.env.CHANNEL_HUB_URL = `http://127.0.0.1:${hub.address().port}`;
});

test.after(async () => {
  await mongoose.disconnect();
  await mongod?.stop();
  await new Promise((resolve) => hub.close(resolve));
});

test.beforeEach(async () => {
  hubCalls = [];
  hubReply = () => ({ status: 200, body: { ok: true, status: 'reserved', applied: true } });
  await Order.deleteMany({});
  await Product.deleteMany({});
});

let seq = 0;
async function linkedProduct({ billzProductId = null } = {}) {
  seq += 1;
  return Product.create({
    name: `Product ${seq}`,
    category: 'vitamins',
    price: 150000,
    ...(billzProductId === null ? { billzProductId: `bp-${seq}` } : { billzProductId }),
  });
}

async function orderFor(product, over = {}) {
  return Order.create({
    telegramId: 1000 + seq,
    items: [{ productId: product._id, name: product.name, price: 150000, quantity: 2 }],
    subtotal: 300000,
    totalAmount: 300000,
    status: 'pending',
    location: { lat: 0, lng: 0, addressString: 'Tashkent' },
    ...over,
  });
}

/* ── The switch ──────────────────────────────────────────────────────────── */

test('the bridge does nothing until it is switched on', async () => {
  const previous = process.env.BILLZ_BRIDGE_ENABLED;
  process.env.BILLZ_BRIDGE_ENABLED = 'false';

  const result = await bridge.runOnce();

  assert.equal(result.skipped, true);
  assert.match(result.reason, /BILLZ_BRIDGE_ENABLED/);
  assert.equal(hubCalls.length, 0);
  process.env.BILLZ_BRIDGE_ENABLED = previous;
});

test('a missing start date keeps it off rather than replaying everything', async () => {
  // Turning the bridge on with no cutoff would push the entire order history
  // into Billz as fresh reservations.
  const previous = process.env.BILLZ_BRIDGE_SINCE;
  process.env.BILLZ_BRIDGE_SINCE = '';

  const result = await bridge.runOnce();

  assert.equal(result.skipped, true);
  assert.match(result.reason, /BILLZ_BRIDGE_SINCE/);
  process.env.BILLZ_BRIDGE_SINCE = previous;
});

test('orders placed before the start date are never touched', async () => {
  const product = await linkedProduct();
  const old = await orderFor(product);
  // Straight through the driver: mongoose marks createdAt immutable and would
  // silently drop it from the update.
  await Order.collection.updateOne(
    { _id: old._id },
    { $set: { createdAt: new Date('2025-06-01') } }
  );

  const result = await bridge.runOnce();

  assert.equal(result.examined, 0);
  assert.equal(hubCalls.length, 0);
  const untouched = await Order.findById(old._id).lean();
  assert.equal(untouched.billzSync.dispatched, '');
});

/* ── Deriving the goal ───────────────────────────────────────────────────── */

test('each order status maps to the stock action it implies', () => {
  assert.deepEqual(bridge.GOAL_BY_STATUS, {
    pending: 'hold',
    confirmed: 'reserve',
    preparing: 'reserve',
    delivering: 'reserve',
    delivered: 'sell',
    cancelled: 'cancel',
  });
});

test('a pending order asks for a local hold', async () => {
  const product = await linkedProduct();
  await orderFor(product);

  const result = await bridge.runOnce();

  assert.equal(result.dispatched, 1);
  assert.equal(hubCalls.length, 1);
  assert.equal(hubCalls[0].path, '/internal/bot-order');
  assert.equal(hubCalls[0].payload.target, 'hold');
  assert.equal(hubCalls[0].token, 'internal-token-for-tests');
});

test('a confirmed order asks for a reservation, and a delivered one for a sale', async () => {
  const product = await linkedProduct();
  const order = await orderFor(product, { status: 'confirmed' });
  await bridge.runOnce();
  assert.equal(hubCalls.at(-1).payload.target, 'reserve');

  // The operator marks it delivered; the next pass picks the change up on its
  // own, with no event to fire and nothing to remember.
  await Order.updateOne({ _id: order._id }, { $set: { status: 'delivered' } });
  await bridge.runOnce();
  assert.equal(hubCalls.at(-1).payload.target, 'sell');
});

test('a goal already dispatched is not sent again', async () => {
  const product = await linkedProduct();
  await orderFor(product, { status: 'confirmed' });

  await bridge.runOnce();
  await bridge.runOnce();

  assert.equal(hubCalls.length, 1);
});

test('the payload carries the price the customer was actually charged', async () => {
  // Billz must record real revenue. Recomputing from the current retail price
  // would rewrite history every time somebody edits a product.
  const product = await linkedProduct();
  await orderFor(product, { status: 'confirmed' });
  await Product.updateOne({ _id: product._id }, { $set: { price: 999999 } });

  await bridge.runOnce();

  const line = hubCalls[0].payload.items[0];
  assert.equal(line.unitPrice, 150000);
  assert.equal(line.quantity, 2);
  assert.equal(line.billzProductId, product.billzProductId);
});

/* ── Lines with no Billz counterpart ─────────────────────────────────────── */

test('an order of hand-managed products is settled without calling the hub', async () => {
  const product = await linkedProduct({ billzProductId: '' });
  const order = await orderFor(product, { status: 'confirmed' });

  const result = await bridge.runOnce();

  assert.equal(result.unlinked, 1);
  assert.equal(hubCalls.length, 0);
  const settled = await Order.findById(order._id).lean();
  assert.equal(settled.billzSync.dispatched, 'reserve');
  assert.equal(settled.billzSync.nextAttemptAt, null);
});

/* ── Failure handling ────────────────────────────────────────────────────── */

test('an unreachable hub backs the order off instead of losing it', async () => {
  const product = await linkedProduct();
  const order = await orderFor(product, { status: 'confirmed' });
  hubReply = () => ({ status: 502, body: { ok: false, error: 'billz down' } });

  const result = await bridge.runOnce();

  assert.equal(result.failed, 1);
  const stored = await Order.findById(order._id).lean();
  assert.equal(stored.billzSync.dispatched, '', 'a failure must not count as dispatched');
  assert.match(stored.billzSync.lastError, /billz down/);
  assert.ok(stored.billzSync.nextAttemptAt > new Date(), 'must be scheduled for a retry');
});

test('backoff grows with each attempt and stops at the ceiling', () => {
  assert.equal(bridge.backoffFor(1), 30 * 1000);
  assert.equal(bridge.backoffFor(2), 60 * 1000);
  assert.equal(bridge.backoffFor(3), 120 * 1000);
  assert.equal(bridge.backoffFor(50), 15 * 60 * 1000);
});

test('an order waiting out its backoff is skipped, then retried', async () => {
  const product = await linkedProduct();
  const order = await orderFor(product, { status: 'confirmed' });
  hubReply = () => ({ status: 502, body: { ok: false, error: 'down' } });
  await bridge.runOnce();
  assert.equal(hubCalls.length, 1);

  // Still backing off.
  await bridge.runOnce();
  assert.equal(hubCalls.length, 1);

  // Backoff elapsed, hub recovered.
  await Order.updateOne({ _id: order._id }, { $set: { 'billzSync.nextAttemptAt': new Date(0) } });
  hubReply = () => ({ status: 200, body: { ok: true, status: 'reserved', applied: true } });
  await bridge.runOnce();

  assert.equal(hubCalls.length, 2);
  assert.equal((await Order.findById(order._id).lean()).billzSync.dispatched, 'reserve');
});

test('a rejected payload is recorded as a conflict rather than retried forever', async () => {
  const product = await linkedProduct();
  const order = await orderFor(product, { status: 'confirmed' });
  hubReply = () => ({ status: 422, body: { error: 'target must be one of hold, reserve' } });

  await bridge.runOnce();
  await bridge.runOnce();

  assert.equal(hubCalls.length, 1, 'a 422 is the same bytes every time — sending them again is noise');
  const stored = await Order.findById(order._id).lean();
  assert.match(stored.billzSync.conflict, /target must be one of/);
});

test('a conflict reported by the hub stops the retries and is kept for an operator', async () => {
  const product = await linkedProduct();
  const order = await orderFor(product, { status: 'cancelled' });
  hubReply = () => ({
    status: 200,
    body: { ok: true, status: 'sold', applied: false, conflict: 'already_sold — a delivered order is returned' },
  });

  const result = await bridge.runOnce();

  assert.equal(result.conflict, 1);
  const stored = await Order.findById(order._id).lean();
  assert.match(stored.billzSync.conflict, /already_sold/);

  await bridge.runOnce();
  assert.equal(hubCalls.length, 1);
});

/* ── Two instances ───────────────────────────────────────────────────────── */

test('two workers scanning at once do not both dispatch the same order', async () => {
  // PM2 in cluster mode runs several copies of this process. Without the claim
  // both would post the same goal, and while the hub is idempotent, the second
  // call would still be counted as a fresh attempt against Billz.
  const product = await linkedProduct();
  await orderFor(product, { status: 'confirmed' });

  const slow = new Promise((resolve) => setTimeout(resolve, 50));
  hubReply = () => ({ status: 200, body: { ok: true, status: 'reserved', applied: true } });

  await Promise.all([bridge.runOnce(), bridge.runOnce(), slow]);

  assert.equal(hubCalls.length, 1);
});

test('a worker that dies mid-request releases the order when the lease lapses', async () => {
  const product = await linkedProduct();
  const order = await orderFor(product, { status: 'confirmed' });

  // Simulate a claim that never completed: leased, never resolved.
  await Order.updateOne({ _id: order._id }, {
    $set: { 'billzSync.nextAttemptAt': new Date(Date.now() - 1000), 'billzSync.attempts': 1 },
  });

  const result = await bridge.runOnce();

  assert.equal(result.dispatched, 1);
});

/* ── The scan itself ─────────────────────────────────────────────────────── */

test('the scan filter is index-shaped and excludes settled orders', () => {
  const filter = bridge.pendingFilter(new Date('2026-01-01'), new Date('2026-02-01'));

  // One clause per status rather than an $expr field comparison, which cannot
  // use an index.
  assert.equal(filter.$or.length, Object.keys(bridge.GOAL_BY_STATUS).length);
  assert.ok(filter.$or.every((clause) => clause.status && clause['billzSync.dispatched'].$ne));
  assert.equal(filter['billzSync.conflict'], '');
  assert.deepEqual(filter.createdAt, { $gte: new Date('2026-01-01') });
});

test('a status with no stock meaning is left alone', async () => {
  const product = await linkedProduct();
  await orderFor(product, { status: 'confirmed' });
  await Order.updateMany({}, { $set: { status: 'preparing' } });

  await bridge.runOnce();

  // preparing still means reserved — the order is being packed, the stock is
  // committed. What must not happen is a second, different goal.
  assert.equal(hubCalls.length, 1);
  assert.equal(hubCalls[0].payload.target, 'reserve');
});
