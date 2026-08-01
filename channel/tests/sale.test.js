const assert = require('node:assert/strict');
const test = require('node:test');

process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017';
process.env.BILLZ_SECRET_TOKEN = process.env.BILLZ_SECRET_TOKEN || 'test-secret';
process.env.BILLZ_SHOP_ID = 'shop-a';
process.env.BILLZ_CASHBOX_ID = 'till-1';

const billz = require('../src/billz/client');
const sale = require('../src/billz/sale');
const config = require('../src/config');

/**
 * These exercise the sale flow against a recorded client, not the real API.
 *
 * Every call here mutates a client's live inventory, so the shapes have to be
 * right before it is ever pointed at production — and the ordering matters as
 * much as the shapes: a draft that gains lines after it has been reserved, or
 * a payment posted against a draft with no lines, corrupts stock in ways a
 * later sync cannot detect.
 */

function recordClient(responses = {}) {
  const calls = [];
  const original = billz.request;
  billz.request = async (method, path, options = {}) => {
    calls.push({ method, path, body: options.body, headers: options.headers, query: options.query });
    for (const [pattern, value] of Object.entries(responses)) {
      if (path.startsWith(pattern)) {
        return typeof value === 'function' ? value(path, options) : value;
      }
    }
    return { data: { id: 'draft-1', order_number: '5632631379' } };
  };
  return { calls, restore: () => { billz.request = original; } };
}

const ITEMS = [
  { billzProductId: 'p-1', quantity: 2, unitPrice: 310000 },
  { billzProductId: 'p-2', quantity: 1, unitPrice: 650000 },
];

test('a reservation opens a draft, adds every line, then postpones', async () => {
  const rec = recordClient();
  try {
    const result = await sale.reserveOrder({ items: ITEMS, comment: 'Medicalka MK-1' });

    assert.equal(result.orderId, 'draft-1');
    assert.deepEqual(rec.calls.map((c) => c.path), [
      '/v2/order',
      '/v2/order-product/draft-1',
      '/v2/order-product/draft-1',
      '/v2/order/create_postpone',
    ]);
    // Order matters: postponing before the lines exist reserves nothing.
    assert.equal(rec.calls[rec.calls.length - 1].path, '/v2/order/create_postpone');
  } finally {
    rec.restore();
  }
});

test('the draft is opened against the configured shop and till', async () => {
  const rec = recordClient();
  try {
    await sale.createDraft({ comment: 'x' });
    assert.deepEqual(rec.calls[0].body, {
      shop_id: 'shop-a', cashbox_id: 'till-1', comment: 'x',
    });
  } finally {
    rec.restore();
  }
});

test('a sale cannot be opened without a till', async () => {
  // Billz ties a sale to a cash register; guessing one would file revenue
  // against the wrong till.
  const rec = recordClient();
  const saved = config.billz.cashboxId;
  config.billz.cashboxId = '';
  try {
    await assert.rejects(sale.createDraft(), /BILLZ_CASHBOX_ID is not configured/);
    assert.equal(rec.calls.length, 0, 'must not reach Billz at all');
  } finally {
    config.billz.cashboxId = saved;
    rec.restore();
  }
});

test('lines carry the channel price, not the shop retail price', async () => {
  // A marketplace sells at its own price. Recording the retail price instead
  // would put the wrong revenue on the receipt and in every report built on it.
  const rec = recordClient();
  try {
    await sale.addLine('draft-1', { productId: 'p-9', quantity: 3, unitPrice: 415000 });
    const body = rec.calls[0].body;

    assert.equal(body.product_id, 'p-9');
    assert.equal(body.sold_measurement_value, 3);
    assert.equal(body.use_free_price, true);
    assert.equal(body.free_price, 415000);
    assert.equal(body.used_wholesale_price, false);
  } finally {
    rec.restore();
  }
});

test('a line with no explicit price falls back to Billz pricing', async () => {
  const rec = recordClient();
  try {
    await sale.addLine('draft-1', { productId: 'p-9', quantity: 1 });
    const body = rec.calls[0].body;
    assert.equal('free_price' in body, false);
    assert.equal(body.is_manual, false);
  } finally {
    rec.restore();
  }
});

test('a non-positive quantity is refused before it reaches Billz', async () => {
  const rec = recordClient();
  try {
    await assert.rejects(sale.addLine('d', { productId: 'p', quantity: 0 }), /quantity must be positive/);
    await assert.rejects(sale.addLine('d', { productId: 'p', quantity: -1 }), /quantity must be positive/);
    assert.equal(rec.calls.length, 0);
  } finally {
    rec.restore();
  }
});

test('an empty order is refused', async () => {
  const rec = recordClient();
  try {
    await assert.rejects(sale.reserveOrder({ items: [] }), /at least one line/);
    assert.equal(rec.calls.length, 0, 'must not open an empty draft');
  } finally {
    rec.restore();
  }
});

test('a failure part-way still reports the draft id', async () => {
  // Without it the draft is orphaned in Billz holding stock, and nothing on our
  // side knows which one to release.
  const rec = recordClient({
    '/v2/order-product': () => { throw new Error('billz rejected the line'); },
  });
  try {
    await assert.rejects(
      sale.reserveOrder({ items: ITEMS }),
      (err) => err.billzOrderId === 'draft-1'
    );
  } finally {
    rec.restore();
  }
});

test('completing a sale requires a real payment type', async () => {
  // Channel sales settle by transfer. Filing them under the wrong type breaks
  // till reconciliation rather than just mislabelling a row.
  const rec = recordClient();
  try {
    await assert.rejects(
      sale.completeSale('draft-1', { amount: 100 }),
      /payment type is required/
    );
    assert.equal(rec.calls.length, 0);
  } finally {
    rec.restore();
  }
});

test('a completed sale posts the amount against the payment type', async () => {
  const rec = recordClient();
  try {
    await sale.completeSale('draft-1', { paymentTypeId: 'pt-1', amount: 1270000, comment: 'MK-1' });
    const body = rec.calls[0].body;

    assert.equal(rec.calls[0].path, '/v2/order-payment/draft-1');
    assert.deepEqual(body.payments, [
      { company_payment_type_id: 'pt-1', paid_amount: 1270000, returned_amount: 0 },
    ]);
    assert.equal(body.comment, 'MK-1');
  } finally {
    rec.restore();
  }
});

test('a reservation carries an expiry so lost orders stop holding stock', async () => {
  const rec = recordClient();
  try {
    const expiresAt = new Date('2026-08-10T15:04:05');
    await sale.reserve('draft-1', { expiresAt });
    assert.equal(rec.calls[0].body.time, '2026-08-10 15:04:05');
  } finally {
    rec.restore();
  }
});

test('Billz timestamps are local time without a timezone', async () => {
  assert.equal(sale.formatBillzTime(new Date(2026, 0, 5, 9, 7, 3)), '2026-01-05 09:07:03');
});

test('every write asks Billz to answer over HTTP', async () => {
  // Their default is a websocket reply, which cannot be composed with a
  // request queue — the call would return before the work was acknowledged.
  const rec = recordClient();
  try {
    await sale.reserveOrder({ items: [ITEMS[0]] });
    for (const call of rec.calls) {
      assert.equal(call.headers?.['Billz-Response-Channel'], 'HTTP', `${call.path} missing the header`);
      assert.equal(call.query?.['Billz-Response-Channel'], 'HTTP', `${call.path} missing the query flag`);
    }
  } finally {
    rec.restore();
  }
});

test('releasing a reservation calls return-postpone, the documented method', async () => {
  // There is no `cancel_postpone` endpoint at all. That name was guessed and
  // was wrong in two different shapes, both of which the API's own status codes
  // made look plausible — a 404 on one path and a 403 on another read as "the
  // route exists, we lack permission". Either guess meant every cancellation
  // failed in production and the stock stayed held until Billz's own expiry.
  const rec = recordClient({ '/v2/order/return-postpone': {} });
  try {
    await sale.releaseReservation('draft-7');
    assert.equal(rec.calls[0].method, 'POST');
    assert.equal(rec.calls[0].path, '/v2/order/return-postpone');
    assert.deepEqual(rec.calls[0].body, { order_id: 'draft-7' });
  } finally {
    rec.restore();
  }
});

test('removing a draft is a separate call from releasing it', async () => {
  // Billz returns a released reservation to draft rather than deleting it, so
  // a cancellation that stops at the release leaves an empty draft behind
  // every single time.
  const rec = recordClient({ '/v2/order/draft-7': {} });
  try {
    await sale.deleteDraft('draft-7');
    assert.equal(rec.calls[0].method, 'DELETE');
    assert.equal(rec.calls[0].path, '/v2/order/draft-7');
  } finally {
    rec.restore();
  }
});

test('a completed sale carries the payment type name when one is configured', async () => {
  // Redundant with the id, and in every documented example. Sent because this
  // call cannot be rehearsed: a refused payment leaves an order reserved but
  // unsold, and the only way to learn whether Billz requires the field is to
  // sell something real.
  const rec = recordClient({ '/v2/order-payment/draft-9': {} });
  try {
    await sale.completeSale('draft-9', {
      paymentTypeId: 'pt-1', paymentTypeName: 'Карта', amount: 1000,
    });
    assert.deepEqual(rec.calls[0].body.payments[0].company_payment_type, { name: 'Карта' });
  } finally {
    rec.restore();
  }
});

test('the payment type name is omitted rather than invented', async () => {
  const rec = recordClient({ '/v2/order-payment/draft-9': {} });
  try {
    await sale.completeSale('draft-9', { paymentTypeId: 'pt-1', amount: 1000 });
    assert.equal('company_payment_type' in rec.calls[0].body.payments[0], false);
  } finally {
    rec.restore();
  }
});

test('a missing draft id in the Billz response is an error, not a silent pass', async () => {
  const rec = recordClient({ '/v2/order': { data: {} } });
  try {
    await assert.rejects(sale.createDraft(), /did not return a draft id/);
  } finally {
    rec.restore();
  }
});
