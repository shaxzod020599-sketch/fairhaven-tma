const config = require('../config');
const logger = require('../logger');
const billz = require('./client');

/**
 * Writing a sale back into Billz.
 *
 * Billz models a sale as a short-lived draft that accumulates lines and is then
 * either postponed (a reservation that holds stock) or paid (a completed sale
 * that consumes it). We use both halves:
 *
 *   order arrives   -> draft + lines + postpone   = stock reserved, not sold
 *   payment/delivery-> payment                    = sale completed
 *   cancellation    -> postpone cancelled         = stock released
 *
 * Reserving first is what stops two channels selling the same unit while an
 * order sits unpaid. It also means a cancelled order costs nothing.
 *
 * Every call goes through the shared rate limiter in client.js, and every write
 * is refused outright while BILLZ_WRITE_ENABLED is off — so this module is
 * inert until someone deliberately turns it on.
 */

// Billz answers over a websocket by default; this header makes it reply on the
// same HTTP request, which is the only mode that composes with a queue.
const HTTP_CHANNEL = { 'Billz-Response-Channel': 'HTTP' };

function requireCashbox() {
  if (!config.billz.cashboxId) {
    throw new Error('BILLZ_CASHBOX_ID is not configured — a sale cannot be opened without a till');
  }
  return config.billz.cashboxId;
}

/** Opens an empty draft. Returns its id and the number shown in the Billz UI. */
async function createDraft({ comment } = {}) {
  const response = await billz.request('POST', '/v2/order', {
    query: { 'Billz-Response-Channel': 'HTTP' },
    headers: HTTP_CHANNEL,
    body: {
      shop_id: config.billz.shopId,
      cashbox_id: requireCashbox(),
      ...(comment ? { comment } : {}),
    },
  });

  const data = response?.data || response;
  const orderId = data?.id;
  if (!orderId) {
    const err = new Error('billz created a draft but did not return a draft id');
    err.outcomeUnknown = true;
    err.retrySafe = false;
    throw err;
  }
  return { orderId, orderNumber: data.order_number || '' };
}

/**
 * Adds one product line at the channel's own price.
 *
 * Marketplace prices differ from the shop's retail price, so the line has to
 * carry the price we actually sold at — otherwise the Billz receipt, and every
 * report built on it, records the wrong revenue. `use_free_price` is the
 * mechanism for that and requires the product to allow a free price in Billz;
 * `applyLinePrice` below falls back to a manual discount when it does not.
 */
async function addLine(orderId, { productId, quantity, unitPrice, sellerIds = [] }) {
  if (!(quantity > 0)) throw new Error(`quantity must be positive, got ${quantity}`);

  const body = {
    product_id: productId,
    sold_measurement_value: quantity,
    used_wholesale_price: false,
    is_manual: Boolean(unitPrice),
    response_type: 'HTTP',
    ...(sellerIds.length ? { seller_ids: sellerIds } : {}),
    ...(unitPrice ? { use_free_price: true, free_price: unitPrice } : {}),
  };

  return billz.request('POST', `/v2/order-product/${orderId}`, {
    query: { 'Billz-Response-Channel': 'HTTP' },
    headers: HTTP_CHANNEL,
    body,
  });
}

/**
 * Forces a line to a given price when the product does not allow a free price.
 *
 * Despite the endpoint's name this sets the price rather than subtracting from
 * it: `CURRENCY` with 333000 on a 280000 product produces a line of 333000, not
 * −53000. Verified against the live company, at quantity two, so the per-unit
 * reading is not an artefact of a single-unit test: two units came to 666000.
 */
async function setLinePrice(orderId, { productId, price }) {
  return billz.request('POST', `/v2/order-manual-discount/${orderId}`, {
    query: { 'Billz-Response-Channel': 'HTTP' },
    headers: HTTP_CHANNEL,
    body: { discount_unit: 'CURRENCY', discount_value: price, product_id: productId },
  });
}

/**
 * Turns the draft into a reservation that holds stock.
 *
 * `time` is when Billz releases it on its own. Setting it well beyond any
 * plausible fulfilment window means an order we lose track of eventually stops
 * holding stock rather than holding it forever.
 */
async function reserve(orderId, { expiresAt, comment = '' } = {}) {
  const expiry = expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  return billz.request('POST', '/v2/order/create_postpone', {
    query: { 'Billz-Response-Channel': 'HTTP' },
    headers: HTTP_CHANNEL,
    body: {
      order_id: orderId,
      comment,
      time: formatBillzTime(expiry),
    },
  });
}

/**
 * Releases a reservation. The held units return to the shop's active stock.
 *
 * There is no `cancel_postpone` endpoint. That name was a guess and it was
 * wrong — twice, in two different shapes — and both guesses were wrong in a way
 * the API's own error codes made look plausible: a 404 for one path and a 403
 * for another read as "the route exists, we lack permission". Neither route
 * existed. Verified against the published method list and then run against the
 * live company.
 *
 * **This returns the order to a draft; it does not remove it.** Billz is
 * explicit about that, and leaving it there means every cancelled marketplace
 * order deposits an empty draft in the operator's sales list forever. Callers
 * follow this with `deleteDraft`.
 */
async function releaseReservation(orderId) {
  return billz.request('POST', '/v2/order/return-postpone', {
    query: { 'Billz-Response-Channel': 'HTTP' },
    headers: HTTP_CHANNEL,
    body: { order_id: orderId },
  });
}

/**
 * Removes a draft outright.
 *
 * Only works on a draft: a postponed order is refused with "failed to validate
 * delete order" until its reservation has been returned, so this always follows
 * `releaseReservation` rather than replacing it.
 */
async function deleteDraft(orderId) {
  return billz.request('DELETE', `/v2/order/${orderId}`, {
    query: { 'Billz-Response-Channel': 'HTTP' },
    headers: HTTP_CHANNEL,
  });
}

/**
 * Completes the sale. This is the point at which Billz decrements stock.
 *
 * The payment type has to be a real one from the company's list — channel sales
 * are settled by transfer rather than cash, and recording them under the wrong
 * type corrupts the till reconciliation rather than just mislabelling a row.
 */
async function completeSale(orderId, { paymentTypeId, paymentTypeName, amount, comment = '' }) {
  if (!paymentTypeId) {
    throw new Error('a company payment type is required to complete a sale');
  }
  return billz.request('POST', `/v2/order-payment/${orderId}`, {
    query: { 'Billz-Response-Channel': 'HTTP' },
    headers: HTTP_CHANNEL,
    body: {
      payments: [{
        company_payment_type_id: paymentTypeId,
        paid_amount: amount,
        returned_amount: 0,
        // Redundant with the id, and every documented example carries it.
        // Sent when configured because a refused payment leaves an order
        // reserved but unsold, and this call cannot be rehearsed — the only way
        // to find out whether Billz requires the field is to sell something.
        ...(paymentTypeName ? { company_payment_type: { name: paymentTypeName } } : {}),
      }],
      comment,
      with_cashback: 0,
      without_cashback: false,
      skip_ofd: false,
    },
  });
}

/** Billz expects "YYYY-MM-DD HH:MM:SS" in the shop's local time. */
function formatBillzTime(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} `
    + `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** What Billz thinks the draft is worth. */
async function orderTotal(orderId) {
  const response = await billz.request('GET', `/v2/order/${orderId}`, {
    query: { 'Billz-Response-Channel': 'HTTP' },
    headers: HTTP_CHANNEL,
  });
  const detail = response?.order_detail || response?.data?.order_detail;
  return Number(detail?.total_price) || 0;
}

/**
 * Confirms Billz priced the draft the way we intended, and corrects it if not.
 *
 * Billz refuses a payment whose amount does not equal the order total — error
 * 20035's neighbour, `20020 wrong payment amount`, which reports both figures.
 * Without this check that refusal arrives at the very last step, **after the
 * stock is reserved and the customer has been told the order is accepted**. The
 * order then sits in `failed` with its units held, for a reason that has nothing
 * to do with availability.
 *
 * `use_free_price` is the normal path and works, but it depends on a per-product
 * setting in Billz. When a product does not allow it the line silently keeps the
 * shop's retail price, which is both the wrong revenue and the wrong total. The
 * manual discount is the documented way to force a price on such a product;
 * both are per unit, verified against the live company.
 */
async function ensurePricing(orderId, items, { onProgress } = {}) {
  const priced = items.filter((item) => Number(item.unitPrice) > 0);
  if (!priced.length) return; // Billz's own pricing is what we want.

  const expected = items.reduce(
    (sum, item) => sum + item.quantity * (Number(item.unitPrice) || 0), 0
  );
  if (await orderTotal(orderId) === expected) return;

  logger.warn('billz priced the draft differently — forcing the channel price', { orderId });
  for (const item of priced) {
    if (onProgress) {
      await onProgress({ stage: 'before_write', operation: 'set_line_price', orderId });
    }
    await setLinePrice(orderId, { productId: item.billzProductId, price: item.unitPrice });
  }

  const corrected = await orderTotal(orderId);
  if (corrected !== expected) {
    // Refused here, before the reservation. Reserving an order that cannot be
    // paid for holds stock nobody can sell and nobody can release except by
    // hand.
    throw new Error(
      `billz totals ${corrected} but this order is ${expected}; the sale would be `
      + 'refused as a wrong payment amount'
    );
  }
}

/**
 * Builds a reservation for a whole order.
 *
 * Lines are added one at a time because Billz accepts one product per call, and
 * they run in sequence through the shared limiter rather than in parallel —
 * concurrent writes against the same draft are not something their API promises
 * to order correctly.
 *
 * Returns the draft id even when a later step fails, so the caller can release
 * or retry rather than leaving a half-built draft holding stock invisibly.
 */
async function reserveOrder({ items, comment, expiresAt, sellerIds, onProgress }) {
  if (!Array.isArray(items) || !items.length) throw new Error('an order needs at least one line');

  const { orderId, orderNumber } = await createDraft({ comment });

  try {
    if (onProgress) await onProgress({ stage: 'draft_created', orderId, orderNumber });
    for (const item of items) {
      if (onProgress) {
        await onProgress({ stage: 'before_write', operation: 'add_line', orderId });
      }
      await addLine(orderId, {
        productId: item.billzProductId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        sellerIds,
      });
    }
    // Before the reservation, deliberately: a mispriced draft is cheap to
    // abandon and expensive to discover at payment.
    await ensurePricing(orderId, items, { onProgress });
    if (onProgress) await onProgress({ stage: 'before_write', operation: 'reserve', orderId });
    await reserve(orderId, { expiresAt, comment });
    logger.info('billz reservation created', { orderId, orderNumber, lines: items.length });
    return { orderId, orderNumber };
  } catch (err) {
    // Surfacing the draft id matters more than the error alone: without it the
    // draft is orphaned in Billz and nobody knows which one to clean up.
    err.billzOrderId = orderId;
    throw err;
  }
}

module.exports = {
  addLine,
  completeSale,
  createDraft,
  deleteDraft,
  ensurePricing,
  formatBillzTime,
  orderTotal,
  releaseReservation,
  reserve,
  reserveOrder,
  setLinePrice,
};
