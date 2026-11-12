const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');
const test = require('node:test');

process.env.BILLZ_SECRET_TOKEN = 'test-secret';
process.env.BILLZ_SHOP_ID = 'shop-a';
process.env.BILLZ_CASHBOX_ID = 'till-1';
process.env.BILLZ_PAYMENT_TYPE_ID = 'pt-transfer';
process.env.BILLZ_WRITE_ENABLED = 'true';
process.env.MONGO_DB_NAME = 'partner-api-test';
process.env.SYNC_ON_BOOT = 'false';
process.env.CHANNEL_TELEGRAM_ENABLED = 'false';
process.env.DISABLE_RATE_LIMIT = 'true';
process.env.CHANNEL_INTERNAL_TOKEN = 'internal-test-token-0123456789';
process.env.PARTNER_CREDENTIALS_ENCRYPTION_KEY = 'partner-test-encryption-key-0123456789abcdef';
process.env.PARTNER_TEST_DECISION_SECONDS = '0';
process.env.PARTNER_ALLOW_INSECURE_WEBHOOKS = 'true';

let mongod;
let db;
let server;
let base;
let config;
let registry;
let runtime;
let webhooks;
let billzAuth;
let ChannelOrder;
let BillzProduct;
let PartnerOrder;
let PartnerEvent;
let sale;
let billzCalls;
let keys;
let medicalkaToken;
const saved = {};

test.before(async () => {
  const { MongoMemoryServer } = require('../../backend/node_modules/mongodb-memory-server');
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();
  db = require('../src/db');
  await db.connect();

  config = require('../src/config');
  ChannelOrder = require('../src/models/ChannelOrder');
  BillzProduct = require('../src/models/BillzProduct');
  PartnerOrder = require('../src/models/PartnerOrder');
  PartnerEvent = require('../src/models/PartnerEvent');
  const ChannelKey = require('../src/models/ChannelKey');
  registry = require('../src/partners/registry');
  runtime = require('../src/partners/runtime');
  webhooks = require('../src/partners/webhooks');
  billzAuth = require('../src/billz/auth');
  sale = require('../src/billz/sale');
  await Promise.all([ChannelOrder().init(), PartnerOrder().init()]);

  for (const fn of ['reserveOrder', 'completeSale', 'releaseReservation', 'deleteDraft']) saved[fn] = sale[fn];
  sale.reserveOrder = async (args) => {
    billzCalls.push({ fn: 'reserveOrder', key: args.key, items: args.items });
    return { orderId: `draft-${billzCalls.length}`, orderNumber: String(100 + billzCalls.length) };
  };
  sale.completeSale = async (id, args) => {
    billzCalls.push({ fn: 'completeSale', id, key: args.key, paymentTypeId: args.paymentTypeId });
    return {};
  };
  sale.releaseReservation = async (id, args) => {
    billzCalls.push({ fn: 'releaseReservation', id, key: args?.key });
    return {};
  };
  sale.deleteDraft = async () => ({});

  medicalkaToken = ChannelKey.generateKey('medicalka', 'token');
  const shape = ChannelKey.describeKey(medicalkaToken);
  await ChannelKey().create({
    channel: 'medicalka', kind: 'token', hash: ChannelKey.hashKey(medicalkaToken),
    prefix: shape.prefix, last4: shape.last4, active: true,
  });

  await BillzProduct().create([
    { billzProductId: 'bp-1', name: 'Vitamin C', barcode: '4600000000011', stock: 10, medicalkaId: 701 },
    { billzProductId: 'bp-2', name: 'Omega 3', barcode: '4600000000028', stock: 0, medicalkaId: 702 },
    { billzProductId: 'bp-3', name: 'Hidden', stock: 50, medicalkaId: 703 },
  ]);
  await db.getConnection().collection('products').insertMany([
    {
      name: 'Витамин C 1000', brand: 'FairHaven', category: 'vitamins', billzProductId: 'bp-1',
      imageUrl: '/uploads/c.jpg', mxikCode: '03004001001000000',
      channels: { partners: { enabled: true, price: 120000, oldPrice: 150000, minStock: 1 } },
    },
    {
      name: 'Омега 3', category: 'supplements', billzProductId: 'bp-2',
      channels: { partners: { enabled: true, price: 90000 } },
    },
    {
      // Not switched on for partners: must never be visible or orderable.
      name: 'Скрытый', category: 'vitamins', billzProductId: 'bp-3',
      channels: { medicalka: { enabled: true, price: 1000 } },
    },
  ]);

  const created = await registry.create({ code: 'apteka24', name: 'Apteka 24' });
  keys = created.keys;

  const { app } = require('../src/server');
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.beforeEach(() => {
  billzCalls = [];
  config.billzWriteEnabled = true;
});

test.after(async () => {
  Object.assign(sale, saved);
  server?.close();
  await db?.disconnect();
  await mongod?.stop();
});

async function call(method, path, { key, body, headers = {} } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

const internal = (method, path, body) => call(method, `/internal/partners${path}`, {
  body, headers: { 'X-Internal-Token': process.env.CHANNEL_INTERNAL_TOKEN },
});

const order = (orderId, items = [{ product_id: 701, quantity: 2 }], extra = {}) => ({
  order_id: orderId,
  items,
  customer: { name: 'Ali Valiyev', phone: '+998901112233' },
  delivery: { type: 'courier', address: 'Toshkent, Chilonzor 1' },
  ...extra,
});

async function setMode(mode) {
  await registry.update('apteka24', { mode });
}

test('keys: the read token reads, only the secret writes, other channels are refused', async () => {
  assert.equal((await call('GET', '/partner/v1/me')).status, 401);
  const me = await call('GET', '/partner/v1/me', { key: keys.token });
  assert.equal(me.status, 200);
  assert.equal(me.body.partner.code, 'apteka24');
  assert.equal(me.body.partner.mode, 'test');

  const viaHeader = await call('GET', '/partner/v1/me', { headers: { 'X-Api-Key': keys.secret } });
  assert.equal(viaHeader.status, 200);
  assert.equal(viaHeader.body.key, 'secret');

  const wrongKey = await call('POST', '/partner/v1/orders', { key: keys.token, body: order('t-0') });
  assert.equal(wrongKey.status, 401);
  assert.match(wrongKey.body.error.message, /order secret/);

  assert.equal((await call('GET', '/partner/v1/me', { key: medicalkaToken })).status, 401);
});

test('catalogue and stock: only partner products, zero stock stays listed, safety stock held back', async () => {
  const products = await call('GET', '/partner/v1/products', { key: keys.token });
  assert.equal(products.status, 200);
  assert.equal(products.body.total, 2);
  const vitamin = products.body.items.find((p) => p.id === 701);
  assert.equal(vitamin.price, 120000);
  assert.equal(vitamin.old_price, 150000);
  assert.equal(vitamin.quantity, 9, 'minStock 1 is held back from 10');
  assert.equal(vitamin.category_name, 'Витамины');
  assert.equal(vitamin.mxik, '03004001001000000');
  assert.ok(!products.body.items.some((p) => p.id === 703));

  const stock = await call('GET', '/partner/v1/stock', { key: keys.token });
  assert.deepEqual(
    stock.body.items.map((row) => [row.product_id, row.quantity, row.available]).sort(),
    [[701, 9, true], [702, 0, false]]
  );

  assert.equal((await call('GET', '/partner/v1/products/703', { key: keys.token })).status, 404);
  assert.equal((await call('GET', '/partner/v1/products/701', { key: keys.token })).body.barcode, '4600000000011');
});

test('test mode: orders are idempotent, decided automatically, and never touch stock or Billz', async () => {
  await setMode('test');
  const first = await call('POST', '/partner/v1/orders', { key: keys.secret, body: order('t-1') });
  assert.equal(first.status, 201);
  assert.equal(first.body.status, 'new');
  assert.equal(first.body.test, true);
  assert.equal(first.body.total, 240000);
  assert.ok(first.body.decision_deadline);

  const again = await call('POST', '/partner/v1/orders', { key: keys.secret, body: order('t-1') });
  assert.equal(again.status, 200);
  assert.equal(again.body.id, first.body.id);

  await runtime.decideExpired();
  const accepted = await call('GET', '/partner/v1/orders/t-1', { key: keys.token });
  assert.equal(accepted.body.status, 'accepted');

  const done = await call('POST', '/partner/v1/orders/t-1/complete', { key: keys.secret });
  assert.equal(done.status, 200);
  assert.equal(done.body.status, 'completed');
  assert.deepEqual(done.body.history.map((h) => h.status), ['new', 'accepted', 'completed']);

  const rejected = await call('POST', '/partner/v1/orders', {
    key: keys.secret, body: order('t-2', undefined, { test_outcome: 'reject' }),
  });
  assert.equal(rejected.status, 201);
  await runtime.decideExpired();
  assert.equal((await call('GET', '/partner/v1/orders/t-2', { key: keys.token })).body.status, 'rejected');

  assert.equal(await ChannelOrder().countDocuments({}), 0);
  assert.equal(billzCalls.length, 0);
  assert.equal((await BillzProduct().findOne({ billzProductId: 'bp-1' }).lean()).pendingQty, 0);
});

test('validation: unknown product, short stock and bad bodies are clear errors', async () => {
  const unknown = await call('POST', '/partner/v1/orders', {
    key: keys.secret, body: order('v-1', [{ product_id: 703, quantity: 1 }]),
  });
  assert.equal(unknown.status, 404);
  assert.equal(unknown.body.error.code, 'product_not_found');

  const short = await call('POST', '/partner/v1/orders', {
    key: keys.secret,
    body: order('v-2', [{ product_id: 701, quantity: 5 }, { product_id: 701, quantity: 5 }]),
  });
  assert.equal(short.status, 409);
  assert.deepEqual(short.body.error.details.items, [{ product_id: 701, requested: 10, available: 9 }]);

  const noId = await call('POST', '/partner/v1/orders', { key: keys.secret, body: { items: [] } });
  assert.equal(noId.status, 422);

  const broken = await call('POST', '/partner/v1/orders', { key: keys.secret, body: '{"order_id":' });
  assert.equal(broken.status, 400);
  assert.equal(broken.body.error.code, 'invalid_json');
});

test('live: hold on arrival, Billz reservation on accept, sale under the partner key on complete', async () => {
  await setMode('live');
  await registry.update('apteka24', { billzSecret: 'apteka24-billz-key', billzPaymentTypeId: 'pt-apteka' });
  assert.equal(billzAuth.keyForChannel('partner:apteka24'), 'partner:apteka24');

  const created = await call('POST', '/partner/v1/orders', { key: keys.secret, body: order('L-1') });
  assert.equal(created.status, 201);
  assert.equal(created.body.test, false);
  // An order_id first used while testing is a brand-new real order once live.
  const reused = await call('POST', '/partner/v1/orders', { key: keys.secret, body: order('t-1', [{ product_id: 701, quantity: 1 }]) });
  assert.equal(reused.status, 201);
  assert.equal(reused.body.test, false);
  assert.equal((await call('GET', '/partner/v1/orders/t-1', { key: keys.token })).body.test, false);
  assert.equal((await call('POST', '/partner/v1/orders/t-1/cancel', { key: keys.secret, body: {} })).body.status, 'cancelled');

  const ledger = await ChannelOrder().findOne({ channel: 'partner:apteka24', externalId: 'L-1' }).lean();
  assert.equal(ledger.status, 'received');
  assert.equal(ledger.billz.pendingApplied, true);
  assert.equal((await BillzProduct().findOne({ billzProductId: 'bp-1' }).lean()).pendingQty, 2);
  const stock = await call('GET', '/partner/v1/stock', { key: keys.token });
  assert.equal(stock.body.items.find((r) => r.product_id === 701).quantity, 7, 'held units leave the feed at once');

  const stored = await PartnerOrder().findOne({ externalId: 'L-1' }).lean();
  assert.equal(stored.notification.pending, true, 'an operator card is due');

  const early = await call('POST', '/partner/v1/orders/L-1/complete', { key: keys.secret });
  assert.equal(early.status, 409);
  assert.equal(early.body.error.code, 'invalid_status');

  const decided = await internal('POST', `/orders/${stored._id}/decision`, { action: 'accept', actor: { name: 'Operator' } });
  assert.equal(decided.status, 200);
  assert.equal(decided.body.order.status, 'accepted');
  assert.deepEqual(billzCalls.map((c) => [c.fn, c.key]), [['reserveOrder', 'partner:apteka24']]);

  const twice = await internal('POST', `/orders/${stored._id}/decision`, { action: 'reject' });
  assert.equal(twice.status, 409);

  const done = await call('POST', '/partner/v1/orders/L-1/complete', { key: keys.secret });
  assert.equal(done.status, 200);
  assert.equal(done.body.status, 'completed');
  const saleCall = billzCalls.find((c) => c.fn === 'completeSale');
  assert.equal(saleCall.key, 'partner:apteka24');
  assert.equal(saleCall.paymentTypeId, 'pt-apteka');
  assert.equal((await ChannelOrder().findOne({ externalId: 'L-1' }).lean()).status, 'sold');
});

test('live: a reject or a timeout gives the held stock back', async () => {
  await setMode('live');
  const before = (await BillzProduct().findOne({ billzProductId: 'bp-1' }).lean()).pendingQty;

  await call('POST', '/partner/v1/orders', { key: keys.secret, body: order('L-2', [{ product_id: 701, quantity: 1 }]) });
  const stored = await PartnerOrder().findOne({ externalId: 'L-2' }).lean();
  const rejected = await internal('POST', `/orders/${stored._id}/decision`, { action: 'reject', actor: { name: 'Operator' } });
  assert.equal(rejected.body.order.status, 'rejected');
  assert.equal((await ChannelOrder().findOne({ externalId: 'L-2' }).lean()).status, 'cancelled');

  await call('POST', '/partner/v1/orders', { key: keys.secret, body: order('L-3', [{ product_id: 701, quantity: 1 }]) });
  await PartnerOrder().updateOne({ externalId: 'L-3' }, { $set: { deadlineAt: new Date(Date.now() - 1000) } });
  await runtime.decideExpired();
  const timedOut = await call('GET', '/partner/v1/orders/L-3', { key: keys.token });
  assert.equal(timedOut.body.status, 'rejected');
  assert.equal(timedOut.body.reason, 'timeout');

  assert.equal((await BillzProduct().findOne({ billzProductId: 'bp-1' }).lean()).pendingQty, before);
});

test('live: the partner can cancel an accepted order, which releases the Billz reservation', async () => {
  await setMode('live');
  await call('POST', '/partner/v1/orders', { key: keys.secret, body: order('L-4', [{ product_id: 701, quantity: 1 }]) });
  const stored = await PartnerOrder().findOne({ externalId: 'L-4' }).lean();
  await internal('POST', `/orders/${stored._id}/decision`, { action: 'accept' });
  const cancelled = await call('POST', '/partner/v1/orders/L-4/cancel', { key: keys.secret, body: { reason: 'client changed mind' } });
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.body.status, 'cancelled');
  assert.ok(billzCalls.some((c) => c.fn === 'releaseReservation'));
  assert.equal((await ChannelOrder().findOne({ externalId: 'L-4' }).lean()).status, 'cancelled');
});

test('live: with Billz writes off, accepting is refused and the order keeps waiting', async () => {
  await setMode('live');
  config.billzWriteEnabled = false;
  await call('POST', '/partner/v1/orders', { key: keys.secret, body: order('L-5', [{ product_id: 701, quantity: 1 }]) });
  const stored = await PartnerOrder().findOne({ externalId: 'L-5' }).lean();
  const refused = await internal('POST', `/orders/${stored._id}/decision`, { action: 'accept' });
  assert.equal(refused.status, 503);
  assert.equal((await PartnerOrder().findOne({ externalId: 'L-5' }).lean()).status, 'new');
  assert.equal(billzCalls.length, 0);
  config.billzWriteEnabled = true;
  await internal('POST', `/orders/${stored._id}/decision`, { action: 'reject' });
});

test('webhooks: signed, delivered in order, retried after a failure', async () => {
  await setMode('test');
  const received = [];
  let failNext = true;
  const hook = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      if (failNext) {
        failNext = false;
        res.writeHead(500).end();
        return;
      }
      received.push({ headers: req.headers, raw });
      res.writeHead(200).end('ok');
    });
  });
  await new Promise((resolve) => hook.listen(0, '127.0.0.1', resolve));
  try {
    await internal('PATCH', '/apteka24', { webhookUrl: `http://127.0.0.1:${hook.address().port}/hook` });
    const { body: { secret } } = await internal('GET', '/apteka24/webhook-secret');
    assert.match(secret, /^whsec_/);

    await PartnerEvent().deleteMany({});
    await call('POST', '/partner/v1/orders', { key: keys.secret, body: order('W-1', [{ product_id: 701, quantity: 1 }]) });
    await runtime.decideExpired();
    await call('POST', '/partner/v1/orders/W-1/complete', { key: keys.secret });

    await webhooks.drain();
    assert.equal(received.length, 0, 'the first call failed');
    const pending = await PartnerEvent().find({ state: 'pending' }).sort({ createdAt: 1 }).lean();
    assert.equal(pending.length, 2);
    assert.equal(pending[0].attempts, 1);

    await PartnerEvent().updateMany({}, { $set: { nextAttemptAt: new Date(0) } });
    await webhooks.drain();
    assert.deepEqual(received.map((r) => JSON.parse(r.raw).data.status), ['accepted', 'completed']);

    const first = received[0];
    const expected = crypto.createHmac('sha256', secret)
      .update(`${first.headers['x-fairhaven-timestamp']}.${first.raw}`).digest('hex');
    assert.equal(first.headers['x-fairhaven-signature'], `v1=${expected}`);
    assert.equal(first.headers['x-fairhaven-event'], 'order.status_changed');

    const ping = await call('POST', '/partner/v1/webhook/test', { key: keys.secret });
    assert.equal(ping.body.delivered, true);
  } finally {
    hook.close();
    await internal('PATCH', '/apteka24', { webhookUrl: '' });
  }
});

test('admin: list, key rotation revokes the old pair, switching off locks the partner out', async () => {
  const list = await internal('GET', '/');
  assert.equal(list.status, 200);
  assert.equal(list.body.partners[0].code, 'apteka24');
  assert.equal(list.body.partners[0].billz.hasSecret, true);
  assert.equal(list.body.partners[0].keys.length, 2);
  // The marketplace key list stays free of partner keys (the panel refuses
  // a channel it does not know, which would blank the whole list).
  const marketplace = await call('GET', '/internal/keys', {
    headers: { 'X-Internal-Token': process.env.CHANNEL_INTERNAL_TOKEN },
  });
  assert.equal(marketplace.status, 200);
  assert.equal(marketplace.body.keys.some((k) => String(k.channel).startsWith('partner')), false);

  const bad = await internal('POST', '/', { code: 'uzum', name: 'Fake Uzum' });
  assert.equal(bad.status, 422);
  const dup = await internal('POST', '/', { code: 'apteka24', name: 'Again' });
  assert.equal(dup.status, 409);
  const insecure = await internal('PATCH', '/apteka24', { webhookUrl: 'ftp://example.com/x' });
  assert.equal(insecure.status, 422);

  const old = keys;
  const rotated = await internal('POST', '/apteka24/keys');
  assert.equal(rotated.status, 200);
  assert.equal((await call('GET', '/partner/v1/me', { key: old.token })).status, 401);
  keys = rotated.body.keys;
  assert.equal((await call('GET', '/partner/v1/me', { key: keys.token })).status, 200);

  await setMode('off');
  const off = await call('GET', '/partner/v1/me', { key: keys.token });
  assert.equal(off.status, 403);
  assert.equal(off.body.error.code, 'partner_disabled');
  await setMode('test');
});
