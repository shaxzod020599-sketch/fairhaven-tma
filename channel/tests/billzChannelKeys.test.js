const assert = require('node:assert/strict');
const test = require('node:test');

process.env.BILLZ_SECRET_TOKEN = 'shared-secret';
process.env.BILLZ_SECRET_TOKEN_YANDEX = 'yandex-secret';
process.env.BILLZ_SHOP_ID = 'shop-a';
process.env.BILLZ_CASHBOX_ID = 'till-1';
process.env.BILLZ_PAYMENT_TYPE_ID = 'pt-shared';
process.env.BILLZ_PAYMENT_TYPE_NAME = 'Баланс поставщика';
process.env.BILLZ_PAYMENT_TYPE_ID_YANDEX = 'pt-yandex';
process.env.BILLZ_PAYMENT_TYPE_NAME_YANDEX = 'Yandex';
process.env.BILLZ_RPS = '100';
process.env.MONGO_DB_NAME = 'billz-channel-keys-test';

/**
 * Billz shows the integration key that wrote a sale as its author. With one
 * shared key every channel's sale read «medicalka api», which made the
 * channels impossible to tell apart in Billz. These pin down the fix: each
 * channel may write with its own key and settle on its own payment type, one
 * draft never mixes keys, and a channel with neither keeps the shared ones.
 */

let mongod;
let db;
let config;
let auth;
let sale;
let billz;
let orders;
let ChannelOrder;
let BillzProduct;
let BillzToken;

test.before(async () => {
  const { MongoMemoryServer } = require('../../backend/node_modules/mongodb-memory-server');
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();

  db = require('../src/db');
  await db.connect();

  config = require('../src/config');
  auth = require('../src/billz/auth');
  sale = require('../src/billz/sale');
  billz = require('../src/billz/client');
  orders = require('../src/core/orders');
  ChannelOrder = require('../src/models/ChannelOrder');
  BillzProduct = require('../src/models/BillzProduct');
  BillzToken = require('../src/models/BillzToken');
  await ChannelOrder().init();
  await BillzToken().init();
});

test.after(async () => {
  await db.disconnect();
  await mongod?.stop();
});

/* ── Keys and tokens ─────────────────────────────────────────────────────── */

/** Answers Billz logins and records which secret each one used. */
function fakeLogin({ status = 200 } = {}) {
  const original = global.fetch;
  const logins = [];
  global.fetch = async (url, init) => {
    assert.match(String(url), /\/v1\/auth\/login$/);
    const secret = JSON.parse(init.body).secret_token;
    logins.push(secret);
    return {
      ok: status === 200,
      status,
      json: async () => (status === 200
        ? { data: { access_token: `tok-${secret}-${logins.length}`, expires_in: 86400 } }
        : { error: `rejected ${secret}` }),
    };
  };
  return { logins, restore: () => { global.fetch = original; } };
}

async function freshTokens() {
  auth._reset();
  await BillzToken().deleteMany({});
}

function withChannelKey(channel, secretToken) {
  const before = config.billz.channels[channel].secretToken;
  config.billz.channels[channel].secretToken = secretToken;
  return () => { config.billz.channels[channel].secretToken = before; };
}

test('a channel with its own key logs in with it and the rest share one', async () => {
  await freshTokens();
  const login = fakeLogin();
  try {
    assert.equal(auth.keyForChannel('yandex'), 'yandex');
    assert.equal(auth.keyForChannel('uzum'), auth.DEFAULT_KEY);
    assert.equal(auth.keyForChannel('medicalka'), auth.DEFAULT_KEY);

    const yandex = await auth.getAccessToken('yandex');
    const shared = await auth.getAccessToken();
    const uzum = await auth.getAccessToken(auth.keyForChannel('uzum'));

    assert.deepEqual(login.logins, ['yandex-secret', 'shared-secret']);
    assert.notEqual(yandex, shared);
    assert.equal(uzum, shared);
    const kinds = (await BillzToken().find({}).lean()).map((d) => d.kind).sort();
    assert.deepEqual(kinds, ['default', 'yandex']);
  } finally {
    login.restore();
  }
});

test('concurrent requests on one key share a single login', async () => {
  await freshTokens();
  const login = fakeLogin();
  try {
    const tokens = await Promise.all([
      auth.getAccessToken('yandex'), auth.getAccessToken('yandex'), auth.getAccessToken('yandex'),
    ]);
    assert.deepEqual(login.logins, ['yandex-secret']);
    assert.equal(new Set(tokens).size, 1);
  } finally {
    login.restore();
  }
});

test('a stored token is reused only for the secret that issued it', async () => {
  await freshTokens();
  const login = fakeLogin();
  let restoreKey = () => {};
  try {
    await auth.getAccessToken('yandex');
    auth._reset(); // a restart: memory is gone, the database is not
    await auth.getAccessToken('yandex');
    assert.deepEqual(login.logins, ['yandex-secret'], 'the restart reuses the stored token');

    restoreKey = withChannelKey('yandex', 'yandex-secret-2');
    auth._reset();
    await auth.getAccessToken('yandex');
    assert.deepEqual(login.logins, ['yandex-secret', 'yandex-secret-2'],
      'a replaced key must not keep selling under the old one');
  } finally {
    restoreKey();
    login.restore();
  }
});

test('a token stored before fingerprints existed is replaced by a fresh login', async () => {
  await freshTokens();
  await BillzToken().create({
    kind: 'default', accessToken: 'legacy', expiresAt: new Date(Date.now() + 86400000),
  });
  const login = fakeLogin();
  try {
    assert.notEqual(await auth.getAccessToken(), 'legacy');
    assert.deepEqual(login.logins, ['shared-secret']);
  } finally {
    login.restore();
  }
});

test('a key that is no longer configured falls back to the shared one', async () => {
  await freshTokens();
  const login = fakeLogin();
  const restoreKey = withChannelKey('yandex', '');
  try {
    assert.equal(auth.keyForChannel('yandex'), auth.DEFAULT_KEY);
    await auth.getAccessToken('yandex'); // e.g. an order pinned to it earlier
    assert.deepEqual(login.logins, ['shared-secret']);
  } finally {
    restoreKey();
    login.restore();
  }
});

test('a refused login is retry-safe and never echoes the secret', async () => {
  await freshTokens();
  const login = fakeLogin({ status: 401 });
  try {
    await assert.rejects(auth.getAccessToken('yandex'), (err) => {
      assert.equal(err.outcomeUnknown, false);
      assert.equal(err.retrySafe, true);
      assert.equal(err.status, 401);
      assert.doesNotMatch(err.message, /yandex-secret/);
      return true;
    });
  } finally {
    login.restore();
  }
});

test('invalidating one key leaves the other keys alone', async () => {
  await freshTokens();
  const login = fakeLogin();
  try {
    const yandex = await auth.getAccessToken('yandex');
    await auth.getAccessToken();
    await auth.invalidate(yandex, 'yandex');
    await auth.getAccessToken();
    await auth.getAccessToken('yandex');
    assert.deepEqual(login.logins, ['yandex-secret', 'shared-secret', 'yandex-secret']);
  } finally {
    login.restore();
  }
});

/* ── Sale calls ─────────────────────────────────────────────────────────── */

test('every Billz call on a draft carries the key it was created with', async () => {
  const original = billz.request;
  const calls = [];
  billz.request = async (method, path, options = {}) => {
    calls.push({ method, path, key: options.billzKey });
    if (method === 'POST' && path === '/v2/order') return { data: { id: 'd-1', order_number: '7' } };
    if (method === 'GET') return { order_detail: { total_price: 5000 } };
    return {};
  };
  try {
    await sale.reserveOrder({
      items: [{ billzProductId: 'p-1', quantity: 2, unitPrice: 2500 }],
      comment: 'yandex 1',
      key: 'yandex',
    });
    await sale.completeSale('d-1', { paymentTypeId: 'pt', amount: 5000, key: 'yandex' });
    await sale.releaseReservation('d-1', { key: 'yandex' });
    await sale.deleteDraft('d-1', { key: 'yandex' });

    assert.deepEqual(calls.map((c) => c.path), [
      '/v2/order', '/v2/order-product/d-1', '/v2/order/d-1', '/v2/order/create_postpone',
      '/v2/order-payment/d-1', '/v2/order/return-postpone', '/v2/order/d-1',
    ]);
    assert.ok(calls.every((c) => c.key === 'yandex'), JSON.stringify(calls));
  } finally {
    billz.request = original;
  }
});

/* ── Orders ─────────────────────────────────────────────────────────────── */

function stubSale(overrides = {}) {
  const original = { ...sale };
  const calls = [];
  sale.reserveOrder = async (args) => {
    calls.push({ fn: 'reserveOrder', args });
    if (overrides.reserveOrder) return overrides.reserveOrder(args);
    return { orderId: `draft-${calls.length}`, orderNumber: '900' };
  };
  sale.completeSale = async (id, args) => { calls.push({ fn: 'completeSale', id, args }); return {}; };
  sale.releaseReservation = async (id, args) => {
    calls.push({ fn: 'releaseReservation', id, args });
    return {};
  };
  sale.deleteDraft = async (id, args) => { calls.push({ fn: 'deleteDraft', id, args }); return {}; };
  return {
    calls,
    find: (fn) => calls.find((c) => c.fn === fn),
    restore: () => Object.assign(sale, original),
  };
}

/** Gives Medicalka its own key and payment type for the length of a test. */
function medicalkaOwn({ key = 'mk-secret', paymentTypeId = 'pt-mk', paymentTypeName = 'Medicalka' } = {}) {
  const own = config.billz.channels.medicalka;
  const before = { ...own };
  Object.assign(own, { secretToken: key, paymentTypeId, paymentTypeName });
  return () => Object.assign(own, before);
}

let seq = 0;
async function freshOrder() {
  seq += 1;
  const productId = `ck-${seq}`;
  await BillzProduct().create({
    billzProductId: productId, name: 'Product', stock: 20, reservedQty: 0, pendingQty: 0,
  });
  const { order } = await orders.acceptOrder('medicalka', {
    externalId: `ck-ext-${seq}`,
    items: [{ billzProductId: productId, name: 'Product', quantity: 2, unitPrice: 50000 }],
  });
  return order;
}

const stored = async (order) => ChannelOrder().findOne({ _id: order._id }).lean();

test('a channel with its own key and payment type sells under them', async () => {
  const stub = stubSale();
  const restore = medicalkaOwn();
  try {
    const order = await freshOrder();
    await orders.reserveOrder(order.internalOrderId);
    assert.equal(stub.find('reserveOrder').args.key, 'medicalka');
    assert.equal((await stored(order)).billz.keyName, 'medicalka');

    await orders.completeOrder(order.internalOrderId);
    const paid = stub.find('completeSale').args;
    assert.equal(paid.key, 'medicalka');
    assert.equal(paid.paymentTypeId, 'pt-mk');
    assert.equal(paid.paymentTypeName, 'Medicalka');
    assert.match(paid.comment, /^medicalka ck-ext-\d+$/);
  } finally {
    restore();
    stub.restore();
  }
});

test('a channel with nothing of its own keeps the shared key and payment type', async () => {
  const stub = stubSale();
  try {
    const order = await freshOrder();
    await orders.reserveOrder(order.internalOrderId);
    await orders.completeOrder(order.internalOrderId);
    assert.equal(stub.find('reserveOrder').args.key, auth.DEFAULT_KEY);
    const paid = stub.find('completeSale').args;
    assert.equal(paid.key, auth.DEFAULT_KEY);
    assert.equal(paid.paymentTypeId, 'pt-shared');
    assert.equal(paid.paymentTypeName, 'Баланс поставщика');
  } finally {
    stub.restore();
  }
});

test('an order reserved under the shared key is sold under it after a key is added', async () => {
  const stub = stubSale();
  let restore = () => {};
  try {
    const order = await freshOrder();
    await orders.reserveOrder(order.internalOrderId);
    restore = medicalkaOwn(); // the new key arrives while the order is open
    await orders.completeOrder(order.internalOrderId);
    assert.equal(stub.find('completeSale').args.key, auth.DEFAULT_KEY);
  } finally {
    restore();
    stub.restore();
  }
});

test('a cancelled order releases and removes its draft with the key that made it', async () => {
  const stub = stubSale();
  const restore = medicalkaOwn();
  try {
    const order = await freshOrder();
    await orders.reserveOrder(order.internalOrderId);
    await orders.cancelOrder(order.internalOrderId, { reason: 'test' });
    assert.equal(stub.find('releaseReservation').args.key, 'medicalka');
    assert.equal(stub.find('deleteDraft').args.key, 'medicalka');
  } finally {
    restore();
    stub.restore();
  }
});

test('an order reserved before per-channel keys is finished with the shared key', async () => {
  const stub = stubSale();
  const restore = medicalkaOwn();
  try {
    const order = await freshOrder();
    await orders.reserveOrder(order.internalOrderId);
    await ChannelOrder().updateOne({ _id: order._id }, { $unset: { 'billz.keyName': '' } });
    await orders.completeOrder(order.internalOrderId);
    assert.equal(stub.find('completeSale').args.key, auth.DEFAULT_KEY);
  } finally {
    restore();
    stub.restore();
  }
});

test('a draft left by a failed reservation remembers the key that made it', async () => {
  const stub = stubSale({
    reserveOrder: async (args) => {
      await args.onProgress({ stage: 'draft_created', orderId: 'd-left', orderNumber: '5' });
      throw Object.assign(new Error('lost after the draft'), { billzOrderId: 'd-left' });
    },
  });
  const restore = medicalkaOwn();
  try {
    const order = await freshOrder();
    await assert.rejects(orders.reserveOrder(order.internalOrderId));
    const row = await stored(order);
    assert.equal(row.billz.draftOrderId, 'd-left');
    assert.equal(row.billz.keyName, 'medicalka');
    assert.equal(row.billz.reconciliationRequired, true);
  } finally {
    restore();
    stub.restore();
  }
});
