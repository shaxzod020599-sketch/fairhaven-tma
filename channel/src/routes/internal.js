const express = require('express');
const rateLimit = require('express-rate-limit');
const config = require('../config');
const logger = require('../logger');
const botOrders = require('../core/botOrders');
const ChannelKey = require('../models/ChannelKey');
const { generateKey, generateClientId, hashKey, describeKey } = require('../models/ChannelKey');
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

// ── Channel credentials ─────────────────────────────────────────────────────

/**
 * Issuing and revoking marketplace keys from the panel.
 *
 * The alternative is an SSH session and a script, which in practice means keys
 * are issued rarely, revoked late, and shared over chat because reissuing is a
 * chore. Making it a button is the security improvement.
 *
 * A key is shown exactly once, in the response that creates it. Only its
 * SHA-256 is stored, so there is no endpoint that can reveal one later and no
 * backup that contains one.
 */
const KEY_KINDS = { medicalka: ['token', 'secret'], uzum: ['oauth'] };

router.get('/keys', async (_req, res) => {
  try {
    const keys = await ChannelKey().find({}).sort({ createdAt: -1 }).limit(200).lean();
    res.json({
      keys: keys.map((key) => ({
        id: String(key._id),
        channel: key.channel,
        kind: key.kind,
        // Enough to tell two keys apart, not enough to use one.
        fingerprint: `${key.prefix}…${key.last4}`,
        clientId: key.clientId || '',
        label: key.label || '',
        active: key.active,
        lastUsedAt: key.lastUsedAt,
        createdAt: key.createdAt,
        revokedAt: key.revokedAt,
      })),
    });
  } catch (err) {
    logger.error('key listing failed', { err });
    res.status(500).json({ error: 'internal_error' });
  }
});

router.post('/keys', async (req, res) => {
  const channel = String(req.body?.channel || '').trim();
  const kind = String(req.body?.kind || '').trim();
  const label = String(req.body?.label || '').slice(0, 120);

  if (!KEY_KINDS[channel]) {
    return res.status(422).json({ error: `channel must be one of ${Object.keys(KEY_KINDS).join(', ')}` });
  }
  if (!KEY_KINDS[channel].includes(kind)) {
    return res.status(422).json({ error: `${channel} keys are ${KEY_KINDS[channel].join(' or ')}` });
  }

  try {
    const secret = generateKey(channel, kind);
    const shape = describeKey(secret);
    const clientId = kind === 'oauth' ? generateClientId(channel) : '';

    const record = await ChannelKey().create({
      channel,
      kind,
      hash: hashKey(secret),
      prefix: shape.prefix,
      last4: shape.last4,
      label,
      active: true,
      ...(clientId ? { clientId } : {}),
    });

    logger.info('channel key issued', { channel, kind, id: String(record._id), label });

    // The only time this value exists outside the caller's screen.
    res.json({
      id: String(record._id),
      channel,
      kind,
      label,
      fingerprint: `${shape.prefix}…${shape.last4}`,
      ...(clientId ? { clientId, clientSecret: secret } : { key: secret }),
    });
  } catch (err) {
    logger.error('key issue failed', { err });
    res.status(500).json({ error: 'internal_error' });
  }
});

router.post('/keys/:id/revoke', async (req, res) => {
  try {
    const result = await ChannelKey().findOneAndUpdate(
      { _id: req.params.id, active: true },
      { $set: { active: false, revokedAt: new Date() } },
      { new: true }
    );
    if (!result) return res.status(404).json({ error: 'not_found_or_already_revoked' });

    logger.warn('channel key revoked', {
      channel: result.channel, kind: result.kind, id: String(result._id),
    });
    // Uzum bearer tokens are checked against the key on every request, so this
    // takes effect immediately rather than when the token would have expired.
    res.json({ ok: true, id: String(result._id), revokedAt: result.revokedAt });
  } catch (err) {
    logger.error('key revoke failed', { err });
    res.status(500).json({ error: 'internal_error' });
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
