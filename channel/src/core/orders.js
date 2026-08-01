const crypto = require('crypto');
const config = require('../config');
const logger = require('../logger');
const sale = require('../billz/sale');
const BillzProduct = require('../models/BillzProduct');
const ChannelOrder = require('../models/ChannelOrder');
const { nextValue } = require('../models/Counter');

/**
 * Channel order lifecycle.
 *
 * Two properties matter more than anything else here.
 *
 * **A resent order must never become a second sale.** Marketplaces resend when
 * our reply is slow or lost — Uzum's contract requires a resend to return the
 * same order id with a 200 — so acceptance is an upsert keyed on
 * (channel, externalId), and a repeat returns the stored record untouched.
 *
 * **Reserved units are counted exactly once.** `reservationApplied` is the
 * guard: a retry that re-runs a failed step must not hold the same units twice,
 * and a release must not give them back twice. Getting this wrong drifts the
 * mirror away from Billz in a way no sync corrects, because reservedQty is ours
 * and sync deliberately never overwrites it.
 *
 * Accepting an order does not touch Billz. That happens afterwards, so a slow
 * or unavailable Billz cannot make us miss the 15-minute window Uzum gives us
 * to acknowledge an order.
 */

// How long an unconfirmed bot order keeps stock out of the marketplaces. Long
// enough to cover a normal working shift, short enough that a forgotten order
// does not quietly strand inventory.
const DEFAULT_HOLD_TTL_MS = config.bot.holdTtlMs;

function newInternalOrderId() {
  return crypto.randomUUID();
}

/**
 * Records an order, or returns the one already stored under the same external
 * id. `created` tells the caller which happened; the response body is the same
 * either way, which is what the contract requires.
 */
async function acceptOrder(channel, { externalId, items, totalAmount, customer, raw }) {
  if (!externalId) throw new Error('an external order id is required');
  if (!Array.isArray(items) || !items.length) throw new Error('an order needs at least one line');

  const Model = ChannelOrder();
  const existing = await Model.findOne({ channel, externalId }).lean();
  if (existing) {
    logger.info('duplicate channel order ignored', { channel, externalId });
    return { order: existing, created: false };
  }

  const doc = {
    channel,
    externalId: String(externalId),
    internalOrderId: newInternalOrderId(),
    items: items.map((i) => ({
      billzProductId: i.billzProductId,
      name: i.name || '',
      quantity: Number(i.quantity) || 0,
      unitPrice: Number(i.unitPrice) || 0,
    })),
    totalAmount: Number(totalAmount) || items.reduce(
      (sum, i) => sum + (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0), 0
    ),
    customer: customer || {},
    status: 'received',
    rawIn: raw || null,
  };

  try {
    const created = await Model.create(doc);
    return { order: created.toObject(), created: true };
  } catch (err) {
    // Two copies of the same order arriving at once: the index decides, and the
    // loser reads back the winner rather than reporting a failure.
    if (err.code === 11000) {
      const winner = await Model.findOne({ channel, externalId }).lean();
      if (winner) return { order: winner, created: false };
    }
    throw err;
  }
}

/**
 * Allocates the integer id a channel answers with, once per order.
 *
 * Medicalka's contract types ids as integers and their own example replies
 * `{"wc_order_id": 25545}`; a uuid there is a type error on the very first
 * order. Allocated lazily so the number is only spent on an order that was
 * actually answered, and stored so a resend returns the same one.
 */
async function ensurePublicOrderId(internalOrderId) {
  const Model = ChannelOrder();
  const existing = await Model.findOne({ internalOrderId }).select('publicOrderId').lean();
  if (existing?.publicOrderId) return existing.publicOrderId;

  const value = await nextValue('publicOrderId');
  await Model.updateOne(
    { internalOrderId, publicOrderId: null },
    { $set: { publicOrderId: value } }
  );

  // A concurrent resend may have won; its number is the one that stuck.
  const fresh = await Model.findOne({ internalOrderId }).select('publicOrderId').lean();
  return fresh?.publicOrderId || value;
}

/**
 * Moves this order's units on one of the mirror's two counters.
 *
 * `reservedQty` is stock Billz is holding for us; `pendingQty` is stock only we
 * are holding, for a bot order still waiting on an operator. Both are subtracted
 * from what any channel is allowed to sell, and neither is ever written by the
 * catalogue sync — which is exactly why a double application here would drift
 * permanently instead of being corrected on the next tick.
 */
async function applyCounter(items, field, sign) {
  const Mirror = BillzProduct();
  await Mirror.bulkWrite(
    items.map((item) => ({
      updateOne: {
        filter: { billzProductId: item.billzProductId },
        update: { $inc: { [field]: sign * item.quantity } },
      },
    })),
    { ordered: false }
  );
}

/** Adds or removes this order's units from the mirror's reserved counter. */
async function applyReservedQty(items, sign) {
  return applyCounter(items, 'reservedQty', sign);
}

/** Adds or removes this order's units from the mirror's local hold counter. */
async function applyPendingQty(items, sign) {
  return applyCounter(items, 'pendingQty', sign);
}

/**
 * Takes a local hold on an order's stock without telling Billz anything.
 *
 * This is the bot's case: a customer has ordered, but nothing may be written to
 * Billz until an operator confirms in the Telegram channel. Without the hold,
 * those units stay on sale in every marketplace during the minutes or hours the
 * order waits — and the first confirmation then finds the stock gone.
 *
 * Idempotent: an order already holding returns unchanged.
 */
async function holdOrder(internalOrderId, { ttlMs = DEFAULT_HOLD_TTL_MS } = {}) {
  const order = await ChannelOrder().findOne({ internalOrderId });
  if (!order) throw new Error(`unknown order ${internalOrderId}`);
  if (order.billz.pendingApplied) return order.toObject();
  if (order.status !== 'received') return order.toObject();

  // Counter first: a crash before the flag is stored leaves stock held with the
  // order still marked unheld, which over-protects. The reverse under-protects,
  // and over-selling is the failure that reaches a customer.
  await applyPendingQty(order.items, +1);
  order.billz.pendingApplied = true;
  order.holdExpiresAt = new Date(Date.now() + ttlMs);
  await order.save();

  logger.info('local hold taken', { internalOrderId, channel: order.channel });
  return order.toObject();
}

/**
 * Gives back a local hold if one is held. Takes the loaded document so callers
 * can fold it into a save they are already making.
 */
async function releaseHold(order) {
  if (!order.billz.pendingApplied) return false;
  await applyPendingQty(order.items, -1);
  order.billz.pendingApplied = false;
  order.holdExpiresAt = null;
  return true;
}

/**
 * Holds stock in Billz for an accepted order.
 *
 * Safe to call again after a failure: an order that already reserved returns
 * unchanged, and the counter is only moved on the transition itself.
 */
async function reserveOrder(internalOrderId) {
  const Model = ChannelOrder();
  const order = await Model.findOne({ internalOrderId });
  if (!order) throw new Error(`unknown order ${internalOrderId}`);
  if (order.status === 'reserved') return order.toObject();
  if (['sold', 'cancelled'].includes(order.status)) {
    throw new Error(`order ${internalOrderId} is already ${order.status}`);
  }

  order.billz.attempts += 1;
  order.billz.lastTriedAt = new Date();

  try {
    const { orderId, orderNumber } = await sale.reserveOrder({
      items: order.items.map((i) => ({
        billzProductId: i.billzProductId,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
      })),
      comment: `${order.channel} ${order.externalId}`,
    });

    // Counter first, then status: a crash between the two leaves units
    // reserved with the order still marked for retry, which an operator can
    // see and correct. The reverse order would silently under-reserve.
    await applyReservedQty(order.items, +1);
    // Set with no `await` between it and the counter it describes. Anything in
    // between — including the hold release below — could throw, and the failure
    // path saves the order: a saved order whose flag says it holds nothing
    // while the counter says otherwise leaks those units permanently, because
    // the cancellation path trusts the flag.
    order.billz.reservationApplied = true;

    // Billz is now holding the same units, so the local hold has to go — the
    // two counters are both subtracted from sellable stock, and keeping both
    // would take twice the inventory off sale. Released after the reservation
    // rather than before, so no window exists where nothing is holding.
    await releaseHold(order);

    order.billz.draftOrderId = orderId;
    order.billz.orderNumber = orderNumber;
    order.billz.lastError = '';
    order.status = 'reserved';
    await order.save();

    logger.info('channel order reserved', {
      internalOrderId, channel: order.channel, billzOrderId: orderId,
    });
    return order.toObject();
  } catch (err) {
    order.status = 'failed';
    order.billz.lastError = err.message;
    // Kept even on failure: a draft may exist in Billz holding stock, and this
    // is the only handle to it.
    if (err.billzOrderId) order.billz.draftOrderId = err.billzOrderId;
    await order.save();
    logger.error('channel order reservation failed', { internalOrderId, err });
    throw err;
  }
}

/**
 * Completes the sale. Billz decrements stock at this point, so the reservation
 * is handed back at the same time — leaving it would double-count the units.
 */
async function completeOrder(internalOrderId, { paymentTypeId } = {}) {
  const Model = ChannelOrder();
  const order = await Model.findOne({ internalOrderId });
  if (!order) throw new Error(`unknown order ${internalOrderId}`);
  if (order.status === 'sold') return order.toObject();
  if (order.status !== 'reserved') {
    throw new Error(`order ${internalOrderId} must be reserved before it can be sold`);
  }

  const typeId = paymentTypeId || config.billz.paymentTypeId;
  order.billz.attempts += 1;
  order.billz.lastTriedAt = new Date();

  try {
    await sale.completeSale(order.billz.draftOrderId, {
      paymentTypeId: typeId,
      paymentTypeName: config.billz.paymentTypeName,
      amount: order.totalAmount,
      // Every channel sale lands on the same payment type, so this comment is
      // what tells them apart in Billz — which order, from which marketplace.
      comment: `${order.channel} ${order.externalId}`,
    });

    if (order.billz.reservationApplied) {
      await applyReservedQty(order.items, -1);
      order.billz.reservationApplied = false;
    }
    // Normally already gone — reserving releases it. Kept as a belt-and-braces
    // release so a hold can never outlive the order that took it.
    await releaseHold(order);
    order.status = 'sold';
    order.billz.lastError = '';
    await order.save();

    logger.info('channel order sold', { internalOrderId, channel: order.channel });
    return order.toObject();
  } catch (err) {
    order.status = 'failed';
    order.billz.lastError = err.message;
    await order.save();
    logger.error('channel order sale failed', { internalOrderId, err });
    throw err;
  }
}

/**
 * Cancels an order and returns any held stock.
 *
 * An order cancelled before it reached Billz simply changes status. One that
 * already sold cannot be cancelled here — that is a return, which is a
 * different operation with different accounting.
 */
async function cancelOrder(internalOrderId, { reason = '' } = {}) {
  const Model = ChannelOrder();
  const order = await Model.findOne({ internalOrderId });
  if (!order) throw new Error(`unknown order ${internalOrderId}`);
  if (order.status === 'cancelled') return order.toObject();
  if (order.status === 'sold') {
    throw new Error(`order ${internalOrderId} is already sold — a return is not a cancellation`);
  }

  if (order.billz.draftOrderId) {
    try {
      await sale.releaseReservation(order.billz.draftOrderId);
      // Releasing turns the reservation back into a draft rather than removing
      // it. Without this second step every cancelled marketplace order would
      // leave an empty draft in the operator's sales list, permanently.
      // Non-fatal on its own: the stock is already back, and a stray draft is
      // clutter rather than a stock error.
      try {
        await sale.deleteDraft(order.billz.draftOrderId);
      } catch (err) {
        logger.warn('released the reservation but could not remove the draft', {
          internalOrderId, billzOrderId: order.billz.draftOrderId, err,
        });
      }
    } catch (err) {
      // The stock still has to come back on our side. Billz keeps its own
      // expiry on the postpone, so a stuck draft releases itself eventually,
      // and the error is recorded for an operator.
      logger.warn('could not release billz reservation', { internalOrderId, err });
      order.billz.lastError = `release failed: ${err.message}`;
    }
  }

  if (order.billz.reservationApplied) {
    await applyReservedQty(order.items, -1);
    order.billz.reservationApplied = false;
  }
  await releaseHold(order);
  order.status = 'cancelled';
  if (reason) order.billz.lastError = order.billz.lastError || `cancelled: ${reason}`;
  await order.save();

  logger.info('channel order cancelled', { internalOrderId, channel: order.channel, reason });
  return order.toObject();
}

module.exports = {
  DEFAULT_HOLD_TTL_MS,
  acceptOrder,
  applyPendingQty,
  applyReservedQty,
  cancelOrder,
  completeOrder,
  ensurePublicOrderId,
  holdOrder,
  releaseHold,
  reserveOrder,
};
