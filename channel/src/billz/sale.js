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
    throw new Error(`billz did not return a draft id: ${JSON.stringify(response).slice(0, 200)}`);
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
 * Expressed as a currency discount, which is what Billz offers for this: the
 * line keeps the retail price and carries the difference as a discount, so the
 * total matches what the customer paid either way.
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
 * Releases a reservation. The stock returns to the shop.
 *
 * The order id goes in the body, not the path. Probing the live API settled
 * this: `/v2/order/cancel_postpone/<id>` answers 404 — no such route — while
 * `/v2/order/cancel_postpone` answers 403, which is a route that exists and a
 * permission we do not yet hold. A 404 and a 403 from the same host are not the
 * same kind of "no".
 *
 * Untested end to end for that reason. Everything up to here — draft, line,
 * postpone — has been run against the real company; this call has not, because
 * the integration key is still refused on it.
 */
async function releaseReservation(orderId) {
  return billz.request('PUT', '/v2/order/cancel_postpone', {
    query: { 'Billz-Response-Channel': 'HTTP' },
    headers: HTTP_CHANNEL,
    body: { order_id: orderId },
  });
}

/**
 * Completes the sale. This is the point at which Billz decrements stock.
 *
 * The payment type has to be a real one from the company's list — channel sales
 * are settled by transfer rather than cash, and recording them under the wrong
 * type corrupts the till reconciliation rather than just mislabelling a row.
 */
async function completeSale(orderId, { paymentTypeId, amount, comment = '' }) {
  if (!paymentTypeId) {
    throw new Error('a company payment type is required to complete a sale');
  }
  return billz.request('POST', `/v2/order-payment/${orderId}`, {
    query: { 'Billz-Response-Channel': 'HTTP' },
    headers: HTTP_CHANNEL,
    body: {
      payments: [{ company_payment_type_id: paymentTypeId, paid_amount: amount, returned_amount: 0 }],
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
async function reserveOrder({ items, comment, expiresAt, sellerIds }) {
  if (!Array.isArray(items) || !items.length) throw new Error('an order needs at least one line');

  const { orderId, orderNumber } = await createDraft({ comment });

  try {
    for (const item of items) {
      await addLine(orderId, {
        productId: item.billzProductId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        sellerIds,
      });
    }
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
  formatBillzTime,
  releaseReservation,
  reserve,
  reserveOrder,
  setLinePrice,
};
