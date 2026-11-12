const config = require('../config');
const logger = require('../logger');
const catalog = require('../core/catalog');
const coreOrders = require('../core/orders');
const BillzProduct = require('../models/BillzProduct');
const ChannelOrder = require('../models/ChannelOrder');
const PartnerOrder = require('../models/PartnerOrder');
const PartnerEvent = require('../models/PartnerEvent');
const { nextValue } = require('../models/Counter');
const serializers = require('./serializers');

/**
 * Partner order lifecycle.
 *
 *   new ──operator accepts──▶ accepted ──partner completes──▶ completed
 *    │                          │
 *    ├─operator rejects / timeout─▶ rejected
 *    └─partner cancels──────────┴──▶ cancelled
 *
 * What each step does to stock in a live order:
 *   new        local hold — the units disappear from every other channel at once
 *   accepted   Billz reservation («otlojka»)
 *   completed  Billz sale under the partner's own key; stock leaves the shop
 *   rejected / cancelled  every hold is given back
 *
 * The same rules the shop agreed for Medicalka: stock is held as soon as an
 * order is accepted, and only becomes a sale when the partner confirms it was
 * delivered and paid.
 *
 * Test-mode orders follow the same states but touch nothing — no stock, no
 * Billz, no Telegram — and are decided automatically after a few seconds.
 */

// All partners sell from one shared configuration on the product card
// (`channels.partners`): one price, one "show to partners" switch, one
// safety cushion. Orders are still recorded per partner.
const CATALOG_CHANNEL = 'partners';

const MAX_LINES = 50;
const MAX_QUANTITY = 999;
const LOCK_STALE_MS = 5 * 60 * 1000;
// Extra time the local hold outlives the decision window, so the timeout
// sweeper — not the hold's own expiry — is what closes an unanswered order.
const HOLD_MARGIN_MS = 30 * 60 * 1000;

class PartnerApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'PartnerApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const fail = (status, code, message, details) => {
  throw new PartnerApiError(status, code, message, details);
};

function text(value, max) {
  return String(value ?? '').trim().slice(0, max);
}

/**
 * Validates order lines against the partner catalogue and live stock.
 * Prices always come from our catalogue — never from the request.
 */
async function resolveItems(rawItems) {
  if (!Array.isArray(rawItems) || !rawItems.length) {
    fail(422, 'validation_error', 'items must contain at least one line');
  }
  if (rawItems.length > MAX_LINES) {
    fail(422, 'validation_error', `an order may contain at most ${MAX_LINES} lines`);
  }

  // Two lines for the same product are one line: the stock check has to see
  // the total, or two lines of 3 would each pass against a stock of 4.
  const wanted = new Map();
  for (const [index, raw] of rawItems.entries()) {
    const productId = Number(raw?.product_id);
    const quantity = Number(raw?.quantity);
    if (!Number.isSafeInteger(productId) || productId <= 0) {
      fail(422, 'validation_error', `items[${index}].product_id must be a positive integer`);
    }
    if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > MAX_QUANTITY) {
      fail(422, 'validation_error', `items[${index}].quantity must be an integer from 1 to ${MAX_QUANTITY}`);
    }
    wanted.set(productId, (wanted.get(productId) || 0) + quantity);
  }

  const items = [];
  const shortages = [];
  for (const [productId, quantity] of wanted) {
    const mirror = await BillzProduct().findOne({ medicalkaId: productId }).lean();
    const entry = mirror ? await catalog.findForChannel(CATALOG_CHANNEL, mirror.billzProductId) : null;
    if (!entry) fail(404, 'product_not_found', `product ${productId} is not in the catalogue`, { product_id: productId });
    const available = catalog.publishedQuantity(entry.card, entry.mirror, CATALOG_CHANNEL);
    if (quantity > available) {
      shortages.push({ product_id: productId, requested: quantity, available: Math.max(0, available) });
      continue;
    }
    const unitPrice = catalog.priceFor(entry.card, CATALOG_CHANNEL);
    items.push({
      productId,
      billzProductId: mirror.billzProductId,
      name: entry.card.name || mirror.name || '',
      quantity,
      unitPrice,
      lineTotal: unitPrice * quantity,
    });
  }
  if (shortages.length) {
    fail(409, 'insufficient_stock', 'not enough stock for some items', { items: shortages });
  }
  return items;
}

function readDelivery(raw) {
  const type = raw?.type === undefined ? 'courier' : raw.type;
  if (!['courier', 'pickup'].includes(type)) {
    fail(422, 'validation_error', 'delivery.type must be "courier" or "pickup"');
  }
  return {
    type,
    address: text(raw?.address, 300),
    comment: text(raw?.comment, 500),
  };
}

async function enqueueEvent(partner, order, type = 'order.status_changed') {
  try {
    await PartnerEvent().create({
      partnerCode: order.partnerCode,
      orderNumber: order.number,
      type,
      payload: serializers.order(order),
      state: partner?.webhookUrl ? 'pending' : 'skipped',
    });
  } catch (err) {
    // The order change has already happened; a lost webhook is recoverable by
    // polling, a failed request after the change is not.
    logger.warn('partner webhook event not recorded', { code: order.partnerCode, number: order.number, err });
  }
}

/**
 * Records a partner's order. Idempotent on the partner's own `order_id`: a
 * resend returns the stored order with `created: false` and changes nothing.
 */
async function createOrder(partner, body) {
  const externalId = text(body?.order_id, 64);
  if (!externalId) fail(422, 'validation_error', 'order_id is required');
  if (!/^[\x21-\x7e]+$/.test(externalId)) {
    fail(422, 'validation_error', 'order_id may contain printable ASCII characters only, without spaces');
  }

  const Model = PartnerOrder();
  // Idempotency is per book: a test order_id reused once live is a new order.
  const test = partner.mode === 'test';
  const existing = await Model.findOne({ partnerCode: partner.code, externalId, test }).lean();
  if (existing) return { order: existing, created: false };

  const testOutcome = body?.test_outcome === 'reject' ? 'reject' : 'accept';
  const items = await resolveItems(body?.items);
  const delivery = readDelivery(body?.delivery);
  const customer = {
    name: text(body?.customer?.name, 100),
    phone: text(body?.customer?.phone, 32),
  };
  const total = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const now = Date.now();
  const windowMs = test
    ? config.partners.testDecisionSeconds * 1000
    : partner.decisionMinutes * 60 * 1000;

  let channelOrderId = '';
  if (!test) {
    // Ledger first, so a crash after this point is retried by the partner's
    // resend: acceptOrder and holdOrder are both idempotent.
    const { order: ledger } = await coreOrders.acceptOrder(partner.channel, {
      externalId,
      items: items.map((i) => ({
        billzProductId: i.billzProductId, name: i.name, quantity: i.quantity, unitPrice: i.unitPrice,
      })),
      totalAmount: total,
      customer: { name: customer.name, phone: customer.phone, address: delivery.address },
      raw: body,
    });
    channelOrderId = ledger.internalOrderId;
    await coreOrders.holdOrder(channelOrderId, { ttlMs: windowMs + HOLD_MARGIN_MS });
  }

  const doc = {
    number: await nextValue('partnerOrderNumber'),
    partnerCode: partner.code,
    externalId,
    test,
    status: 'new',
    items,
    total,
    customer,
    delivery,
    comment: text(body?.comment, 500),
    channelOrderId,
    deadlineAt: new Date(now + windowMs),
    testOutcome,
    history: [{ status: 'new', at: new Date(now), by: 'partner' }],
    notification: { pending: !test, stale: false, messages: [] },
  };

  try {
    const created = await Model.create(doc);
    logger.info('partner order received', {
      code: partner.code, number: doc.number, externalId, test, lines: items.length, total,
    });
    return { order: created.toObject(), created: true };
  } catch (err) {
    if (err.code === 11000) {
      const winner = await Model.findOne({ partnerCode: partner.code, externalId, test }).lean();
      if (winner) return { order: winner, created: false };
    }
    throw err;
  }
}

// The partner sees the book of its current mode: test orders while testing,
// real ones once live.
async function findOrder(partner, externalId) {
  return PartnerOrder().findOne({
    partnerCode: partner.code, externalId: String(externalId || ''), test: partner.mode === 'test',
  }).lean();
}

async function listOrders(partnerCode, { status, limit, offset }) {
  const filter = { partnerCode };
  if (status) filter.status = status;
  const [items, total] = await Promise.all([
    PartnerOrder().find(filter).sort({ createdAt: -1 }).skip(offset).limit(limit).lean(),
    PartnerOrder().countDocuments(filter),
  ]);
  return { items, total };
}

/** Takes the order for one transition, or returns null if it is not in `from`. */
async function claim(filter, from, op) {
  const staleBefore = new Date(Date.now() - LOCK_STALE_MS);
  return PartnerOrder().findOneAndUpdate(
    {
      ...filter,
      status: { $in: from },
      $or: [{ 'lock.op': '' }, { 'lock.op': null }, { 'lock.at': { $lt: staleBefore } }],
    },
    { $set: { lock: { op, at: new Date() } } },
    { new: true }
  ).lean();
}

async function unlock(order) {
  await PartnerOrder().updateOne({ _id: order._id }, { $set: { lock: { op: '', at: null } } });
}

async function finish(partner, order, { status, reason = '', by = '' }) {
  const updated = await PartnerOrder().findOneAndUpdate(
    { _id: order._id },
    {
      $set: {
        status,
        reason,
        deadlineAt: null,
        lock: { op: '', at: null },
        ...(['accepted', 'rejected'].includes(status) && by ? { decidedBy: by } : {}),
        ...(order.test ? {} : { 'notification.stale': true }),
      },
      $push: { history: { status, at: new Date(), reason, by } },
    },
    { new: true }
  ).lean();
  logger.info('partner order status changed', {
    code: order.partnerCode, number: order.number, status, reason, test: order.test,
  });
  await enqueueEvent(partner, updated);
  return updated;
}

/** Explains why a transition was refused, from the order's current state. */
async function refuse(filter, action) {
  const current = await PartnerOrder().findOne(filter).lean();
  if (!current) fail(404, 'order_not_found', 'order not found');
  if (current.lock?.op) fail(409, 'order_busy', 'another change to this order is in progress; retry shortly');
  fail(409, 'invalid_status', `cannot ${action} an order that is ${current.status}`, { status: current.status });
}

async function ledgerNeedsPerson(order) {
  if (!order.channelOrderId) return false;
  const ledger = await ChannelOrder().findOne({ internalOrderId: order.channelOrderId }).lean();
  return Boolean(ledger?.billz?.reconciliationRequired);
}

/** Operator (or the test-mode robot) accepts a new order. */
async function accept(partner, filter, { by = '' } = {}) {
  const order = await claim(filter, ['new'], 'accept');
  if (!order) return refuse(filter, 'accept');
  if (order.test) return finish(partner, order, { status: 'accepted', by: by || 'test' });

  if (!config.billzWriteEnabled) {
    await unlock(order);
    fail(503, 'billz_writes_disabled', 'Billz writes are switched off on this server');
  }
  try {
    await coreOrders.reserveOrder(order.channelOrderId);
  } catch (err) {
    const uncertain = await ledgerNeedsPerson(order);
    await unlock(order);
    logger.warn('partner order reservation failed', { code: order.partnerCode, number: order.number, uncertain, err });
    fail(uncertain ? 502 : 503, uncertain ? 'billz_uncertain' : 'billz_unavailable',
      uncertain ? 'Billz state is uncertain — check the order in the panel' : 'Billz did not answer; try again');
  }
  return finish(partner, order, { status: 'accepted', by });
}

async function releaseLedger(order, reason) {
  if (!order.channelOrderId) return;
  await coreOrders.cancelOrder(order.channelOrderId, { reason });
}

/** Operator rejects a new order, or the timeout does it for them. */
async function reject(partner, filter, { by = '', reason = 'rejected_by_shop' } = {}) {
  const order = await claim(filter, ['new'], 'reject');
  if (!order) return refuse(filter, 'reject');
  try {
    await releaseLedger(order, reason);
  } catch (err) {
    await unlock(order);
    logger.warn('partner order release failed', { code: order.partnerCode, number: order.number, err });
    fail(503, 'release_failed', 'stock could not be released yet; try again');
  }
  return finish(partner, order, { status: 'rejected', reason, by });
}

/** The partner (or the shop, from the panel) cancels a new or accepted order. */
async function cancel(partner, filter, { reason = '', by = 'partner' } = {}) {
  const order = await claim(filter, ['new', 'accepted'], 'cancel');
  if (!order) return refuse(filter, 'cancel');
  const why = text(reason, 200) || (by === 'partner' ? 'cancelled_by_partner' : 'cancelled_by_shop');
  try {
    await releaseLedger(order, why);
  } catch (err) {
    await unlock(order);
    logger.warn('partner order cancel failed', { code: order.partnerCode, number: order.number, err });
    fail(503, 'release_failed', 'the reservation could not be released yet; try again');
  }
  return finish(partner, order, { status: 'cancelled', reason: why, by });
}

/** The partner confirms delivery and payment: the sale is written to Billz. */
async function complete(partner, filter) {
  const order = await claim(filter, ['accepted'], 'complete');
  if (!order) return refuse(filter, 'complete');
  if (!order.test) {
    if (!config.billzWriteEnabled) {
      await unlock(order);
      fail(503, 'billz_writes_disabled', 'sales cannot be recorded right now; try again later');
    }
    try {
      await coreOrders.completeOrder(order.channelOrderId);
    } catch (err) {
      const uncertain = await ledgerNeedsPerson(order);
      await unlock(order);
      logger.warn('partner order sale failed', { code: order.partnerCode, number: order.number, uncertain, err });
      fail(503, uncertain ? 'sale_pending_review' : 'billz_unavailable',
        uncertain
          ? 'the sale is being checked by the shop; do not resend, the status will change by itself'
          : 'the sale could not be recorded yet; retry in a minute');
    }
  }
  return finish(partner, order, { status: 'completed', by: 'partner' });
}

module.exports = {
  CATALOG_CHANNEL,
  PartnerApiError,
  createOrder,
  findOrder,
  listOrders,
  accept,
  reject,
  cancel,
  complete,
  enqueueEvent,
};
