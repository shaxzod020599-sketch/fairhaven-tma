const assert = require('node:assert/strict');
const test = require('node:test');

process.env.BILLZ_SECRET_TOKEN = 'test-secret';
process.env.BILLZ_SHOP_ID = 'shop-a';
process.env.BILLZ_CASHBOX_ID = 'till-1';
process.env.BILLZ_PAYMENT_TYPE_ID = 'pt-transfer';
process.env.BILLZ_WRITE_ENABLED = 'true';
process.env.MONGO_DB_NAME = 'mk-orders-test';
process.env.SYNC_ON_BOOT = 'false';
process.env.CHANNEL_TELEGRAM_ENABLED = 'false';
process.env.DISABLE_RATE_LIMIT = 'true';

let mongod;
let db;
let server;
let base;
let ChannelOrder;
let BillzProduct;
let orders;
let sale;
let notify;
let config;
let secret;
let token;
let reserveImpl;
let completeImpl;
let billzCalls;
let announcements;
let originalReserveOrder;
let originalCompleteSale;
let originalAnnounceOrder;

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};

const waitFor = async (condition, timeoutMs = 1000) => {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() >= deadline) throw new Error('condition was not met before timeout');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};

const classifiedError = (message, fields) => Object.assign(new Error(message), fields);

test.before(async () => {
  const { MongoMemoryServer } = require(
    '/Users/tm/Projects/project vitamin delivery/backend/node_modules/mongodb-memory-server'
  );
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();

  db = require('../src/db');
  await db.connect();

  ChannelOrder = require('../src/models/ChannelOrder');
  BillzProduct = require('../src/models/BillzProduct');
  const ChannelKey = require('../src/models/ChannelKey');
  orders = require('../src/core/orders');
  sale = require('../src/billz/sale');
  notify = require('../src/notify/telegram');
  config = require('../src/config');
  await ChannelOrder().init();

  originalReserveOrder = sale.reserveOrder;
  originalCompleteSale = sale.completeSale;
  originalAnnounceOrder = notify.announceOrder;
  sale.reserveOrder = async (args) => {
    billzCalls.push({ fn: 'reserveOrder', args });
    return reserveImpl(args);
  };
  sale.completeSale = async (id, args) => {
    billzCalls.push({ fn: 'completeSale', id, args });
    return completeImpl(id, args);
  };
  sale.releaseReservation = async () => ({});
  sale.deleteDraft = async () => ({});
  notify.announceOrder = async (channel, externalId) => {
    const stored = await ChannelOrder().findOne({ channel, externalId }).lean();
    announcements.push({
      channel,
      externalId,
      status: stored?.status,
      reconciliationRequired: stored?.billz?.reconciliationRequired,
    });
    return null;
  };

  for (const kind of ['token', 'secret']) {
    const key = ChannelKey.generateKey('medicalka', kind);
    const shape = ChannelKey.describeKey(key);
    await ChannelKey().create({
      channel: 'medicalka', kind, hash: ChannelKey.hashKey(key),
      prefix: shape.prefix, last4: shape.last4, active: true,
    });
    if (kind === 'token') token = key; else secret = key;
  }

  await BillzProduct().create({
    billzProductId: 'bp-mk', name: 'Тестовый товар', stock: 40,
    reservedQty: 0, pendingQty: 0, medicalkaId: 501,
  });
  await db.getConnection().collection('products').insertOne({
    name: 'Тестовый товар', category: 'vitamins', billzProductId: 'bp-mk',
    imageUrl: '/uploads/x.jpg',
    channels: { medicalka: { enabled: true, price: 300000, forceStatus: 'auto', minStock: 0 } },
  });

  const { app } = require('../src/server');
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/medicalka/v1`;
});

test.beforeEach(() => {
  billzCalls = [];
  announcements = [];
  reserveImpl = async () => ({ orderId: 'draft-mk', orderNumber: '77' });
  completeImpl = async () => ({});
  config.billzWriteEnabled = true;
});

test.after(async () => {
  if (sale) {
    sale.reserveOrder = originalReserveOrder;
    sale.completeSale = originalCompleteSale;
  }
  if (notify) notify.announceOrder = originalAnnounceOrder;
  server?.close();
  await db?.disconnect();
  await mongod?.stop();
});

const post = async (path, body, key = secret) => {
  const res = await fetch(`${base}${path}?secret=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};

const get = async (path, key = token) => {
  const separator = path.includes('?') ? '&' : '?';
  const res = await fetch(`${base}${path}${separator}token=${key}`);
  return { status: res.status, body: await res.json().catch(() => null) };
};

const newOrder = (orderId) => ({
  order_id: orderId,
  order_number: 'MK-2026-005821',
  customer: { first_name: 'Иван', last_name: 'Иванов', phone: '+998900000000' },
  delivery_type: 'delivery',
  delivery_address: 'г. Ташкент',
  items: [{ product_id: 501, name: 'Тестовый товар', quantity: 1, unit_price: 749000 }],
});

test('creation waits for reservation and payment, then answers from the stored sale', async () => {
  const reserveEntered = deferred();
  const finishReserve = deferred();
  const completeEntered = deferred();
  const finishComplete = deferred();
  reserveImpl = async () => {
    reserveEntered.resolve();
    await finishReserve.promise;
    return { orderId: 'draft-wait', orderNumber: '78' };
  };
  completeImpl = async () => {
    completeEntered.resolve();
    await finishComplete.promise;
    return {};
  };

  let settled = false;
  const request = post('/orders', newOrder('MK-WAIT-1'));
  request.finally(() => { settled = true; });

  try {
    await reserveEntered.promise;
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(settled, false, 'HTTP response escaped before the reservation finished');

    finishReserve.resolve();
    await completeEntered.promise;
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(settled, false, 'HTTP response escaped before payment finished');

    finishComplete.resolve();
    const response = await request;
    assert.equal(response.status, 200);
    assert.equal(response.body.status, 'accepted');
    assert.equal(typeof response.body.wc_order_id, 'number');
    assert.ok(Number.isInteger(response.body.wc_order_id));

    const stored = await ChannelOrder().findOne({ externalId: 'MK-WAIT-1' }).lean();
    assert.equal(stored.status, 'sold', 'the canonical order must be sold before HTTP 200');
    await waitFor(() => announcements.some((entry) => entry.externalId === 'MK-WAIT-1'));
    const announcement = announcements.find((entry) => entry.externalId === 'MK-WAIT-1');
    assert.equal(announcement.status, 'sold', 'Telegram saw a non-final state');
  } finally {
    finishReserve.resolve();
    finishComplete.resolve();
    await Promise.allSettled([request]);
  }
});

test('sequential duplicate creation returns the same accepted id with one Billz sale', async () => {
  const first = await post('/orders', newOrder('MK-DUPE-SEQ'));
  const second = await post('/orders', newOrder('MK-DUPE-SEQ'));

  assert.deepEqual(second, first);
  assert.equal(first.status, 200);
  assert.equal(first.body.status, 'accepted');
  assert.equal(await ChannelOrder().countDocuments({ externalId: 'MK-DUPE-SEQ' }), 1);
  assert.equal(billzCalls.filter((call) => call.fn === 'reserveOrder').length, 1);
  assert.equal(billzCalls.filter((call) => call.fn === 'completeSale').length, 1);
});

test('parallel duplicate observes the winner and never performs a second Billz write', async () => {
  const reserveEntered = deferred();
  const finishReserve = deferred();
  reserveImpl = async () => {
    reserveEntered.resolve();
    await finishReserve.promise;
    return { orderId: 'draft-parallel', orderNumber: '79' };
  };

  let firstSettled = false;
  let secondSettled = false;
  const first = post('/orders', newOrder('MK-DUPE-PAR'));
  first.finally(() => { firstSettled = true; });

  try {
    await reserveEntered.promise;
    const second = post('/orders', newOrder('MK-DUPE-PAR'));
    second.finally(() => { secondSettled = true; });
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(firstSettled, false);
    assert.equal(secondSettled, false, 'the duplicate responded instead of observing the sale');

    finishReserve.resolve();
    const [firstResponse, secondResponse] = await Promise.all([first, second]);
    assert.deepEqual(secondResponse, firstResponse);
    assert.equal(firstResponse.body.status, 'accepted');
    assert.equal(await ChannelOrder().countDocuments({ externalId: 'MK-DUPE-PAR' }), 1);
    assert.equal(billzCalls.filter((call) => call.fn === 'reserveOrder').length, 1);
    assert.equal(billzCalls.filter((call) => call.fn === 'completeSale').length, 1);
  } finally {
    finishReserve.resolve();
    await Promise.allSettled([first]);
  }
});

test('an in-progress observer times out boundedly without touching Billz', async () => {
  assert.equal(typeof orders.completeIncomingSale, 'function');
  const { order } = await orders.acceptOrder('medicalka', {
    externalId: 'MK-OBSERVE-TIMEOUT',
    items: [{ billzProductId: 'bp-mk', name: 'Тест', quantity: 1, unitPrice: 300000 }],
  });
  await ChannelOrder().updateOne(
    { internalOrderId: order.internalOrderId },
    {
      $set: {
        'billz.operationAction': 'reserve',
        'billz.operationToken': 'another-worker',
        'billz.operationStartedAt': new Date(),
      },
    }
  );

  const started = Date.now();
  const outcome = await orders.completeIncomingSale(order.internalOrderId, {
    observeTimeoutMs: 40,
    observePollMs: 5,
  });

  assert.equal(outcome.kind, 'temporary_failure');
  assert.ok(Date.now() - started < 500, 'bounded observation ran past its deadline');
  assert.equal(billzCalls.length, 0);
});

test('a retry-safe upstream failure is sanitized and a later POST can retry it', async () => {
  reserveImpl = async () => {
    throw classifiedError('private upstream failure: warehouse-17', {
      outcomeUnknown: false,
      retrySafe: true,
    });
  };

  const failed = await post('/orders', newOrder('MK-RETRY-SAFE'));
  assert.equal(failed.status, 502);
  assert.doesNotMatch(JSON.stringify(failed.body), /private upstream|warehouse-17/i);
  const failedOrder = await ChannelOrder().findOne({ externalId: 'MK-RETRY-SAFE' }).lean();
  assert.equal(failedOrder.status, 'failed');
  assert.equal(failedOrder.billz.reconciliationRequired, false);
  await waitFor(() => announcements.some((entry) => entry.externalId === 'MK-RETRY-SAFE'));
  const failedAnnouncement = announcements.find(
    (entry) => entry.externalId === 'MK-RETRY-SAFE'
  );
  assert.equal(failedAnnouncement.status, 'failed');

  reserveImpl = async () => ({ orderId: 'draft-retry-safe', orderNumber: '80' });
  const retried = await post('/orders', newOrder('MK-RETRY-SAFE'));
  assert.equal(retried.status, 200);
  assert.equal(retried.body.status, 'accepted');
  assert.equal(billzCalls.filter((call) => call.fn === 'reserveOrder').length, 2);
  assert.equal(billzCalls.filter((call) => call.fn === 'completeSale').length, 1);
});

test('a reconciliation-required outcome stays temporary and is never retried', async () => {
  reserveImpl = async () => {
    throw classifiedError('uncertain upstream outcome: do not disclose', {
      outcomeUnknown: true,
      retrySafe: false,
    });
  };

  const first = await post('/orders', newOrder('MK-RECONCILE'));
  const second = await post('/orders', newOrder('MK-RECONCILE'));

  assert.equal(first.status, 503);
  assert.deepEqual(second, first);
  assert.doesNotMatch(JSON.stringify(first.body), /uncertain|disclose/i);
  assert.equal(billzCalls.filter((call) => call.fn === 'reserveOrder').length, 1);
  assert.equal(billzCalls.filter((call) => call.fn === 'completeSale').length, 0);
  const stored = await ChannelOrder().findOne({ externalId: 'MK-RECONCILE' }).lean();
  assert.equal(stored.status, 'failed');
  assert.equal(stored.billz.reconciliationRequired, true);
  await waitFor(() => (
    announcements.filter((entry) => entry.externalId === 'MK-RECONCILE').length === 2
  ));
  assert.ok(
    announcements
      .filter((entry) => entry.externalId === 'MK-RECONCILE')
      .every((entry) => entry.status === 'failed')
  );
});

test('BILLZ_WRITE_ENABLED false fails closed without reporting a sale', async () => {
  config.billzWriteEnabled = false;

  const response = await post('/orders', newOrder('MK-WRITES-OFF'));

  assert.equal(response.status, 503);
  assert.notEqual(response.body?.status, 'accepted');
  assert.equal(billzCalls.length, 0);
  const stored = await ChannelOrder().findOne({ externalId: 'MK-WRITES-OFF' }).lean();
  assert.notEqual(stored.status, 'sold');
});

test('the active pre-existing order secret still authenticates creation', async () => {
  const response = await post('/orders', newOrder('MK-AUTH-SECRET'));

  assert.equal(response.status, 200);
  assert.equal(response.body.status, 'accepted');
});

test('the active pre-existing read token still reads the catalogue', async () => {
  const response = await get('/products?limit=1');

  assert.equal(response.status, 200);
  assert.equal(response.body.items.length, 1);
  assert.equal(response.body.items[0].id, 501);
});

test('the read token still cannot place an order', async () => {
  const response = await post('/orders', newOrder('MK-WRONGKEY'), token);

  assert.equal(response.status, 401);
  assert.equal(response.body.code, 'mk_unauthorized');
});

test('paid and payment_confirmed after the immediate sale are idempotent', async () => {
  const created = await post('/orders', newOrder('MK-PAID-IDEMPOTENT'));
  const callsAfterCreation = billzCalls.length;

  for (const status of ['paid', 'payment_confirmed']) {
    const response = await post('/orders/MK-PAID-IDEMPOTENT/status', { status });
    assert.equal(response.status, 200);
    assert.equal(response.body.wc_order_id, created.body.wc_order_id);
    assert.equal(response.body.status, 'processing');
  }
  assert.equal(billzCalls.length, callsAfterCreation, 'status acknowledgements repeated Billz writes');
});

test('cancellation after the immediate sale is rejected as return-required', async () => {
  await post('/orders', newOrder('MK-SOLD-CANCEL'));

  const response = await post('/orders/MK-SOLD-CANCEL/status', {
    status: 'cancelled_by_buyer',
  });

  assert.equal(response.status, 422);
  assert.match(response.body.detail, /return/i);
  const stored = await ChannelOrder().findOne({ externalId: 'MK-SOLD-CANCEL' }).lean();
  assert.equal(stored.status, 'sold');
});
