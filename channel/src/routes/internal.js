const express = require('express');
const rateLimit = require('express-rate-limit');
const config = require('../config');
const logger = require('../logger');
const botOrders = require('../core/botOrders');
const ChannelKey = require('../models/ChannelKey');
const { generateKey, generateClientId, hashKey, describeKey } = require('../models/ChannelKey');
const ChannelOrder = require('../models/ChannelOrder');
const BillzProduct = require('../models/BillzProduct');
const SyncLog = require('../models/SyncLog');
const billz = require('../billz/client');
const { parseChannelAnalyticsQuery } = require('../analytics/query');
const { listChannelSales, summarizeChannelSales } = require('../analytics/channelSales');
const { summarizeInventory } = require('../analytics/billzInventory');
const { checkReportCapability } = require('../billz/reportCapability');
const { runCatalogSync } = require('../sync/catalog');
const { requireInternalToken } = require('../middleware/internalAuth');
const notify = require('../notify/telegram');
const medicalka = require('../medicalka/runtime');

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

// ── Read-only analytics ────────────────────────────────────────────────────

const ANALYTICS_CHANNELS = new Set(['medicalka', 'uzum']);

function analyticsChannel(req, res) {
  const channel = String(req.params.channel || '').toLowerCase();
  if (!ANALYTICS_CHANNELS.has(channel)) {
    res.status(404).json({ error: 'unsupported_channel' });
    return null;
  }
  return channel;
}

function analyticsError(res, err) {
  if (err?.code === 'invalid_analytics_query') {
    return res.status(422).json({ error: err.code });
  }
  logger.error('internal analytics failed', { err });
  return res.status(500).json({ error: 'internal_error' });
}

function periodShape(query) {
  return {
    preset: query.preset,
    from: query.from,
    to: query.to,
    bucket: query.bucket,
    currentBucketPartial: query.currentBucketPartial,
  };
}

router.get('/analytics/channels/:channel/summary', async (req, res) => {
  const channel = analyticsChannel(req, res);
  if (!channel) return;
  try {
    const query = parseChannelAnalyticsQuery(req.query);
    const summary = await summarizeChannelSales({
      channel, from: query.from, to: query.to, Model: ChannelOrder(),
    });
    res.json({ channel, period: periodShape(query), summary, generatedAt: new Date() });
  } catch (err) {
    analyticsError(res, err);
  }
});

router.get('/analytics/channels/:channel/sales', async (req, res) => {
  const channel = analyticsChannel(req, res);
  if (!channel) return;
  try {
    const query = parseChannelAnalyticsQuery(req.query);
    const result = await listChannelSales({
      channel,
      from: query.from,
      to: query.to,
      status: query.status,
      search: query.search,
      page: query.page,
      limit: query.limit,
      Model: ChannelOrder(),
    });
    res.json({ channel, period: periodShape(query), ...result, generatedAt: new Date() });
  } catch (err) {
    analyticsError(res, err);
  }
});

router.get('/analytics/billz/inventory', async (_req, res) => {
  try {
    const inventory = await summarizeInventory({
      ProductModel: BillzProduct(),
      SyncLogModel: SyncLog(),
      lowStockThreshold: Number(process.env.BILLZ_LOW_STOCK_THRESHOLD || 5),
    });
    res.json({ inventory, generatedAt: new Date() });
  } catch (err) {
    analyticsError(res, err);
  }
});

router.get('/analytics/billz/capability', async (req, res) => {
  try {
    const result = await checkReportCapability({
      client: billz,
      force: req.query.force === 'true',
    });
    res.json(result);
  } catch (err) {
    analyticsError(res, err);
  }
});

// ── Medicalka pharmacy approvals ───────────────────────────────────────────

const MEDICALKA_BUCKETS = new Set(['active', 'history', 'all']);
const MEDICALKA_SUBORDER_BUCKETS = new Set(['active', 'history', 'reconciliation', 'all']);
const MEDICALKA_ACTORS = new Set(['admin-panel', 'telegram']);

function medicalkaError(res, err) {
  const code = String(err?.code || 'medicalka_internal_error');
  const safeCode = code.startsWith('medicalka_') ? code : 'medicalka_internal_error';
  const status = Number(err?.status);
  if (Number.isInteger(status) && status >= 400 && status <= 599) {
    return res.status(status).json({ error: safeCode });
  }
  logger.error('internal medicalka request failed', { code: safeCode });
  return res.status(502).json({ error: safeCode });
}

function readMedicalkaQuery(query, buckets = MEDICALKA_BUCKETS) {
  const bucket = String(query?.bucket || 'active');
  const page = Number(query?.page || 1);
  const limit = Math.min(100, Number(query?.limit || 30));
  const search = String(query?.search || '').trim().slice(0, 120);
  if (
    !buckets.has(bucket)
    || !Number.isSafeInteger(page) || page < 1
    || !Number.isSafeInteger(limit) || limit < 1
  ) return null;
  return { bucket, page, limit, search };
}

function readMedicalkaActor(body) {
  const type = String(body?.actor?.type || '');
  const telegramId = Number(body?.actor?.telegramId);
  const name = String(body?.actor?.name || '').trim().slice(0, 120);
  if (
    !MEDICALKA_ACTORS.has(type)
    || !Number.isSafeInteger(telegramId) || telegramId <= 0
  ) return null;
  return { type, telegramId, name };
}

function readMedicalkaDecision(body) {
  const action = String(body?.action || '');
  const comment = String(body?.comment || '').trim();
  const actor = readMedicalkaActor(body);
  if (
    !['accepted', 'rejected'].includes(action)
    || !actor
    || comment.length > 500
  ) return null;
  return { action, comment, actor };
}

router.get('/medicalka/approvals', async (req, res) => {
  const query = readMedicalkaQuery(req.query);
  if (!query) return res.status(422).json({ error: 'medicalka_invalid_query' });
  try {
    return res.json(await medicalka.listApprovals(query));
  } catch (err) {
    return medicalkaError(res, err);
  }
});

router.get('/medicalka/approvals/:id', async (req, res) => {
  try {
    const approval = await medicalka.getApproval(req.params.id);
    if (!approval) return res.status(404).json({ error: 'medicalka_approval_not_found' });
    return res.json({ data: approval });
  } catch (err) {
    return medicalkaError(res, err);
  }
});

router.post('/medicalka/approvals/:id/respond', async (req, res) => {
  const decision = readMedicalkaDecision(req.body);
  if (!decision) return res.status(422).json({ error: 'medicalka_invalid_decision' });
  try {
    return res.json(await medicalka.respondToApproval(req.params.id, decision));
  } catch (err) {
    return medicalkaError(res, err);
  }
});

router.get('/medicalka/sub-orders', async (req, res) => {
  const query = readMedicalkaQuery(req.query, MEDICALKA_SUBORDER_BUCKETS);
  if (!query) return res.status(422).json({ error: 'medicalka_invalid_query' });
  try {
    return res.json(await medicalka.listSubOrders(query));
  } catch (err) {
    return medicalkaError(res, err);
  }
});

router.get('/medicalka/sub-orders/:id', async (req, res) => {
  try {
    const row = await medicalka.getSubOrder(req.params.id);
    if (!row) return res.status(404).json({ error: 'medicalka_suborder_not_found' });
    return res.json({ data: row });
  } catch (err) {
    return medicalkaError(res, err);
  }
});

router.post('/medicalka/sub-orders/:id/status', async (req, res) => {
  const status = String(req.body?.status || '');
  const actor = readMedicalkaActor(req.body);
  if (!actor || !['shipped', 'delivered', 'completed'].includes(status)) {
    return res.status(422).json({ error: 'medicalka_invalid_suborder_status' });
  }
  try {
    return res.json({ data: await medicalka.transitionSubOrder(req.params.id, status, actor) });
  } catch (err) {
    return medicalkaError(res, err);
  }
});

router.post('/medicalka/sub-orders/:id/cancel', async (req, res) => {
  const reason = String(req.body?.reason || '').trim();
  const actor = readMedicalkaActor(req.body);
  if (!actor || !reason || reason.length > 500) {
    return res.status(422).json({ error: 'medicalka_invalid_cancel_reason' });
  }
  try {
    return res.json({ data: await medicalka.cancelSubOrder(req.params.id, reason, actor) });
  } catch (err) {
    return medicalkaError(res, err);
  }
});

router.post('/medicalka/sub-orders/:id/labels', async (req, res) => {
  const label = String(req.body?.label || '');
  const itemId = String(req.body?.itemId || '').trim();
  const actor = readMedicalkaActor(req.body);
  if (!actor || !itemId || label.length < 21 || label.length > 500) {
    return res.status(422).json({ error: 'medicalka_invalid_label' });
  }
  try {
    return res.json({
      data: await medicalka.addSubOrderLabel(req.params.id, { itemId, label, actor }),
    });
  } catch (err) {
    return medicalkaError(res, err);
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

router.post('/keys/pair', async (req, res) => {
  const label = String(req.body?.label || 'Medicalka').trim().slice(0, 100) || 'Medicalka';
  const revokeOld = req.body?.revokeOld === true;

  try {
    const token = generateKey('medicalka', 'token');
    const secret = generateKey('medicalka', 'secret');
    const tokenShape = describeKey(token);
    const secretShape = describeKey(secret);
    const records = await ChannelKey().insertMany([
      {
        channel: 'medicalka', kind: 'token', hash: hashKey(token),
        prefix: tokenShape.prefix, last4: tokenShape.last4,
        label: `${label} · TOKEN`, active: true,
      },
      {
        channel: 'medicalka', kind: 'secret', hash: hashKey(secret),
        prefix: secretShape.prefix, last4: secretShape.last4,
        label: `${label} · SECRET`, active: true,
      },
    ]);

    const ids = records.map((record) => record._id);
    if (revokeOld) {
      await ChannelKey().updateMany(
        { channel: 'medicalka', active: true, _id: { $nin: ids } },
        { $set: { active: false, revokedAt: new Date() } }
      );
    }

    logger.info('medicalka key pair issued', {
      tokenId: String(records[0]._id), secretId: String(records[1]._id), label, revokeOld,
    });
    res.json({
      token,
      secret,
      tokenId: String(records[0]._id),
      secretId: String(records[1]._id),
      label,
    });
  } catch (err) {
    logger.error('medicalka key pair issue failed', { err });
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

/**
 * Registers credentials issued by the marketplace itself.
 *
 * The two integrations hand credentials in opposite directions. Medicalka asks
 * us to issue a token and a secret, and does not care what they look like —
 * so we generate them. Uzum is the reverse: their manager sends us the
 * `client_id` and `client_secret` their system will authenticate with, and our
 * OAuth endpoint has to accept exactly those values. Generating our own pair
 * for Uzum produces credentials nobody will ever present.
 *
 * The secret is stored the same way as a generated one — SHA-256 only.
 */
router.post('/keys/import', async (req, res) => {
  const channel = String(req.body?.channel || '').trim();
  const clientId = String(req.body?.clientId || '').trim();
  const clientSecret = String(req.body?.clientSecret || '').trim();
  const label = String(req.body?.label || '').slice(0, 120);

  if (channel !== 'uzum') {
    return res.status(422).json({ error: 'only uzum credentials are imported — medicalka keys are issued by us' });
  }
  if (!clientId || clientId.length < 4) {
    return res.status(422).json({ error: 'clientId is required' });
  }
  if (!clientSecret || clientSecret.length < 8) {
    return res.status(422).json({ error: 'clientSecret must be at least 8 characters' });
  }

  try {
    // One active record per client id: importing the same pair twice should
    // not create a shadow credential that revocation then misses.
    const existing = await ChannelKey().findOne({ channel, kind: 'oauth', clientId, active: true });
    if (existing) {
      return res.status(409).json({
        error: 'this client_id is already registered — revoke it first to replace the secret',
        id: String(existing._id),
      });
    }

    const record = await ChannelKey().create({
      channel,
      kind: 'oauth',
      clientId,
      hash: hashKey(clientSecret),
      prefix: clientId.slice(0, 8),
      last4: clientSecret.slice(-4),
      label: label || 'выдан Uzum',
      active: true,
    });

    logger.info('external credentials imported', { channel, clientId, id: String(record._id) });
    res.json({
      id: String(record._id),
      channel,
      kind: 'oauth',
      clientId,
      fingerprint: `${clientId.slice(0, 8)}…${clientSecret.slice(-4)}`,
      label: record.label,
    });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ error: 'these credentials are already registered' });
    }
    logger.error('credential import failed', { err });
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
