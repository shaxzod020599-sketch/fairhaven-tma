const ChannelOrder = require('../models/ChannelOrder');
const orders = require('../core/orders');
const logger = require('../logger');

/**
 * Billz reservations for accepted Medicalka approvals.
 *
 * Accepting an approval reserves its lines in Billz, so the stock leaves sale
 * the moment an admin accepts — as with Yandex. The paid sub-order then turns
 * that reservation into the sale (`adopt`, called from subOrders.js), and a
 * checkout that ends unpaid — closed by Medicalka, or not paid within `ttlMs` —
 * releases it.
 *
 * Accepting never waits on Billz: Medicalka allows three minutes to answer, and
 * a reservation that could not be taken only means the sale is made at payment.
 * Every reservation lives on its own ChannelOrder (`approval:<id>`) until the
 * paid order adopts it under the parent order id the rest of the flow uses.
 */

const PLACING_LEASE_MS = 5 * 60 * 1000;
// How long a paid sub-order waits for the approval sync to link it to a
// reservation still waiting on its order id; the history sync runs every minute.
const LINK_WAIT_MS = 3 * 60 * 1000;
// An order id means the customer reached payment; a reservation still unpaid a
// day later is not going to be, and the sale (if any) is made fresh instead.
const ORDERED_TTL_MS = 24 * 60 * 60 * 1000;
const CLOSED = new Set(['rejected', 'cancelled', 'canceled', 'expired']);
const LIVE = ['reserved', 'placing'];

const code = (err, fallback) => String(err?.code || err?.message || fallback).slice(0, 200);

function lineTotals(items = []) {
  const totals = new Map();
  for (const item of items) {
    const row = totals.get(item.billzProductId) || { quantity: 0, prices: new Set() };
    row.quantity += Number(item.quantity) || 0;
    row.prices.add(Number(item.unitPrice) || 0);
    totals.set(item.billzProductId, row);
  }
  return totals;
}

function sameLines(left, right) {
  const a = lineTotals(left);
  const b = lineTotals(right);
  if (a.size !== b.size) return false;
  for (const [id, row] of a) {
    const other = b.get(id);
    if (!other || other.quantity !== row.quantity) return false;
    if ([...row.prices].sort().join() !== [...other.prices].sort().join()) return false;
  }
  return true;
}

function createHoldService({
  ApprovalModel,
  SubOrderModel,
  links,
  orderService = orders,
  OrderModel = ChannelOrder(),
  placingEnabled = () => false,
  writesEnabled = () => false,
  ttlMs = 2 * 60 * 60 * 1000,
  now = () => new Date(),
} = {}) {
  let sweeping = false;

  async function setHold(approval, fields) {
    const $set = Object.fromEntries(Object.entries(fields).map(([key, value]) => [`hold.${key}`, value]));
    return ApprovalModel.findOneAndUpdate({ _id: approval._id }, { $set }, { new: true }).lean();
  }

  async function place(approval) {
    const resolved = await links.resolve(approval.items);
    if (resolved.missing.length) {
      logger.warn('medicalka hold skipped: product not linked', {
        approval: approval.externalId, missing: resolved.missing,
      });
      return setHold(approval, {
        state: 'unmapped', missingProductIds: resolved.missing, lastError: 'medicalka_product_mapping_missing',
      });
    }
    let internalOrderId = '';
    try {
      const { order } = await orderService.acceptOrder('medicalka', {
        externalId: `approval:${approval.externalId}`,
        items: resolved.items,
        totalAmount: approval.subtotal,
        customer: {
          name: [approval.customer?.firstName, approval.customer?.lastName].filter(Boolean).join(' '),
          phone: approval.customer?.phone || '',
          address: '',
        },
        raw: null,
      });
      internalOrderId = order.internalOrderId;
      await setHold(approval, { channelOrderId: internalOrderId });
      await orderService.reserveOrder(internalOrderId);
      logger.info('medicalka hold reserved', { approval: approval.externalId, internalOrderId });
      return setHold(approval, { state: 'reserved', placedAt: now(), lastError: '' });
    } catch (err) {
      const order = internalOrderId ? await OrderModel.findOne({ internalOrderId }).lean() : null;
      const uncertain = Boolean(order?.billz?.reconciliationRequired);
      logger.warn('medicalka hold failed', { approval: approval.externalId, internalOrderId, uncertain, err });
      // A reservation that never reached Billz leaves an empty order behind;
      // closing it keeps the panel's order list honest. The sale still happens
      // at payment, on a fresh order.
      if (order && !uncertain) await orderService.cancelOrder(internalOrderId, { reason: 'reservation failed' }).catch(() => {});
      return setHold(approval, { state: uncertain ? 'uncertain' : 'failed', lastError: code(err, 'medicalka_hold_failed') });
    }
  }

  async function release(approval, reason) {
    const internalOrderId = approval.hold.channelOrderId;
    try {
      await orderService.cancelOrder(internalOrderId, { reason });
      logger.info('medicalka hold released', { approval: approval.externalId, internalOrderId, reason });
      return setHold(approval, { state: 'released', lastError: '' });
    } catch (err) {
      const order = await OrderModel.findOne({ internalOrderId }).lean();
      if (order?.status === 'sold') return setHold(approval, { state: 'sold', lastError: '' });
      if (order?.status === 'cancelled') return setHold(approval, { state: 'released', lastError: '' });
      logger.warn('medicalka hold release failed', { approval: approval.externalId, internalOrderId, err });
      // Still reserved: the next sweep tries again unless Billz needs a person.
      return setHold(approval, {
        ...(order?.billz?.reconciliationRequired ? { state: 'uncertain' } : {}),
        lastError: code(err, 'medicalka_hold_release_failed'),
      });
    }
  }

  async function maintain(approval) {
    const order = await OrderModel.findOne({ internalOrderId: approval.hold.channelOrderId }).lean();
    if (!order) return setHold(approval, { state: 'failed', lastError: 'medicalka_hold_order_missing' });
    if (order.status === 'sold') return setHold(approval, { state: 'sold', lastError: '' });
    if (order.status === 'cancelled') return setHold(approval, { state: 'released', lastError: '' });
    if (order.status !== 'reserved') return approval;
    const age = now().getTime() - new Date(approval.hold.placedAt || 0).getTime();
    if (!approval.orderId) {
      if (approval.status !== 'accepted' || CLOSED.has(approval.checkoutStatus)) {
        return release(approval, 'Medicalka checkout closed unpaid');
      }
      return age >= ttlMs ? release(approval, 'Medicalka checkout not paid in time') : approval;
    }
    const soldApart = await SubOrderModel.exists({
      orderId: approval.orderId,
      pharmacyId: approval.pharmacyId,
      'sale.state': 'sold',
      'sale.channelOrderId': { $ne: order.internalOrderId },
    });
    if (soldApart) return release(approval, 'Medicalka order sold without this reservation');
    return age >= ORDERED_TTL_MS ? release(approval, 'Medicalka order not paid in time') : approval;
  }

  // A placement interrupted by a restart: settle it from the order it left.
  async function recover(approval) {
    const internalOrderId = approval.hold.channelOrderId;
    const order = internalOrderId ? await OrderModel.findOne({ internalOrderId }).lean() : null;
    if (order?.status === 'reserved') return setHold(approval, { state: 'reserved', placedAt: approval.hold.startedAt, lastError: '' });
    if (order?.billz?.reconciliationRequired) return setHold(approval, { state: 'uncertain', lastError: 'medicalka_hold_interrupted' });
    if (order && order.status !== 'cancelled') await orderService.cancelOrder(internalOrderId, { reason: 'reservation interrupted' }).catch(() => {});
    return setHold(approval, { state: 'failed', lastError: 'medicalka_hold_interrupted' });
  }

  async function sweepOnce() {
    if (sweeping || !writesEnabled()) return { skipped: true };
    sweeping = true;
    try {
      const at = now();
      const stale = await ApprovalModel.find({
        'hold.state': 'placing', 'hold.startedAt': { $lte: new Date(at.getTime() - PLACING_LEASE_MS) },
      }).lean();
      for (const row of stale) await recover(row);

      let placed = 0;
      if (placingEnabled()) {
        const due = await ApprovalModel.find({
          status: 'accepted',
          orderId: '',
          'hold.state': { $in: [null, ''] },
          sourceCreatedAt: { $gte: new Date(at.getTime() - ttlMs) },
        }).lean();
        for (const row of due) {
          const claimed = await ApprovalModel.findOneAndUpdate(
            { _id: row._id, 'hold.state': { $in: [null, ''] } },
            { $set: { 'hold.state': 'placing', 'hold.startedAt': now() } },
            { new: true }
          ).lean();
          if (claimed) { await place(claimed); placed += 1; }
        }
      }

      const held = await ApprovalModel.find({ 'hold.state': 'reserved' }).lean();
      for (const row of held) {
        try { await maintain(row); } catch (err) {
          logger.warn('medicalka hold check failed', { approval: row.externalId, err });
        }
      }
      return { placed, held: held.length };
    } finally {
      sweeping = false;
    }
  }

  /**
   * Hands a paid sub-order the reservation its approval took. Returns
   * 'adopted' once the reserved order carries `externalId`, so the sale path
   * finds and completes it; 'wait' while the approval that may hold it is still
   * being linked; 'none' when the sale has to start from a fresh order.
   */
  async function adopt(subOrder, items, externalId) {
    if (!subOrder.orderId) return 'none';
    const waited = now().getTime() - new Date(subOrder.firstSeenAt || 0).getTime();
    const approval = await ApprovalModel.findOne({
      orderId: subOrder.orderId, pharmacyId: subOrder.pharmacyId, 'hold.state': { $in: LIVE },
    }).lean();
    if (!approval) {
      const unlinked = await ApprovalModel.exists({
        pharmacyId: subOrder.pharmacyId,
        orderId: '',
        'hold.state': { $in: LIVE },
        sourceCreatedAt: { $gte: new Date(now().getTime() - ttlMs) },
      });
      return unlinked && waited < LINK_WAIT_MS ? 'wait' : 'none';
    }
    if (approval.hold.state === 'placing') return waited < LINK_WAIT_MS ? 'wait' : 'none';

    const order = await OrderModel.findOne({ internalOrderId: approval.hold.channelOrderId }).lean();
    if (order?.status !== 'reserved') return 'none';
    if (!sameLines(order.items, items)) {
      await release(approval, 'paid Medicalka order differs from the accepted one');
      return 'none';
    }
    if (order.externalId === externalId) return 'adopted';
    try {
      const moved = await OrderModel.updateOne(
        { internalOrderId: order.internalOrderId, status: 'reserved', externalId: order.externalId },
        { $set: { externalId } }
      );
      if (moved.matchedCount === 1) {
        logger.info('medicalka hold adopted by paid order', { approval: approval.externalId, internalOrderId: order.internalOrderId });
        return 'adopted';
      }
      return 'none';
    } catch (err) {
      // The paid order already has its own record (legacy callback): sell that
      // one and give the reservation back.
      if (err?.code !== 11000) throw err;
      await release(approval, 'paid Medicalka order already recorded');
      return 'none';
    }
  }

  return { adopt, sweepOnce };
}

module.exports = { createHoldService, sameLines };
