const crypto = require('crypto');
const config = require('../config');
const logger = require('../logger');
const sale = require('../billz/sale');
const BillzProduct = require('../models/BillzProduct');
const ChannelOrder = require('../models/ChannelOrder');

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

/** Adds or removes this order's units from the mirror's reserved counter. */
async function applyReservedQty(items, sign) {
  const Mirror = BillzProduct();
  await Mirror.bulkWrite(
    items.map((item) => ({
      updateOne: {
        filter: { billzProductId: item.billzProductId },
        update: { $inc: { reservedQty: sign * item.quantity } },
      },
    })),
    { ordered: false }
  );
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

    order.billz.draftOrderId = orderId;
    order.billz.orderNumber = orderNumber;
    order.billz.reservationApplied = true;
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
      amount: order.totalAmount,
      comment: `${order.channel} ${order.externalId}`,
    });

    if (order.billz.reservationApplied) {
      await applyReservedQty(order.items, -1);
      order.billz.reservationApplied = false;
    }
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
  order.status = 'cancelled';
  if (reason) order.billz.lastError = order.billz.lastError || `cancelled: ${reason}`;
  await order.save();

  logger.info('channel order cancelled', { internalOrderId, channel: order.channel, reason });
  return order.toObject();
}

module.exports = {
  acceptOrder,
  applyReservedQty,
  cancelOrder,
  completeOrder,
  reserveOrder,
};
