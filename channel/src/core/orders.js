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
// Long enough for the normal queued write sequence; expiry fences the owner
// into reconciliation rather than allowing another worker to take over.
const BILLZ_OPERATION_STALE_MS = 5 * 60 * 1000;
const INCOMING_SALE_OBSERVE_MS = 30 * 1000;
const INCOMING_SALE_POLL_MS = 250;

class BillzOperationError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'BillzOperationError';
    this.code = code;
  }
}

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
    ...(channel === 'uzum' ? { uzum: { version: 1, revision: 1, notification: { pending: true } } } : {}),
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

function operationError(internalOrderId, code) {
  const detail = {
    BILLZ_OPERATION_IN_PROGRESS: 'already has a Billz operation in progress',
    BILLZ_OPERATION_OWNERSHIP_LOST: 'lost ownership of its Billz operation',
    BILLZ_RECONCILIATION_REQUIRED: 'requires Billz reconciliation before another operation',
  }[code];
  return new BillzOperationError(`order ${internalOrderId} ${detail}`, code);
}

function clearedOperationFields() {
  return {
    'billz.operationAction': '',
    'billz.operationToken': '',
    'billz.operationStartedAt': null,
    'billz.reconciliationRequired': false,
  };
}

async function claimBillzOperation(internalOrderId, action, allowedStatuses) {
  const Model = ChannelOrder();
  const token = crypto.randomUUID();
  const startedAt = new Date();
  const nonFailedStatuses = allowedStatuses.filter((status) => status !== 'failed');
  const claimableStatuses = [
    ...(nonFailedStatuses.length ? [{ status: { $in: nonFailedStatuses } }] : []),
    ...(allowedStatuses.includes('failed')
      ? [{ status: 'failed', 'billz.failureDisposition': 'retry_safe' }]
      : []),
  ];
  const order = await Model.findOneAndUpdate(
    {
      internalOrderId,
      'billz.reconciliationRequired': { $ne: true },
      $and: [
        {
          $or: claimableStatuses,
        },
        {
          $or: [
            { 'billz.operationToken': '' },
            { 'billz.operationToken': null },
            { 'billz.operationToken': { $exists: false } },
          ],
        },
      ],
    },
    {
      $set: {
        'billz.operationAction': action,
        'billz.operationToken': token,
        'billz.operationStartedAt': startedAt,
        'billz.reconciliationRequired': false,
        'billz.failureDisposition': '',
        'billz.lastTriedAt': startedAt,
      },
      $inc: { 'billz.attempts': 1 },
    },
    { new: true }
  );
  if (order) return { order, token };

  const current = await Model.findOne({ internalOrderId });
  if (!current) throw new Error(`unknown order ${internalOrderId}`);

  if (current.billz.reconciliationRequired) {
    if (current.status === 'failed' && current.billz.failureDisposition !== 'retry_safe') {
      await Model.updateOne(
        {
          _id: current._id,
          status: 'failed',
          'billz.failureDisposition': { $ne: 'retry_safe' },
        },
        { $set: { 'billz.failureDisposition': 'reconciliation_required' } }
      );
    }
    throw operationError(internalOrderId, 'BILLZ_RECONCILIATION_REQUIRED');
  }

  if (current.billz.operationToken) {
    const started = current.billz.operationStartedAt?.getTime();
    const stale = !started || Date.now() - started >= BILLZ_OPERATION_STALE_MS;
    if (stale) {
      const marked = await Model.findOneAndUpdate(
        {
          _id: current._id,
          'billz.operationToken': current.billz.operationToken,
          'billz.operationStartedAt': current.billz.operationStartedAt,
          'billz.reconciliationRequired': { $ne: true },
        },
        {
          $set: {
            status: 'failed',
            'billz.reconciliationRequired': true,
            'billz.failureDisposition': 'reconciliation_required',
            'billz.lastError': `stale ${current.billz.operationAction || 'Billz'} operation`,
          },
        },
        { new: true }
      );
      if (marked) {
        throw operationError(internalOrderId, 'BILLZ_RECONCILIATION_REQUIRED');
      }
      const fresh = await Model.findOne({ internalOrderId });
      if (fresh?.billz.reconciliationRequired) {
        throw operationError(internalOrderId, 'BILLZ_RECONCILIATION_REQUIRED');
      }
      if (fresh?.billz.operationToken) {
        throw operationError(internalOrderId, 'BILLZ_OPERATION_IN_PROGRESS');
      }
      return { order: fresh, token: '' };
    }
    throw operationError(internalOrderId, 'BILLZ_OPERATION_IN_PROGRESS');
  }

  // Before this disposition existed, `failed` said nothing about whether
  // Billz rejected the request or might already have applied it. Only records
  // with no active owner are legacy-classified here; an active safe retry has
  // already cleared its old disposition and must remain merely in progress.
  if (current.status === 'failed' && current.billz.failureDisposition !== 'retry_safe') {
    const marked = await Model.findOneAndUpdate(
      {
        _id: current._id,
        status: 'failed',
        'billz.failureDisposition': { $ne: 'retry_safe' },
        'billz.reconciliationRequired': { $ne: true },
        $or: [
          { 'billz.operationToken': '' },
          { 'billz.operationToken': null },
          { 'billz.operationToken': { $exists: false } },
        ],
      },
      {
        $set: {
          'billz.reconciliationRequired': true,
          'billz.failureDisposition': 'reconciliation_required',
        },
      },
      { new: true }
    );
    if (marked) throw operationError(internalOrderId, 'BILLZ_RECONCILIATION_REQUIRED');

    const fresh = await Model.findOne({ internalOrderId });
    if (fresh?.billz.reconciliationRequired) {
      throw operationError(internalOrderId, 'BILLZ_RECONCILIATION_REQUIRED');
    }
    if (fresh?.billz.operationToken) {
      throw operationError(internalOrderId, 'BILLZ_OPERATION_IN_PROGRESS');
    }
    return { order: fresh, token: '' };
  }

  return { order: current, token: '' };
}

async function persistBillzOperation(order, token, fields) {
  const updated = await ChannelOrder().findOneAndUpdate(
    {
      _id: order._id,
      'billz.operationToken': token,
      'billz.reconciliationRequired': { $ne: true },
    },
    { $set: fields },
    { new: true }
  );
  if (!updated) {
    throw operationError(order.internalOrderId, 'BILLZ_OPERATION_OWNERSHIP_LOST');
  }
  return updated;
}

async function checkpointBillzDraft(order, token, { orderId, orderNumber }) {
  const updated = await ChannelOrder().findOneAndUpdate(
    {
      _id: order._id,
      'billz.operationToken': token,
    },
    {
      $set: {
        'billz.draftOrderId': orderId,
        'billz.orderNumber': orderNumber || '',
      },
    },
    { new: true }
  );
  if (!updated) {
    throw operationError(order.internalOrderId, 'BILLZ_OPERATION_OWNERSHIP_LOST');
  }
  return updated;
}

async function refreshBillzOperationLease(order, token) {
  const refreshed = await ChannelOrder().findOneAndUpdate(
    {
      _id: order._id,
      'billz.operationToken': token,
      'billz.reconciliationRequired': { $ne: true },
    },
    { $set: { 'billz.operationStartedAt': new Date() } },
    { new: true }
  );
  if (!refreshed) {
    throw operationError(order.internalOrderId, 'BILLZ_OPERATION_OWNERSHIP_LOST');
  }
}

function isSafePreEffectFailure(err) {
  return err?.outcomeUnknown === false && err?.retrySafe === true;
}

/**
 * Holds stock in Billz for an accepted order.
 *
 * Safe to call again after an explicit pre-effect failure. Unknown or partial
 * Billz outcomes remain fenced for reconciliation.
 */
async function reserveOrder(internalOrderId) {
  const lease = await claimBillzOperation(internalOrderId, 'reserve', ['received', 'failed']);
  if (!lease.token) {
    if (lease.order.status === 'reserved') return lease.order.toObject();
    if (['sold', 'cancelled'].includes(lease.order.status)) {
      throw new Error(`order ${internalOrderId} is already ${lease.order.status}`);
    }
    throw new Error(`order ${internalOrderId} cannot be reserved from ${lease.order.status}`);
  }

  const { order, token } = lease;
  let draftOrderId = order.billz.draftOrderId;
  let orderNumber = order.billz.orderNumber;
  let reservationApplied = order.billz.reservationApplied;
  let pendingApplied = order.billz.pendingApplied;
  let holdExpiresAt = order.holdExpiresAt;

  try {
    if (draftOrderId) {
      await persistBillzOperation(order, token, {
        status: 'failed',
        'billz.reconciliationRequired': true,
        'billz.failureDisposition': 'reconciliation_required',
        'billz.lastError': 'an existing Billz draft requires reconciliation',
      });
      throw operationError(internalOrderId, 'BILLZ_RECONCILIATION_REQUIRED');
    }

    const result = await sale.reserveOrder({
      items: order.items.map((i) => ({
        billzProductId: i.billzProductId,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
      })),
      comment: `${order.channel} ${order.externalId}`,
      onProgress: async (progress) => {
        if (progress.stage === 'draft_created') {
          draftOrderId = progress.orderId;
          orderNumber = progress.orderNumber;
          await checkpointBillzDraft(order, token, progress);
        }
        await refreshBillzOperationLease(order, token);
      },
    });
    draftOrderId = result.orderId;
    orderNumber = result.orderNumber;
    await refreshBillzOperationLease(order, token);

    // Counter first, then status: a crash between the two leaves units
    // reserved with the order still marked for retry, which an operator can
    // see and correct. The reverse order would silently under-reserve.
    if (!reservationApplied) {
      await applyReservedQty(order.items, +1);
      reservationApplied = true;
    }
    // Set with no `await` between it and the counter it describes. Anything in
    // between — including the hold release below — could throw, and the failure
    // path saves the order: a saved order whose flag says it holds nothing
    // while the counter says otherwise leaks those units permanently, because
    // the cancellation path trusts the flag.
    // Billz is now holding the same units, so the local hold has to go — the
    // two counters are both subtracted from sellable stock, and keeping both
    // would take twice the inventory off sale. Released after the reservation
    // rather than before, so no window exists where nothing is holding.
    if (pendingApplied) {
      await applyPendingQty(order.items, -1);
      pendingApplied = false;
      holdExpiresAt = null;
    }

    const stored = await persistBillzOperation(order, token, {
      status: 'reserved',
      holdExpiresAt,
      'billz.draftOrderId': draftOrderId,
      'billz.orderNumber': orderNumber,
      'billz.reservationApplied': reservationApplied,
      'billz.pendingApplied': pendingApplied,
      'billz.lastError': '',
      'billz.failureDisposition': '',
      ...clearedOperationFields(),
    });

    logger.info('channel order reserved', {
      internalOrderId, channel: order.channel, billzOrderId: draftOrderId,
    });
    return stored.toObject();
  } catch (err) {
    if (err.code === 'BILLZ_OPERATION_OWNERSHIP_LOST'
      || err.code === 'BILLZ_RECONCILIATION_REQUIRED') throw err;
    if (err.billzOrderId) draftOrderId = err.billzOrderId;
    const reconciliationRequired = err.outcomeUnknown === true
      || Boolean(draftOrderId)
      || !isSafePreEffectFailure(err);
    await persistBillzOperation(order, token, {
      status: 'failed',
      holdExpiresAt,
      'billz.draftOrderId': draftOrderId || '',
      'billz.orderNumber': orderNumber || '',
      'billz.reservationApplied': reservationApplied,
      'billz.pendingApplied': pendingApplied,
      'billz.lastError': err.message,
      'billz.reconciliationRequired': reconciliationRequired,
      'billz.failureDisposition': reconciliationRequired
        ? 'reconciliation_required'
        : 'retry_safe',
      ...(reconciliationRequired ? {} : clearedOperationFields()),
    });
    logger.error('channel order reservation failed', { internalOrderId, err });
    throw err;
  }
}

/**
 * Completes the sale. Billz decrements stock at this point, so the reservation
 * is handed back at the same time — leaving it would double-count the units.
 */
async function completeOrder(internalOrderId, { paymentTypeId } = {}) {
  const lease = await claimBillzOperation(internalOrderId, 'complete', ['reserved']);
  if (!lease.token) {
    if (lease.order.status === 'sold') return lease.order.toObject();
    throw new Error(`order ${internalOrderId} must be reserved before it can be sold`);
  }

  const { order, token } = lease;
  const typeId = paymentTypeId || config.billz.paymentTypeId;
  let reservationApplied = order.billz.reservationApplied;
  let pendingApplied = order.billz.pendingApplied;
  let holdExpiresAt = order.holdExpiresAt;
  let paymentCompleted = false;
  let soldAt = order.soldAt;

  try {
    await sale.completeSale(order.billz.draftOrderId, {
      paymentTypeId: typeId,
      paymentTypeName: config.billz.paymentTypeName,
      amount: order.totalAmount,
      // Every channel sale lands on the same payment type, so this comment is
      // what tells them apart in Billz — which order, from which marketplace.
      comment: `${order.channel} ${order.externalId}`,
    });
    paymentCompleted = true;
    if (order.channel === 'uzum') soldAt = new Date();
    await refreshBillzOperationLease(order, token);

    if (reservationApplied) {
      if (order.channel === 'uzum') {
        await require('../uzum/stock').transferSoldHold(order, soldAt);
      } else {
        await applyReservedQty(order.items, -1);
      }
      reservationApplied = false;
    }
    // Normally already gone — reserving releases it. Kept as a belt-and-braces
    // release so a hold can never outlive the order that took it.
    if (pendingApplied) {
      await applyPendingQty(order.items, -1);
      pendingApplied = false;
      holdExpiresAt = null;
    }
    const stored = await persistBillzOperation(order, token, {
      status: 'sold',
      soldAt: order.channel === 'uzum' ? soldAt : order.soldAt || new Date(),
      soldAtEstimated: false,
      holdExpiresAt,
      'billz.reservationApplied': reservationApplied,
      'billz.pendingApplied': pendingApplied,
      'billz.lastError': '',
      'billz.failureDisposition': '',
      ...clearedOperationFields(),
    });

    logger.info('channel order sold', { internalOrderId, channel: order.channel });
    return stored.toObject();
  } catch (err) {
    if (err.code === 'BILLZ_OPERATION_OWNERSHIP_LOST') throw err;
    const retrySafe = !paymentCompleted && isSafePreEffectFailure(err);
    await persistBillzOperation(order, token, {
      status: retrySafe ? 'reserved' : 'failed',
      holdExpiresAt,
      'billz.reservationApplied': reservationApplied,
      'billz.pendingApplied': pendingApplied,
      'billz.lastError': err.message,
      'billz.reconciliationRequired': !retrySafe,
      'billz.failureDisposition': retrySafe ? 'retry_safe' : 'reconciliation_required',
      ...(retrySafe ? clearedOperationFields() : {}),
    });
    logger.error('channel order sale failed', { internalOrderId, err });
    throw err;
  }
}

function incomingSaleOutcome(kind, order) {
  return {
    kind,
    order: order?.toObject ? order.toObject() : order,
  };
}

async function observeIncomingSale(
  internalOrderId,
  { observeTimeoutMs = INCOMING_SALE_OBSERVE_MS, observePollMs = INCOMING_SALE_POLL_MS } = {}
) {
  const deadline = Date.now() + observeTimeoutMs;

  while (true) {
    const order = await ChannelOrder().findOne({ internalOrderId }).lean();
    if (!order) throw new Error(`unknown order ${internalOrderId}`);
    if (order.status === 'sold') return incomingSaleOutcome('sold', order);
    if (order.billz.reconciliationRequired || order.status === 'cancelled') {
      return incomingSaleOutcome('temporary_failure', order);
    }

    const operationFinished = !order.billz.operationToken;
    const failedReservation = operationFinished && order.status === 'failed';
    const failedPayment = operationFinished
      && order.status === 'reserved'
      && Boolean(order.billz.lastError);
    if (failedReservation || failedPayment) {
      return incomingSaleOutcome('upstream_failure', order);
    }
    if (Date.now() >= deadline) return incomingSaleOutcome('temporary_failure', order);

    await new Promise((resolve) => setTimeout(resolve, observePollMs));
  }
}

async function classifyIncomingSaleFailure(internalOrderId, err, options) {
  if (err.code === 'BILLZ_OPERATION_IN_PROGRESS') {
    return observeIncomingSale(internalOrderId, options);
  }

  const order = await ChannelOrder().findOne({ internalOrderId }).lean();
  if (!order) throw new Error(`unknown order ${internalOrderId}`);
  if (order.status === 'sold') return incomingSaleOutcome('sold', order);
  if (order.billz.reconciliationRequired
    || err.code === 'BILLZ_RECONCILIATION_REQUIRED'
    || err.code === 'BILLZ_OPERATION_OWNERSHIP_LOST') {
    return incomingSaleOutcome('temporary_failure', order);
  }
  return incomingSaleOutcome('upstream_failure', order);
}

/**
 * Converts an incoming marketplace order into a stored sale before acceptance.
 *
 * Billz writes stay inside reserveOrder/completeOrder so their atomic operation
 * leases remain the sole ownership guard. A caller that loses that race becomes
 * an observer: it waits for the winner's stored result and never takes over the
 * external write itself.
 */
async function completeIncomingSale(internalOrderId, options = {}) {
  let order = await ChannelOrder().findOne({ internalOrderId }).lean();
  if (!order) throw new Error(`unknown order ${internalOrderId}`);
  if (order.status === 'sold') return incomingSaleOutcome('sold', order);
  if (order.billz.reconciliationRequired) {
    return incomingSaleOutcome('temporary_failure', order);
  }
  if (!config.billzWriteEnabled) {
    return incomingSaleOutcome('temporary_failure', order);
  }

  try {
    if (['received', 'failed'].includes(order.status)) {
      order = await reserveOrder(internalOrderId);
    }
  } catch (err) {
    return classifyIncomingSaleFailure(internalOrderId, err, options);
  }

  if (order.status === 'sold') return incomingSaleOutcome('sold', order);
  if (order.billz.reconciliationRequired) {
    return incomingSaleOutcome('temporary_failure', order);
  }
  if (order.status !== 'reserved') return incomingSaleOutcome('upstream_failure', order);

  try {
    await completeOrder(internalOrderId);
  } catch (err) {
    return classifyIncomingSaleFailure(internalOrderId, err, options);
  }

  order = await ChannelOrder().findOne({ internalOrderId }).lean();
  if (order.status === 'sold') return incomingSaleOutcome('sold', order);
  if (order.billz.reconciliationRequired) {
    return incomingSaleOutcome('temporary_failure', order);
  }
  return incomingSaleOutcome('upstream_failure', order);
}

/**
 * Cancels an order and returns any held stock.
 *
 * An order cancelled before it reached Billz simply changes status. One that
 * already sold cannot be cancelled here — that is a return, which is a
 * different operation with different accounting.
 */
async function cancelOrder(internalOrderId, { reason = '' } = {}) {
  const lease = await claimBillzOperation(
    internalOrderId, 'cancel', ['received', 'reserved', 'failed']
  );
  if (!lease.token) {
    if (lease.order.status === 'cancelled') return lease.order.toObject();
    if (lease.order.status === 'sold') {
      throw new Error(`order ${internalOrderId} is already sold — a return is not a cancellation`);
    }
    throw new Error(`order ${internalOrderId} cannot be cancelled from ${lease.order.status}`);
  }

  const { order, token } = lease;
  let reservationApplied = order.billz.reservationApplied;
  let pendingApplied = order.billz.pendingApplied;
  let holdExpiresAt = order.holdExpiresAt;
  let reservationReleased = false;
  let lastError = order.billz.lastError;

  try {
    if (order.billz.draftOrderId) {
      try {
        await sale.releaseReservation(order.billz.draftOrderId);
        reservationReleased = true;
      } catch (err) {
        // Uzum CANCELLED means the reservation was actually cleaned up.
        // Even a retry-safe refusal is not a successful cancellation.
        if (order.channel === 'uzum') throw err;
        if (err.outcomeUnknown !== false || err.retrySafe !== true) throw err;
        logger.warn('could not release billz reservation', { internalOrderId, err });
        lastError = `release failed: ${err.message}`;
      }

      if (reservationReleased) {
        try {
          await sale.deleteDraft(order.billz.draftOrderId);
        } catch (err) {
          if (err.outcomeUnknown === true) throw err;
          logger.warn('released the reservation but could not remove the draft', {
            internalOrderId, billzOrderId: order.billz.draftOrderId, err,
          });
        }
      }
    }

    await refreshBillzOperationLease(order, token);
    if (reservationApplied) {
      await applyReservedQty(order.items, -1);
      reservationApplied = false;
    }
    if (pendingApplied) {
      await applyPendingQty(order.items, -1);
      pendingApplied = false;
      holdExpiresAt = null;
    }
    if (reason) lastError = lastError || `cancelled: ${reason}`;
    const stored = await persistBillzOperation(order, token, {
      status: 'cancelled',
      holdExpiresAt,
      'billz.reservationApplied': reservationApplied,
      'billz.pendingApplied': pendingApplied,
      'billz.lastError': lastError,
      'billz.failureDisposition': '',
      ...clearedOperationFields(),
    });

    logger.info('channel order cancelled', { internalOrderId, channel: order.channel, reason });
    return stored.toObject();
  } catch (err) {
    if (err.code === 'BILLZ_OPERATION_OWNERSHIP_LOST') throw err;
    const retrySafe = !reservationReleased
      && err.outcomeUnknown === false
      && err.retrySafe === true;
    await persistBillzOperation(order, token, {
      status: 'failed',
      holdExpiresAt,
      'billz.reservationApplied': reservationApplied,
      'billz.pendingApplied': pendingApplied,
      'billz.lastError': err.message,
      'billz.reconciliationRequired': !retrySafe,
      'billz.failureDisposition': retrySafe ? 'retry_safe' : 'reconciliation_required',
      ...(retrySafe ? clearedOperationFields() : {}),
    });
    logger.warn('channel order cancellation failed', { internalOrderId, err });
    throw err;
  }
}

module.exports = {
  BILLZ_OPERATION_STALE_MS,
  BillzOperationError,
  DEFAULT_HOLD_TTL_MS,
  acceptOrder,
  applyPendingQty,
  applyReservedQty,
  cancelOrder,
  completeIncomingSale,
  completeOrder,
  ensurePublicOrderId,
  holdOrder,
  releaseHold,
  reserveOrder,
};
