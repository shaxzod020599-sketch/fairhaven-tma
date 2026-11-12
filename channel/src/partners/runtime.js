const config = require('../config');
const logger = require('../logger');
const coreOrders = require('../core/orders');
const ChannelOrder = require('../models/ChannelOrder');
const PartnerOrder = require('../models/PartnerOrder');
const registry = require('./registry');
const partnerOrders = require('./orders');
const webhooks = require('./webhooks');
const { createPartnerNotifier } = require('./telegram');

/**
 * Background work for the Partner API, one loop:
 *   - decide orders whose window has passed: test orders by their requested
 *     outcome, live orders are rejected with reason "timeout";
 *   - release local holds left by a request that died between recording the
 *     ledger entry and the partner order (the partner never got an answer, so
 *     no one else will);
 *   - post and update operator cards;
 *   - deliver webhooks.
 */

async function decideExpired() {
  const due = await PartnerOrder().find({
    status: 'new',
    deadlineAt: { $lte: new Date() },
    $or: [{ 'lock.op': '' }, { 'lock.op': null }],
  }).sort({ deadlineAt: 1 }).limit(20).lean();

  for (const order of due) {
    const partner = registry.get(order.partnerCode);
    const filter = { _id: order._id };
    try {
      if (order.test && order.testOutcome !== 'reject') {
        await partnerOrders.accept(partner, filter, { by: 'test' });
      } else {
        await partnerOrders.reject(partner, filter, {
          by: order.test ? 'test' : 'system',
          reason: order.test ? 'rejected_by_shop' : 'timeout',
        });
      }
    } catch (err) {
      logger.warn('partner order timeout handling failed', { number: order.number, err });
    }
  }
  return due.length;
}

async function releaseOrphanHolds() {
  const orphans = await ChannelOrder().find({
    channel: /^partner:/,
    status: 'received',
    holdExpiresAt: { $ne: null, $lte: new Date() },
  }).limit(20).lean();
  for (const ledger of orphans) {
    const linked = await PartnerOrder().exists({ channelOrderId: ledger.internalOrderId, status: 'new' });
    if (linked) continue;
    try {
      await coreOrders.cancelOrder(ledger.internalOrderId, { reason: 'partner order never recorded' });
      logger.info('orphan partner hold released', { internalOrderId: ledger.internalOrderId });
    } catch (err) {
      logger.warn('orphan partner hold release failed', { internalOrderId: ledger.internalOrderId, err });
    }
  }
}

function start() {
  if (!config.partners.enabled) return null;
  const notifier = createPartnerNotifier();
  let running = false;

  async function tick() {
    if (running) return;
    running = true;
    try {
      await decideExpired();
      await releaseOrphanHolds();
      await notifier.drain();
      await webhooks.drain();
    } catch (err) {
      logger.warn('partner sweep failed', { err });
    } finally {
      running = false;
    }
  }

  registry.load()
    .then((count) => logger.info('partner registry loaded', { partners: count }))
    .catch((err) => logger.warn('partner registry load failed', { err }));
  const refreshTimer = registry.startRefresh();
  const timer = setInterval(tick, config.partners.sweepMs);
  timer.unref?.();
  return {
    stop() {
      clearInterval(timer);
      clearInterval(refreshTimer);
    },
    tick,
  };
}

module.exports = { start, decideExpired, releaseOrphanHolds };
