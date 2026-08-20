const assert = require('node:assert/strict');
const test = require('node:test');
const mongoose = require('mongoose');

process.env.BILLZ_SECRET_TOKEN = 'test-secret';
process.env.BILLZ_SHOP_ID = 'shop-a';
process.env.BILLZ_CASHBOX_ID = 'till-1';
process.env.BILLZ_PAYMENT_TYPE_ID = 'pt-transfer';
process.env.BILLZ_PAYMENT_TYPE_NAME = 'Тестовый тип';
process.env.MONGO_DB_NAME = 'orders-test';

let mongod;
let db;
let orders;
let ChannelOrder;
let BillzProduct;
let sale;

/**
 * Runs against a real MongoDB: the two properties under test — idempotency and
 * the reserved-unit counter — are enforced by a unique index and by $inc, not
 * by JavaScript, and a stub would prove nothing about either.
 */
test.before(async () => {
  const { MongoMemoryServer } = require(
    '/Users/tm/Projects/project vitamin delivery/backend/node_modules/mongodb-memory-server'
  );
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();

  db = require('../src/db');
  await db.connect();

  orders = require('../src/core/orders');
  ChannelOrder = require('../src/models/ChannelOrder');
  BillzProduct = require('../src/models/BillzProduct');
  sale = require('../src/billz/sale');
  await ChannelOrder().init();
});

test.after(async () => {
  await db.disconnect();
  await mongod?.stop();
});

/** Replaces the Billz calls with recorded ones. */
function stubSale(overrides = {}) {
  const original = { ...sale };
  const calls = [];
  sale.reserveOrder = async (args) => {
    calls.push({ fn: 'reserveOrder', args });
    if (overrides.reserveOrder) return overrides.reserveOrder(args);
    return { orderId: `draft-${calls.length}`, orderNumber: '900' };
  };
  sale.completeSale = async (id, args) => {
    calls.push({ fn: 'completeSale', id, args });
    if (overrides.completeSale) return overrides.completeSale(id, args);
    return {};
  };
  sale.releaseReservation = async (id) => {
    calls.push({ fn: 'releaseReservation', id });
    if (overrides.releaseReservation) return overrides.releaseReservation(id);
    return {};
  };
  sale.deleteDraft = async (id) => {
    calls.push({ fn: 'deleteDraft', id });
    if (overrides.deleteDraft) return overrides.deleteDraft(id);
    return {};
  };
  return {
    calls,
    restore: () => {
      sale.reserveOrder = original.reserveOrder;
      sale.completeSale = original.completeSale;
      sale.releaseReservation = original.releaseReservation;
      sale.deleteDraft = original.deleteDraft;
    },
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, reject, resolve };
}

function classifiedError(message, metadata) {
  return Object.assign(new Error(message), metadata);
}

let seq = 0;
async function freshOrder(overrides = {}) {
  seq += 1;
  const productId = `p-${seq}`;
  await BillzProduct().create({
    billzProductId: productId, name: 'Product', stock: 20, reservedQty: 0, pendingQty: 0,
  });
  const { order } = await orders.acceptOrder('medicalka', {
    externalId: `ext-${seq}`,
    items: [{ billzProductId: productId, name: 'Product', quantity: 3, unitPrice: 100000 }],
    ...overrides,
  });
  return { order, productId };
}

const reservedFor = async (productId) =>
  (await BillzProduct().findOne({ billzProductId: productId }).lean()).reservedQty;

/* ── Idempotency ─────────────────────────────────────────────────────────── */

test('the same external id never becomes two orders', async () => {
  // Marketplaces resend when a reply is slow or lost; Uzum's contract requires
  // the resend to return the same order id with a 200.
  const items = [{ billzProductId: 'p-dup', quantity: 1, unitPrice: 5000 }];
  const first = await orders.acceptOrder('medicalka', { externalId: 'MK-DUP', items });
  const second = await orders.acceptOrder('medicalka', { externalId: 'MK-DUP', items });

  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.order.internalOrderId, first.order.internalOrderId);
  assert.equal(await ChannelOrder().countDocuments({ externalId: 'MK-DUP' }), 1);
});

test('two identical orders arriving together still produce one record', async () => {
  // The unique index decides; the loser reads back the winner rather than
  // reporting a failure the marketplace would retry.
  const items = [{ billzProductId: 'p-race', quantity: 1, unitPrice: 5000 }];
  const results = await Promise.all([
    orders.acceptOrder('medicalka', { externalId: 'MK-RACE', items }),
    orders.acceptOrder('medicalka', { externalId: 'MK-RACE', items }),
    orders.acceptOrder('medicalka', { externalId: 'MK-RACE', items }),
  ]);

  const ids = new Set(results.map((r) => r.order.internalOrderId));
  assert.equal(ids.size, 1, 'all callers must get the same order id');
  assert.equal(await ChannelOrder().countDocuments({ externalId: 'MK-RACE' }), 1);
});

test('the same external id in different channels is a different order', async () => {
  const items = [{ billzProductId: 'p-x', quantity: 1, unitPrice: 1 }];
  const a = await orders.acceptOrder('medicalka', { externalId: 'SHARED-1', items });
  const b = await orders.acceptOrder('uzum', { externalId: 'SHARED-1', items });
  assert.notEqual(a.order.internalOrderId, b.order.internalOrderId);
});

test('an order with no lines is refused', async () => {
  await assert.rejects(
    orders.acceptOrder('medicalka', { externalId: 'MK-EMPTY', items: [] }),
    /at least one line/
  );
});

test('accepting an order writes nothing to Billz', async () => {
  // Uzum cancels an order we have not acknowledged within 15 minutes, so
  // acceptance must not wait on Billz being reachable.
  const stub = stubSale();
  try {
    await orders.acceptOrder('medicalka', {
      externalId: 'MK-NOBILLZ',
      items: [{ billzProductId: 'p-nb', quantity: 1, unitPrice: 1 }],
    });
    assert.equal(stub.calls.length, 0);
  } finally {
    stub.restore();
  }
});

test('the total is computed from the lines when not supplied', async () => {
  const { order } = await orders.acceptOrder('medicalka', {
    externalId: 'MK-TOTAL',
    items: [
      { billzProductId: 'p-t1', quantity: 2, unitPrice: 1500 },
      { billzProductId: 'p-t2', quantity: 1, unitPrice: 3000 },
    ],
  });
  assert.equal(order.totalAmount, 6000);
});

/* ── Reserved units counted exactly once ─────────────────────────────────── */

test('reserving holds the ordered units', async () => {
  const stub = stubSale();
  const { order, productId } = await freshOrder();
  try {
    await orders.reserveOrder(order.internalOrderId);
    assert.equal(await reservedFor(productId), 3);
  } finally {
    stub.restore();
  }
});

test('reserving twice does not hold the units twice', async () => {
  // An operator retrying a step, or two workers picking up the same order.
  const stub = stubSale();
  const { order, productId } = await freshOrder();
  try {
    await orders.reserveOrder(order.internalOrderId);
    await orders.reserveOrder(order.internalOrderId);
    assert.equal(await reservedFor(productId), 3);
    assert.equal(stub.calls.filter((c) => c.fn === 'reserveOrder').length, 1);
  } finally {
    stub.restore();
  }
});

test('two parallel reservations create one draft and hold the units once', async () => {
  const entered = deferred();
  const finish = deferred();
  let reserveCalls = 0;
  const stub = stubSale({
    reserveOrder: async () => {
      reserveCalls += 1;
      entered.resolve();
      if (reserveCalls === 1) await finish.promise;
      return { orderId: 'draft-parallel', orderNumber: '902' };
    },
  });
  const { order, productId } = await freshOrder();
  try {
    const first = orders.reserveOrder(order.internalOrderId);
    await entered.promise;
    await assert.rejects(
      orders.reserveOrder(order.internalOrderId),
      (err) => err.code === 'BILLZ_OPERATION_IN_PROGRESS'
    );
    finish.resolve();
    await first;

    assert.equal(stub.calls.filter((c) => c.fn === 'reserveOrder').length, 1);
    assert.equal(await reservedFor(productId), 3);
  } finally {
    finish.resolve();
    stub.restore();
  }
});

test('a failed reservation holds nothing and can be retried', async () => {
  let attempts = 0;
  const stub = stubSale({
    reserveOrder: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('billz refused');
      return { orderId: 'draft-retry', orderNumber: '901' };
    },
  });
  const { order, productId } = await freshOrder();
  try {
    await assert.rejects(orders.reserveOrder(order.internalOrderId), /billz refused/);
    assert.equal(await reservedFor(productId), 0, 'a failure must not hold stock');
    assert.equal((await ChannelOrder().findOne({ internalOrderId: order.internalOrderId })).status, 'failed');

    await orders.reserveOrder(order.internalOrderId);
    assert.equal(await reservedFor(productId), 3);
  } finally {
    stub.restore();
  }
});

test('selling hands the reservation back as Billz decrements stock', async () => {
  // Leaving it would count the units twice: once reserved, once sold.
  const stub = stubSale();
  const { order, productId } = await freshOrder();
  try {
    await orders.reserveOrder(order.internalOrderId);
    assert.equal(await reservedFor(productId), 3);

    await orders.completeOrder(order.internalOrderId);
    assert.equal(await reservedFor(productId), 0);
    assert.equal((await ChannelOrder().findOne({ internalOrderId: order.internalOrderId })).status, 'sold');
  } finally {
    stub.restore();
  }
});

test('selling twice releases the reservation only once', async () => {
  const stub = stubSale();
  const { order, productId } = await freshOrder();
  try {
    await orders.reserveOrder(order.internalOrderId);
    await orders.completeOrder(order.internalOrderId);
    await orders.completeOrder(order.internalOrderId);
    assert.equal(await reservedFor(productId), 0, 'must not drop below zero');
    assert.equal(stub.calls.filter((c) => c.fn === 'completeSale').length, 1);
  } finally {
    stub.restore();
  }
});

test('two parallel completions post one payment and release the counter once', async () => {
  const entered = deferred();
  const finish = deferred();
  let completionCalls = 0;
  const stub = stubSale({
    completeSale: async () => {
      completionCalls += 1;
      entered.resolve();
      if (completionCalls === 1) await finish.promise;
      return {};
    },
  });
  const { order, productId } = await freshOrder();
  try {
    await orders.reserveOrder(order.internalOrderId);
    const first = orders.completeOrder(order.internalOrderId);
    await entered.promise;
    await assert.rejects(
      orders.completeOrder(order.internalOrderId),
      (err) => err.code === 'BILLZ_OPERATION_IN_PROGRESS'
    );
    finish.resolve();
    await first;

    assert.equal(stub.calls.filter((c) => c.fn === 'completeSale').length, 1);
    assert.equal(await reservedFor(productId), 0);
  } finally {
    finish.resolve();
    stub.restore();
  }
});

test('selling records one immutable completion timestamp', async () => {
  const stub = stubSale();
  const { order } = await freshOrder();
  try {
    await orders.reserveOrder(order.internalOrderId);
    const first = await orders.completeOrder(order.internalOrderId);
    assert.ok(first.soldAt instanceof Date || typeof first.soldAt === 'string');
    const firstTime = new Date(first.soldAt).toISOString();

    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await orders.completeOrder(order.internalOrderId);
    assert.equal(new Date(second.soldAt).toISOString(), firstTime);
    assert.equal(stub.calls.filter((c) => c.fn === 'completeSale').length, 1);
  } finally {
    stub.restore();
  }
});

test('cancelling returns the held units and releases the draft', async () => {
  const stub = stubSale();
  const { order, productId } = await freshOrder();
  try {
    await orders.reserveOrder(order.internalOrderId);
    await orders.cancelOrder(order.internalOrderId, { reason: 'customer' });

    assert.equal(await reservedFor(productId), 0);
    assert.equal(stub.calls.filter((c) => c.fn === 'releaseReservation').length, 1);
  } finally {
    stub.restore();
  }
});

test('cancelling twice does not give the units back twice', async () => {
  const stub = stubSale();
  const { order, productId } = await freshOrder();
  try {
    await orders.reserveOrder(order.internalOrderId);
    await orders.cancelOrder(order.internalOrderId);
    await orders.cancelOrder(order.internalOrderId);
    assert.equal(await reservedFor(productId), 0);
    assert.equal(stub.calls.filter((c) => c.fn === 'releaseReservation').length, 1);
  } finally {
    stub.restore();
  }
});

test('two parallel cancellations release and delete one draft once', async () => {
  const entered = deferred();
  const finish = deferred();
  let releaseCalls = 0;
  const stub = stubSale({
    releaseReservation: async () => {
      releaseCalls += 1;
      entered.resolve();
      if (releaseCalls === 1) await finish.promise;
      return {};
    },
  });
  const { order, productId } = await freshOrder();
  try {
    await orders.reserveOrder(order.internalOrderId);
    const first = orders.cancelOrder(order.internalOrderId);
    await entered.promise;
    await assert.rejects(
      orders.cancelOrder(order.internalOrderId),
      (err) => err.code === 'BILLZ_OPERATION_IN_PROGRESS'
    );
    finish.resolve();
    await first;

    assert.equal(stub.calls.filter((c) => c.fn === 'releaseReservation').length, 1);
    assert.equal(stub.calls.filter((c) => c.fn === 'deleteDraft').length, 1);
    assert.equal(await reservedFor(productId), 0);
  } finally {
    finish.resolve();
    stub.restore();
  }
});

test('cancelling before a reservation exists touches neither Billz nor the counter', async () => {
  const stub = stubSale();
  const { order, productId } = await freshOrder();
  try {
    await orders.cancelOrder(order.internalOrderId);
    assert.equal(await reservedFor(productId), 0);
    assert.equal(stub.calls.length, 0);
    assert.equal((await ChannelOrder().findOne({ internalOrderId: order.internalOrderId })).status, 'cancelled');
  } finally {
    stub.restore();
  }
});

test('the units come back even when Billz refuses to release the draft', async () => {
  // Billz keeps its own expiry on a postpone, so a stuck draft frees itself;
  // holding our counter hostage to their error would strand the stock here.
  const stub = stubSale({
    releaseReservation: async () => { throw new Error('billz unavailable'); },
  });
  const { order, productId } = await freshOrder();
  try {
    await orders.reserveOrder(order.internalOrderId);
    await orders.cancelOrder(order.internalOrderId);
    assert.equal(await reservedFor(productId), 0);

    const stored = await ChannelOrder().findOne({ internalOrderId: order.internalOrderId });
    assert.equal(stored.status, 'cancelled');
    assert.match(stored.billz.lastError, /release failed/);
  } finally {
    stub.restore();
  }
});

/* ── Transitions that must not happen ────────────────────────────────────── */

test('a sold order cannot be cancelled', async () => {
  // That is a return: different operation, different accounting.
  const stub = stubSale();
  const { order } = await freshOrder();
  try {
    await orders.reserveOrder(order.internalOrderId);
    await orders.completeOrder(order.internalOrderId);
    await assert.rejects(orders.cancelOrder(order.internalOrderId), /already sold/);
  } finally {
    stub.restore();
  }
});

test('an order cannot be sold before it is reserved', async () => {
  const stub = stubSale();
  const { order } = await freshOrder();
  try {
    await assert.rejects(orders.completeOrder(order.internalOrderId), /must be reserved/);
    assert.equal(stub.calls.length, 0);
  } finally {
    stub.restore();
  }
});

test('a cancelled order cannot be reserved again', async () => {
  const stub = stubSale();
  const { order } = await freshOrder();
  try {
    await orders.cancelOrder(order.internalOrderId);
    await assert.rejects(orders.reserveOrder(order.internalOrderId), /already cancelled/);
  } finally {
    stub.restore();
  }
});

test('a draft id from a part-way failure is kept for cleanup', async () => {
  const stub = stubSale({
    reserveOrder: async () => {
      const err = new Error('line rejected');
      err.billzOrderId = 'orphan-draft';
      throw err;
    },
  });
  const { order } = await freshOrder();
  try {
    await assert.rejects(orders.reserveOrder(order.internalOrderId));
    const stored = await ChannelOrder().findOne({ internalOrderId: order.internalOrderId });
    assert.equal(stored.billz.draftOrderId, 'orphan-draft');
    assert.equal(stored.billz.reconciliationRequired, true);
  } finally {
    stub.restore();
  }
});

test('an unknown reservation result requires reconciliation and blocks every retry', async () => {
  const stub = stubSale({
    reserveOrder: async () => {
      throw classifiedError('connection lost', { outcomeUnknown: true, retrySafe: false });
    },
  });
  const { order, productId } = await freshOrder();
  try {
    await assert.rejects(orders.reserveOrder(order.internalOrderId), /connection lost/);
    await assert.rejects(
      orders.reserveOrder(order.internalOrderId),
      (err) => err.code === 'BILLZ_RECONCILIATION_REQUIRED'
    );

    const stored = await ChannelOrder().findOne({ internalOrderId: order.internalOrderId }).lean();
    assert.equal(stored.status, 'failed');
    assert.equal(stored.billz.reconciliationRequired, true);
    assert.equal(stub.calls.filter((c) => c.fn === 'reserveOrder').length, 1);
    assert.equal(await reservedFor(productId), 0);
  } finally {
    stub.restore();
  }
});

test('a known draft from a partial reservation failure blocks automatic retry', async () => {
  const stub = stubSale({
    reserveOrder: async () => {
      throw classifiedError('line rejected', {
        billzOrderId: 'draft-partial', outcomeUnknown: false, retrySafe: true,
      });
    },
  });
  const { order } = await freshOrder();
  try {
    await assert.rejects(orders.reserveOrder(order.internalOrderId), /line rejected/);
    await assert.rejects(
      orders.reserveOrder(order.internalOrderId),
      (err) => err.code === 'BILLZ_RECONCILIATION_REQUIRED'
    );

    const stored = await ChannelOrder().findOne({ internalOrderId: order.internalOrderId }).lean();
    assert.equal(stored.billz.draftOrderId, 'draft-partial');
    assert.equal(stored.billz.reconciliationRequired, true);
    assert.equal(stub.calls.filter((c) => c.fn === 'reserveOrder').length, 1);
  } finally {
    stub.restore();
  }
});

test('an explicit pre-effect rejection unlocks the order for a safe retry', async () => {
  let attempts = 0;
  const stub = stubSale({
    reserveOrder: async () => {
      attempts += 1;
      if (attempts === 1) {
        throw classifiedError('request rejected', { outcomeUnknown: false, retrySafe: true });
      }
      return { orderId: 'draft-safe-retry', orderNumber: '903' };
    },
  });
  const { order, productId } = await freshOrder();
  try {
    await assert.rejects(orders.reserveOrder(order.internalOrderId), /request rejected/);
    const failed = await ChannelOrder().findOne({ internalOrderId: order.internalOrderId }).lean();
    assert.equal(failed.status, 'failed');
    assert.equal(failed.billz.operationToken, '');
    assert.equal(failed.billz.reconciliationRequired, false);

    await orders.reserveOrder(order.internalOrderId);
    assert.equal(stub.calls.filter((c) => c.fn === 'reserveOrder').length, 2);
    assert.equal(await reservedFor(productId), 3);
  } finally {
    stub.restore();
  }
});

test('an explicit payment rejection retries against the same reserved draft', async () => {
  let attempts = 0;
  const stub = stubSale({
    completeSale: async () => {
      attempts += 1;
      if (attempts === 1) {
        throw classifiedError('payment rejected', { outcomeUnknown: false, retrySafe: true });
      }
      return {};
    },
  });
  const { order, productId } = await freshOrder();
  try {
    const reserved = await orders.reserveOrder(order.internalOrderId);
    await assert.rejects(orders.completeOrder(order.internalOrderId), /payment rejected/);

    const rejected = await ChannelOrder().findOne({ internalOrderId: order.internalOrderId }).lean();
    assert.equal(rejected.status, 'reserved');
    assert.equal(rejected.billz.draftOrderId, reserved.billz.draftOrderId);
    assert.equal(rejected.billz.operationToken, '');
    assert.equal(rejected.billz.reconciliationRequired, false);
    assert.equal(await reservedFor(productId), 3);

    await orders.completeOrder(order.internalOrderId);
    assert.equal(stub.calls.filter((c) => c.fn === 'reserveOrder').length, 1);
    assert.deepEqual(
      stub.calls.filter((c) => c.fn === 'completeSale').map((c) => c.id),
      [reserved.billz.draftOrderId, reserved.billz.draftOrderId]
    );
    assert.equal(await reservedFor(productId), 0);
  } finally {
    stub.restore();
  }
});

test('an unknown payment result keeps the reservation and blocks every retry', async () => {
  const stub = stubSale({
    completeSale: async () => {
      throw classifiedError('payment connection lost', { outcomeUnknown: true, retrySafe: false });
    },
  });
  const { order, productId } = await freshOrder();
  try {
    const reserved = await orders.reserveOrder(order.internalOrderId);
    await assert.rejects(orders.completeOrder(order.internalOrderId), /payment connection lost/);
    await assert.rejects(
      orders.completeOrder(order.internalOrderId),
      (err) => err.code === 'BILLZ_RECONCILIATION_REQUIRED'
    );

    const stored = await ChannelOrder().findOne({ internalOrderId: order.internalOrderId }).lean();
    assert.equal(stored.status, 'failed');
    assert.equal(stored.billz.draftOrderId, reserved.billz.draftOrderId);
    assert.equal(stored.billz.reservationApplied, true);
    assert.equal(stored.billz.reconciliationRequired, true);
    assert.equal(stub.calls.filter((c) => c.fn === 'completeSale').length, 1);
    assert.equal(await reservedFor(productId), 3);
  } finally {
    stub.restore();
  }
});

test('an unknown cancellation result performs no uncertain cleanup', async () => {
  const stub = stubSale({
    releaseReservation: async () => {
      throw classifiedError('release connection lost', { outcomeUnknown: true, retrySafe: false });
    },
  });
  const { order, productId } = await freshOrder();
  try {
    await orders.reserveOrder(order.internalOrderId);
    await assert.rejects(orders.cancelOrder(order.internalOrderId), /release connection lost/);
    await assert.rejects(
      orders.cancelOrder(order.internalOrderId),
      (err) => err.code === 'BILLZ_RECONCILIATION_REQUIRED'
    );

    const stored = await ChannelOrder().findOne({ internalOrderId: order.internalOrderId }).lean();
    assert.equal(stored.status, 'failed');
    assert.equal(stored.billz.reservationApplied, true);
    assert.equal(stored.billz.reconciliationRequired, true);
    assert.equal(stub.calls.filter((c) => c.fn === 'releaseReservation').length, 1);
    assert.equal(stub.calls.filter((c) => c.fn === 'deleteDraft').length, 0);
    assert.equal(await reservedFor(productId), 3);
  } finally {
    stub.restore();
  }
});

test('a stale operation requires reconciliation and is never taken over', async () => {
  const stub = stubSale();
  const { order } = await freshOrder();
  await ChannelOrder().updateOne(
    { internalOrderId: order.internalOrderId },
    {
      $set: {
        'billz.operationAction': 'reserve',
        'billz.operationToken': 'dead-worker-token',
        'billz.operationStartedAt': new Date(Date.now() - 60 * 60 * 1000),
      },
    }
  );

  try {
    await assert.rejects(
      orders.reserveOrder(order.internalOrderId),
      (err) => err.code === 'BILLZ_RECONCILIATION_REQUIRED'
    );
    const stored = await ChannelOrder().findOne({ internalOrderId: order.internalOrderId }).lean();
    assert.equal(stored.status, 'failed');
    assert.equal(stored.billz.reconciliationRequired, true);
    assert.equal(stored.billz.operationToken, 'dead-worker-token');
    assert.equal(stub.calls.length, 0);
  } finally {
    stub.restore();
  }
});

test('a worker that finishes after its lease goes stale cannot clear reconciliation', async () => {
  const entered = deferred();
  const finish = deferred();
  const stub = stubSale({
    reserveOrder: async () => {
      entered.resolve();
      await finish.promise;
      return { orderId: 'draft-stale-owner', orderNumber: '904' };
    },
  });
  const { order, productId } = await freshOrder();
  try {
    const first = orders.reserveOrder(order.internalOrderId);
    await entered.promise;
    await ChannelOrder().updateOne(
      { internalOrderId: order.internalOrderId },
      { $set: { 'billz.operationStartedAt': new Date(Date.now() - 60 * 60 * 1000) } }
    );
    await assert.rejects(
      orders.reserveOrder(order.internalOrderId),
      (err) => err.code === 'BILLZ_RECONCILIATION_REQUIRED'
    );
    finish.resolve();
    await assert.rejects(
      first,
      (err) => err.code === 'BILLZ_OPERATION_OWNERSHIP_LOST'
    );

    const stored = await ChannelOrder().findOne({ internalOrderId: order.internalOrderId }).lean();
    assert.equal(stored.status, 'failed');
    assert.equal(stored.billz.reconciliationRequired, true);
    assert.equal(stored.billz.operationToken.length > 0, true);
    assert.equal(await reservedFor(productId), 0, 'a fenced owner cannot apply local transition state');
  } finally {
    finish.resolve();
    stub.restore();
  }
});

test('an old order with no operation metadata can still be reserved safely', async () => {
  const stub = stubSale();
  const { order, productId } = await freshOrder();
  await ChannelOrder().collection.updateOne(
    { internalOrderId: order.internalOrderId },
    {
      $unset: {
        'billz.operationAction': '',
        'billz.operationToken': '',
        'billz.operationStartedAt': '',
        'billz.reconciliationRequired': '',
      },
    }
  );

  try {
    const stored = await orders.reserveOrder(order.internalOrderId);
    assert.equal(stored.status, 'reserved');
    assert.equal(stored.billz.operationToken, '');
    assert.equal(stored.billz.reconciliationRequired, false);
    assert.equal(await reservedFor(productId), 3);
  } finally {
    stub.restore();
  }
});

test('the sale is recorded against the configured payment type', async () => {
  const stub = stubSale();
  const { order } = await freshOrder();
  try {
    await orders.reserveOrder(order.internalOrderId);
    await orders.completeOrder(order.internalOrderId);
    const call = stub.calls.find((c) => c.fn === 'completeSale');
    assert.equal(call.args.paymentTypeId, 'pt-transfer');
    assert.equal(call.args.paymentTypeName, 'Тестовый тип');
    assert.equal(call.args.amount, 300000);
  } finally {
    stub.restore();
  }
});

test('the sale comment names the channel and their order id', async () => {
  // Every channel books against the same payment type, so a Billz report
  // grouped by payment type cannot tell Medicalka from Uzum. The comment is
  // what makes an individual sale traceable back to the order that caused it.
  const stub = stubSale();
  const { order } = await freshOrder();
  try {
    await orders.reserveOrder(order.internalOrderId);
    await orders.completeOrder(order.internalOrderId);
    const call = stub.calls.find((c) => c.fn === 'completeSale');
    assert.match(call.args.comment, /^medicalka ext-\d+$/);
  } finally {
    stub.restore();
  }
});
