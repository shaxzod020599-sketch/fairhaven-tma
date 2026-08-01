const express = require('express');
const rateLimit = require('express-rate-limit');
const config = require('../config');
const logger = require('../logger');
const botOrders = require('../core/botOrders');
const ChannelOrder = require('../models/ChannelOrder');
const { runCatalogSync } = require('../sync/catalog');
const { requireInternalToken } = require('../middleware/internalAuth');
const notify = require('../notify/telegram');

/**
 * Service-to-service surface, called only by the bot backend over loopback.
 *
 * The panel never talks to Billz directly and the backend never writes this
 * service's collections — both go through here, so the request queue, the rate
 * limit and the Billz key all stay in one process.
 */
const router = express.Router();

// A token-guessing loop is the only thing this needs protecting from; real
// traffic is a handful of calls per order.
const internalLimiter = process.env.DISABLE_RATE_LIMIT === 'true'
  ? (_req, _res, next) => next()
  : rateLimit({
    windowMs: 60 * 1000,
    limit: Number(process.env.RATE_LIMIT_INTERNAL_MAX || 600),
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) => res.status(429).json({ error: 'rate_limited' }),
  });

router.use(internalLimiter, requireInternalToken);

// ── Catalogue ───────────────────────────────────────────────────────────────
router.post('/sync', async (req, res) => {
  try {
    const result = await runCatalogSync({ force: req.query.force === 'true' });
    res.json(result);
  } catch (err) {
    logger.error('manual sync failed', { err });
    res.status(500).json({ error: 'sync_failed' });
  }
});

// ── Bot orders ──────────────────────────────────────────────────────────────

const VALID_GOALS = Object.keys(botOrders.GOALS);
const MAX_LINES = 100;

/**
 * Validates the goal the backend is asking for.
 *
 * The figures are the ones the customer was actually charged, so they are
 * recorded as sent rather than recomputed — but they are still bounded, because
 * a corrupt quantity here becomes a corrupt reservation in Billz.
 */
function readGoal(body) {
  const externalId = String(body?.orderId || '').trim();
  if (!externalId) return { error: 'orderId is required' };

  const target = String(body?.target || '').trim();
  if (!VALID_GOALS.includes(target)) {
    return { error: `target must be one of ${VALID_GOALS.join(', ')}` };
  }

  const rawItems = Array.isArray(body?.items) ? body.items : [];
  if (rawItems.length > MAX_LINES) return { error: `an order may not exceed ${MAX_LINES} lines` };

  const items = [];
  for (const raw of rawItems) {
    const quantity = Number(raw?.quantity);
    const unitPrice = Number(raw?.unitPrice);
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 10000) {
      return { error: `invalid quantity for line ${raw?.billzProductId}` };
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      return { error: `invalid unitPrice for line ${raw?.billzProductId}` };
    }
    items.push({
      billzProductId: String(raw?.billzProductId || '').trim(),
      name: String(raw?.name || '').slice(0, 300),
      quantity,
      unitPrice,
    });
  }

  return {
    externalId,
    target,
    items,
    totalAmount: Number(body?.totalAmount) || 0,
    customer: {
      name: String(body?.customer?.name || '').slice(0, 200),
      phone: String(body?.customer?.phone || '').slice(0, 40),
      address: String(body?.customer?.address || '').slice(0, 500),
    },
  };
}

/**
 * Brings a bot order to the state the backend says it should be in.
 *
 * Answers 200 with `conflict` set rather than an error status when the goal can
 * no longer be reached — a cancellation arriving after delivery, say. The
 * backend needs to stop retrying and tell an operator, and an error status would
 * make it retry forever instead.
 */
router.post('/bot-order', async (req, res) => {
  const parsed = readGoal(req.body);
  if (parsed.error) return res.status(422).json({ error: parsed.error });

  try {
    const result = await botOrders.ensureState(parsed);

    // Announcing after the state change, never before: a card claiming a
    // reservation that failed is worse than no card.
    if (result.applied) {
      notify.announceOrder(botOrders.CHANNEL, parsed.externalId)
        .catch((err) => logger.warn('order announcement failed', { err }));
    }

    res.json({
      ok: true,
      status: result.status,
      applied: result.applied,
      conflict: result.conflict || null,
    });
  } catch (err) {
    logger.error('bot order goal failed', {
      orderId: parsed.externalId, target: parsed.target, err,
    });
    // A genuine failure — Billz unreachable, a write refused. The backend keeps
    // the job and retries with backoff.
    res.status(502).json({ ok: false, error: err.message });
  }
});

/** Read-back for the panel: what this service knows about one bot order. */
router.get('/bot-order/:orderId', async (req, res) => {
  try {
    const order = await ChannelOrder()
      .findOne({ channel: config.bot.channel, externalId: String(req.params.orderId) })
      .lean();
    if (!order) return res.status(404).json({ error: 'not_found' });
    res.json({
      status: order.status,
      billz: {
        orderNumber: order.billz.orderNumber,
        reservationApplied: order.billz.reservationApplied,
        pendingApplied: order.billz.pendingApplied,
        attempts: order.billz.attempts,
        lastError: order.billz.lastError,
      },
      holdExpiresAt: order.holdExpiresAt,
    });
  } catch (err) {
    logger.error('bot order lookup failed', { err });
    res.status(500).json({ error: 'internal_error' });
  }
});

module.exports = router;
