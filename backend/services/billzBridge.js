const Order = require('../models/Order');
const Product = require('../models/Product');

/**
 * Carries bot and mini-app orders into Billz.
 *
 * The bot backend and the channel hub are separate processes on purpose: Billz
 * traffic must not be able to slow the bot down, and the Billz key stays out of
 * this process entirely. That boundary is enforced in the database layer — the
 * hub may not write `orders`, and nothing here writes `billzproducts` — so the
 * two have to agree across a wire.
 *
 * **They agree on state, not on events.** This module never sends "the operator
 * pressed confirm". It sends "order 6f3a should end up reserved" and records the
 * answer. The difference decides how every failure behaves:
 *
 *   - A lost request is retried, and a goal applied twice is applied once,
 *     because the hub keys on the order id. An event delivered twice would
 *     book two sales.
 *   - A status that moved while the hub was unreachable is picked up on the
 *     next pass, because the goal is recomputed from the order rather than
 *     queued when the change happened. Nothing has to be replayed.
 *   - A missed call site is impossible. There are no call sites: the scan
 *     compares every recent order against its goal.
 *
 * Nothing runs until an operator switches the bridge on and names a start date.
 * Orders older than that date are never looked at, so turning it on cannot push
 * a year of history into Billz.
 */

// What each order status means for stock.
const GOAL_BY_STATUS = {
  pending: 'hold',
  confirmed: 'reserve',
  preparing: 'reserve',
  delivering: 'reserve',
  delivered: 'sell',
  cancelled: 'cancel',
};

const BATCH = 25;
const LEASE_MS = 60 * 1000;
const BASE_BACKOFF_MS = 30 * 1000;
const MAX_BACKOFF_MS = 15 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 25 * 1000;
const MAX_ERROR_CHARS = 400;

function settings() {
  const since = Date.parse(process.env.BILLZ_BRIDGE_SINCE || '');
  return {
    enabled: process.env.BILLZ_BRIDGE_ENABLED === 'true',
    baseUrl: (process.env.CHANNEL_HUB_URL || 'http://127.0.0.1:3100').replace(/\/+$/, ''),
    token: process.env.CHANNEL_INTERNAL_TOKEN || '',
    since: Number.isFinite(since) ? new Date(since) : null,
    intervalMs: Number(process.env.BILLZ_BRIDGE_INTERVAL_MS || 20000),
  };
}

/**
 * Why the bridge is not running, or null when it is.
 *
 * Reported rather than silently skipped: a bridge that is off because someone
 * forgot a variable looks exactly like a bridge with nothing to do.
 */
function disabledReason(cfg = settings()) {
  if (!cfg.enabled) return 'BILLZ_BRIDGE_ENABLED is not true';
  if (!cfg.token) return 'CHANNEL_INTERNAL_TOKEN is not set';
  if (!cfg.since) return 'BILLZ_BRIDGE_SINCE is not a valid date';
  return null;
}

function backoffFor(attempts) {
  return Math.min(BASE_BACKOFF_MS * 2 ** Math.max(0, attempts - 1), MAX_BACKOFF_MS);
}

/**
 * Finds orders whose goal has not been dispatched yet.
 *
 * One clause per status rather than a `$expr` comparison so the scan can use an
 * index — `$expr` against two fields of the same document cannot.
 */
function pendingFilter(since, now) {
  return {
    createdAt: { $gte: since },
    $or: Object.entries(GOAL_BY_STATUS).map(([status, goal]) => ({
      status,
      'billzSync.dispatched': { $ne: goal },
    })),
    // Kept out of the `$or` above so it applies to every branch rather than
    // becoming a fifth alternative.
    $and: [{
      $or: [
        { 'billzSync.nextAttemptAt': null },
        { 'billzSync.nextAttemptAt': { $lte: now } },
      ],
    }],
    // A conflict cannot be resolved by trying again.
    'billzSync.conflict': '',
  };
}

/**
 * Resolves order lines to Billz products.
 *
 * A line whose product was never linked to Billz is dropped rather than
 * blocking: hand-managed products are a deliberate part of the catalogue, and
 * an order mixing both should still reserve the half that exists.
 */
async function buildLines(order) {
  const ids = order.items.map((item) => item.productId).filter(Boolean);
  if (!ids.length) return [];

  const products = await Product.find({ _id: { $in: ids } })
    .select('_id billzProductId name')
    .lean();
  const byId = new Map(products.map((p) => [String(p._id), p]));

  return order.items
    .map((item) => {
      const product = byId.get(String(item.productId));
      if (!product?.billzProductId) return null;
      return {
        billzProductId: product.billzProductId,
        name: item.name || product.name || '',
        quantity: Number(item.quantity) || 0,
        unitPrice: Number(item.price) || 0,
      };
    })
    .filter((line) => line && line.quantity > 0);
}

async function postGoal(cfg, payload) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${cfg.baseUrl}/internal/bot-order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Token': cfg.token,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Claims one order for this worker.
 *
 * Pushing `nextAttemptAt` into the future is both the lease and the backoff: a
 * second instance scanning at the same moment fails the condition and moves on,
 * and a worker that dies mid-request releases the order when the lease lapses
 * rather than stranding it.
 */
async function claim(orderId, now) {
  return Order.findOneAndUpdate(
    {
      _id: orderId,
      $or: [
        { 'billzSync.nextAttemptAt': null },
        { 'billzSync.nextAttemptAt': { $lte: now } },
      ],
    },
    {
      $set: { 'billzSync.nextAttemptAt': new Date(Date.now() + LEASE_MS) },
      $inc: { 'billzSync.attempts': 1 },
    },
    { new: true }
  );
}

/** Applies one order's goal. Returns what happened, for the caller's tally. */
async function dispatchOne(cfg, order) {
  const goal = GOAL_BY_STATUS[order.status];
  if (!goal) return 'skipped';

  const items = await buildLines(order);

  // Nothing linked to Billz. Marked dispatched so the scan stops returning it —
  // retrying cannot make a link appear, and linking one later is a deliberate
  // act that an operator follows with a manual push.
  if (!items.length) {
    await Order.updateOne({ _id: order._id }, {
      $set: {
        'billzSync.dispatched': goal,
        'billzSync.nextAttemptAt': null,
        'billzSync.attempts': 0,
        'billzSync.lastError': '',
      },
    });
    return 'unlinked';
  }

  const payload = {
    orderId: String(order._id),
    target: goal,
    items,
    totalAmount: Number(order.totalAmount) || 0,
    customer: {
      name: order.customerName || '',
      phone: order.customerPhone || '',
      address: order.location?.addressString || '',
    },
  };

  let result;
  try {
    result = await postGoal(cfg, payload);
  } catch (err) {
    await recordFailure(order, err.message);
    return 'failed';
  }

  if (result.status === 200 && result.body?.ok) {
    await Order.updateOne({ _id: order._id }, {
      $set: {
        'billzSync.dispatched': goal,
        'billzSync.nextAttemptAt': null,
        'billzSync.attempts': 0,
        'billzSync.lastError': '',
        'billzSync.conflict': result.body.conflict || '',
      },
    });
    return result.body.conflict ? 'conflict' : 'dispatched';
  }

  // 422 is a payload this hub will never accept — retrying sends the same bytes
  // again. Recorded as a conflict so it surfaces instead of looping.
  if (result.status === 422) {
    await Order.updateOne({ _id: order._id }, {
      $set: {
        'billzSync.conflict': String(result.body?.error || 'rejected').slice(0, MAX_ERROR_CHARS),
        'billzSync.nextAttemptAt': null,
      },
    });
    return 'conflict';
  }

  await recordFailure(order, `hub ${result.status}: ${result.body?.error || 'no detail'}`);
  return 'failed';
}

async function recordFailure(order, message) {
  const attempts = (order.billzSync?.attempts || 1);
  await Order.updateOne({ _id: order._id }, {
    $set: {
      'billzSync.lastError': String(message).slice(0, MAX_ERROR_CHARS),
      'billzSync.nextAttemptAt': new Date(Date.now() + backoffFor(attempts)),
    },
  });
}

/**
 * One pass over everything outstanding.
 *
 * Sequential on purpose. Volume is a handful of orders a minute, the hub holds a
 * single rate-limited queue to Billz behind this, and a serial pass means the
 * steps for one order can never overtake each other.
 */
async function runOnce({ limit = BATCH } = {}) {
  const cfg = settings();
  const off = disabledReason(cfg);
  if (off) return { skipped: true, reason: off };

  const now = new Date();
  const candidates = await Order.find(pendingFilter(cfg.since, now))
    .sort({ createdAt: 1 })
    .limit(limit)
    .lean();

  const tally = { dispatched: 0, conflict: 0, failed: 0, unlinked: 0, skipped: 0 };

  for (const candidate of candidates) {
    const order = await claim(candidate._id, now);
    if (!order) continue; // another instance has it

    try {
      const outcome = await dispatchOne(cfg, order);
      tally[outcome] = (tally[outcome] || 0) + 1;
    } catch (err) {
      console.error('[billz-bridge] order failed:', err.message);
      await recordFailure(order, err.message);
      tally.failed += 1;
    }
  }

  return { skipped: false, examined: candidates.length, ...tally };
}

/** Runs the pass on a timer. Returns the handle so shutdown can clear it. */
function start() {
  const cfg = settings();
  const off = disabledReason(cfg);
  if (off) {
    console.log(`[billz-bridge] not running — ${off}`);
    return null;
  }

  console.log(`[billz-bridge] on, orders from ${cfg.since.toISOString()} → ${cfg.baseUrl}`);
  let running = false;

  const tick = async () => {
    if (running) return; // a slow pass must not stack on itself
    running = true;
    try {
      const result = await runOnce();
      if (!result.skipped && result.examined) {
        console.log('[billz-bridge]', JSON.stringify(result));
      }
    } catch (err) {
      console.error('[billz-bridge] pass failed:', err.message);
    } finally {
      running = false;
    }
  };

  const timer = setInterval(tick, cfg.intervalMs);
  timer.unref?.();
  return timer;
}

module.exports = {
  GOAL_BY_STATUS,
  backoffFor,
  buildLines,
  disabledReason,
  pendingFilter,
  runOnce,
  settings,
  start,
};
