const config = require('../config');
const logger = require('../logger');
const orders = require('./orders');
const { reconcileCounters } = require('./counters');
const ChannelOrder = require('../models/ChannelOrder');

/**
 * Fairhaven's own bot and mini app, treated as a sales channel.
 *
 * The bot backend and this service are separate processes with a deliberate
 * one-way boundary: the backend owns `orders`, this service owns `billzproducts`
 * and `channelorders`, and neither writes the other's collections. That leaves a
 * question — how does a status change in the backend become a reservation in
 * Billz?
 *
 * The answer is a **state goal, not an event**. The backend does not send "the
 * operator pressed confirm"; it sends "this order should end up reserved", and
 * this module walks whatever distance is left. That choice buys three things
 * that an event stream does not:
 *
 *   - **Lost messages self-heal.** The backend re-sends the goal until we
 *     acknowledge it, and re-sending a goal already met is a no-op. An event
 *     that is delivered twice books two sales; a goal delivered twice books one.
 *   - **Skipped steps cannot corrupt state.** An order that jumps from pending
 *     straight to delivered still gets reserved before it is sold, because the
 *     walk fills in the missing step rather than failing on it.
 *   - **Order of arrival stops mattering.** A goal that arrives late and asks
 *     for less than the order has already reached is refused as a conflict, not
 *     applied backwards.
 *
 * Nothing here trusts the caller's prices or quantities beyond recording them:
 * the backend has already charged the customer, and Billz must record what was
 * actually charged, so these are the figures from the customer's own receipt.
 */

const CHANNEL = config.bot.channel;

/** What each goal means, and which states already satisfy it. */
const GOALS = {
  hold: { satisfiedBy: ['received', 'reserved', 'sold', 'cancelled'] },
  reserve: { satisfiedBy: ['reserved', 'sold'] },
  sell: { satisfiedBy: ['sold'] },
  cancel: { satisfiedBy: ['cancelled'] },
};

/**
 * States a goal can no longer be reached from. Reported to the backend as a
 * conflict so it stops retrying and an operator is told, rather than a failure
 * the queue grinds on forever.
 */
function conflictFor(goal, status) {
  if (goal === 'cancel' && status === 'sold') {
    return 'already_sold — a delivered order is returned, not cancelled';
  }
  if ((goal === 'reserve' || goal === 'sell') && status === 'cancelled') {
    return 'already_cancelled — reopen the order to sell it';
  }
  return null;
}

/** Lines the backend could not link to Billz carry no product id. */
function sellableLines(items) {
  return (Array.isArray(items) ? items : []).filter(
    (i) => i && typeof i.billzProductId === 'string' && i.billzProductId.trim() !== ''
  );
}

/**
 * Brings one bot order to the requested state, creating the record if this is
 * the first we have heard of it.
 *
 * Returns `{ status, applied, conflict }`. `applied: false` with no conflict
 * means the goal was already met — the normal outcome of a retry.
 */
async function ensureState({ externalId, target, items, totalAmount, customer, raw }) {
  const goal = GOALS[target];
  if (!goal) throw new Error(`unknown goal "${target}"`);

  const lines = sellableLines(items);

  // An order made entirely of hand-managed products has no Billz counterpart to
  // move. Recording it and reporting done is right: retrying cannot make a link
  // appear, and the customer's order is unaffected either way.
  if (!lines.length) {
    logger.info('bot order has no billz-linked lines, nothing to write', { externalId });
    return { status: 'not_applicable', applied: false, conflict: null };
  }

  const { order } = await orders.acceptOrder(CHANNEL, {
    externalId,
    items: lines,
    totalAmount,
    customer,
    raw,
  });

  const conflict = conflictFor(target, order.status);
  if (conflict) {
    logger.warn('bot order goal conflicts with its current state', {
      externalId, target, status: order.status,
    });
    return { status: order.status, applied: false, conflict };
  }

  if (goal.satisfiedBy.includes(order.status)) {
    // `hold` is satisfied by `received` only once the hold is actually taken;
    // everything past `received` has a stronger hold or none by design.
    if (target === 'hold' && order.status === 'received' && !order.billz.pendingApplied) {
      const held = await orders.holdOrder(order.internalOrderId);
      return { status: held.status, applied: true, conflict: null };
    }
    return { status: order.status, applied: false, conflict: null };
  }

  const walked = await walk(order.internalOrderId, target);
  return { status: walked.status, applied: true, conflict: null };
}

/**
 * Applies the missing steps, in order.
 *
 * Selling walks through reservation rather than skipping it: Billz decrements
 * stock at payment, and a payment against a draft that was never postponed is a
 * different document than the one the reservation created. Going through the
 * same path every time means one code path is exercised, not two.
 */
async function walk(internalOrderId, target) {
  if (target === 'cancel') {
    return orders.cancelOrder(internalOrderId, { reason: 'cancelled in the bot' });
  }

  if (target === 'hold') {
    return orders.holdOrder(internalOrderId);
  }

  const reserved = await orders.reserveOrder(internalOrderId);
  if (target === 'reserve') return reserved;

  return orders.completeOrder(internalOrderId);
}

/**
 * Releases local holds that have outlived their window.
 *
 * A bot order nobody confirms or rejects would otherwise keep its units out of
 * every marketplace indefinitely. Releasing the hold does not close the order —
 * confirming it afterwards still reserves, it simply competes for stock like any
 * new order would.
 */
async function sweepExpiredHolds({ now = new Date() } = {}) {
  const expired = await ChannelOrder()
    .find({
      channel: CHANNEL,
      status: 'received',
      'billz.pendingApplied': true,
      holdExpiresAt: { $ne: null, $lte: now },
    })
    .limit(500);

  let released = 0;
  for (const order of expired) {
    try {
      if (await orders.releaseHold(order)) {
        await order.save();
        released += 1;
      }
    } catch (err) {
      logger.error('could not release an expired hold', {
        internalOrderId: order.internalOrderId, err,
      });
    }
  }

  if (released) logger.info('expired holds released', { released });
  return { released, examined: expired.length };
}

/**
 * Runs the sweeper on a timer. Returns the handle so shutdown can clear it.
 *
 * The counter repair rides along at a tenth of the rate: it is a safety net for
 * a lifecycle that is written not to need one, and running it often would blur
 * the line between the two.
 */
function startHoldSweeper() {
  let tick = 0;
  const timer = setInterval(() => {
    sweepExpiredHolds().catch((err) => logger.error('hold sweep failed', { err }));

    tick += 1;
    if (tick % 10 === 0) {
      reconcileCounters().catch((err) => logger.error('counter reconcile failed', { err }));
    }
  }, config.bot.holdSweepMs);
  timer.unref?.();
  return timer;
}

module.exports = {
  CHANNEL,
  GOALS,
  ensureState,
  startHoldSweeper,
  sweepExpiredHolds,
};
