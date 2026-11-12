const express = require('express');
const mongoose = require('mongoose');
const logger = require('../logger');
const Partner = require('../models/Partner');
const PartnerOrder = require('../models/PartnerOrder');
const PartnerEvent = require('../models/PartnerEvent');
const ChannelKey = require('../models/ChannelKey');
const ChannelOrder = require('../models/ChannelOrder');
const registry = require('./registry');
const partnerOrders = require('./orders');
const webhooks = require('./webhooks');
const S = require('./serializers');
const catalog = require('../core/catalog');

/**
 * Admin and bot surface for partners, under /internal/partners (internal token).
 * The admin panel manages partners here; the bot posts operator decisions.
 */
const router = express.Router();

const MODES = ['test', 'live', 'off'];

function sendError(res, status, code, extra = {}) {
  return res.status(status).json({ error: code, ...extra });
}

const wrap = (handler) => async (req, res) => {
  try {
    await handler(req, res);
  } catch (err) {
    if (err instanceof partnerOrders.PartnerApiError) {
      return sendError(res, err.status, err.code, { message: err.message });
    }
    if (typeof err?.code === 'string' && err.code.startsWith('partner_')) {
      const status = err.code === 'partner_not_found' ? 404
        : err.code === 'partner_encryption_unavailable' ? 503
          : err.code.startsWith('partner_invalid') ? 422 : 409;
      return sendError(res, status, err.code);
    }
    if (err?.name === 'ValidationError') return sendError(res, 422, 'partner_invalid_fields');
    logger.error('partner admin request failed', { path: req.path, err });
    return sendError(res, 500, 'internal_error');
  }
};

function readPatch(body = {}) {
  const patch = {};
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name || name.length > 80) return { error: 'partner_invalid_name' };
    patch.name = name;
  }
  if (body.mode !== undefined) {
    if (!MODES.includes(body.mode)) return { error: 'partner_invalid_mode' };
    patch.mode = body.mode;
  }
  if (body.decisionMinutes !== undefined) {
    const minutes = Number(body.decisionMinutes);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 60) return { error: 'partner_invalid_decision_minutes' };
    patch.decisionMinutes = minutes;
  }
  if (body.note !== undefined) patch.note = String(body.note);
  if (body.webhookUrl !== undefined) {
    const checked = webhooks.checkUrl(body.webhookUrl);
    if (!checked.ok) return { error: checked.code };
    patch.webhookUrl = checked.url;
  }
  if (body.billzSecret !== undefined) {
    const secret = String(body.billzSecret || '').trim();
    if (secret.length > 4096) return { error: 'partner_invalid_billz_secret' };
    patch.billzSecret = secret;
  }
  if (body.billzPaymentTypeId !== undefined) patch.billzPaymentTypeId = String(body.billzPaymentTypeId).trim().slice(0, 100);
  if (body.billzPaymentTypeName !== undefined) patch.billzPaymentTypeName = String(body.billzPaymentTypeName).trim().slice(0, 100);
  return { patch };
}

async function summary(doc) {
  const channel = Partner.channelOf(doc.code);
  const [keys, total, testTotal, waiting, last, pendingEvents, failedEvents, lastDelivered] = await Promise.all([
    ChannelKey().find({ channel, active: true }).sort({ createdAt: -1 }).lean(),
    PartnerOrder().countDocuments({ partnerCode: doc.code, test: false }),
    PartnerOrder().countDocuments({ partnerCode: doc.code, test: true }),
    PartnerOrder().countDocuments({ partnerCode: doc.code, status: 'new' }),
    PartnerOrder().findOne({ partnerCode: doc.code }).sort({ createdAt: -1 }).select('createdAt').lean(),
    PartnerEvent().countDocuments({ partnerCode: doc.code, state: 'pending' }),
    PartnerEvent().countDocuments({ partnerCode: doc.code, state: 'failed' }),
    PartnerEvent().findOne({ partnerCode: doc.code, state: 'delivered' }).sort({ deliveredAt: -1 }).select('deliveredAt').lean(),
  ]);
  return {
    code: doc.code,
    name: doc.name,
    mode: doc.mode,
    decisionMinutes: doc.decisionMinutes,
    note: doc.note || '',
    webhookUrl: doc.webhook?.url || '',
    billz: {
      hasSecret: Boolean(doc.billz?.hasSecret),
      paymentTypeId: doc.billz?.paymentTypeId || '',
      paymentTypeName: doc.billz?.paymentTypeName || '',
    },
    liveSince: doc.liveSince,
    createdAt: doc.createdAt,
    keys: keys.map((key) => ({
      kind: key.kind, fingerprint: `${key.prefix}…${key.last4}`, lastUsedAt: key.lastUsedAt, createdAt: key.createdAt,
    })),
    stats: {
      liveOrders: total,
      testOrders: testTotal,
      waiting,
      lastOrderAt: last?.createdAt || null,
      webhookPending: pendingEvents,
      webhookFailed: failedEvents,
      webhookLastDeliveredAt: lastDelivered?.deliveredAt || null,
    },
  };
}

router.get('/', wrap(async (_req, res) => {
  const docs = await Partner().find({}).sort({ createdAt: 1 }).lean();
  // How many products every partner can see right now (the catalogue is shared),
  // so the panel can say "open products first" instead of leaving partners on
  // an empty catalogue. null when the count fails: the list must still load.
  const products = await catalog.listForChannel(partnerOrders.CATALOG_CHANNEL, { limit: 0 })
    .then((result) => result.total)
    .catch((err) => { logger.warn('partner catalog count failed', { error: err.message }); return null; });
  res.json({ partners: await Promise.all(docs.map(summary)), catalog: { products } });
}));

router.post('/', wrap(async (req, res) => {
  const { patch, error } = readPatch({
    name: req.body?.name,
    ...(req.body?.decisionMinutes !== undefined ? { decisionMinutes: req.body.decisionMinutes } : {}),
    ...(req.body?.webhookUrl !== undefined ? { webhookUrl: req.body.webhookUrl } : {}),
  });
  if (error) return sendError(res, 422, error);
  const { keys, webhookSecret } = await registry.create({
    code: req.body?.code,
    name: patch.name,
    decisionMinutes: patch.decisionMinutes,
    note: req.body?.note,
    webhookUrl: patch.webhookUrl,
  });
  const doc = await Partner().findOne({ code: String(req.body.code).trim().toLowerCase() }).lean();
  res.status(201).json({ partner: await summary(doc), keys, webhookSecret });
}));

router.patch('/:code', wrap(async (req, res) => {
  const { patch, error } = readPatch(req.body);
  if (error) return sendError(res, 422, error);
  const doc = await registry.update(req.params.code, patch);
  if (!doc) return sendError(res, 404, 'partner_not_found');
  res.json({ partner: await summary(doc) });
}));

router.post('/:code/keys', wrap(async (req, res) => {
  const keys = await registry.issueKeys(req.params.code);
  res.json({ keys });
}));

router.get('/:code/webhook-secret', wrap(async (req, res) => {
  const partner = registry.get(req.params.code) || await registry.refresh(req.params.code);
  if (!partner) return sendError(res, 404, 'partner_not_found');
  if (!partner.webhookSecret) return sendError(res, 503, 'partner_encryption_unavailable');
  res.json({ secret: partner.webhookSecret });
}));

router.post('/:code/webhook-secret', wrap(async (req, res) => {
  const secret = await registry.rotateWebhookSecret(req.params.code);
  if (!secret) return sendError(res, 404, 'partner_not_found');
  res.json({ secret });
}));

router.post('/:code/webhook/test', wrap(async (req, res) => {
  const partner = registry.get(req.params.code) || await registry.refresh(req.params.code);
  if (!partner) return sendError(res, 404, 'partner_not_found');
  if (!partner.webhookUrl) return sendError(res, 409, 'webhook_not_configured');
  res.json(await webhooks.sendPing(partner));
}));

router.get('/:code/orders', wrap(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
  const orders = await PartnerOrder().find({ partnerCode: req.params.code })
    .sort({ createdAt: -1 }).limit(limit).lean();
  const ledgers = await ChannelOrder().find({
    internalOrderId: { $in: orders.map((o) => o.channelOrderId).filter(Boolean) },
  }).select('internalOrderId status billz.reconciliationRequired').lean();
  const byId = new Map(ledgers.map((l) => [l.internalOrderId, l]));
  res.json({
    orders: orders.map((order) => ({
      ...S.order(order),
      _id: String(order._id),
      decidedBy: order.decidedBy || '',
      billzStatus: byId.get(order.channelOrderId)?.status || null,
      needsReconciliation: Boolean(byId.get(order.channelOrderId)?.billz?.reconciliationRequired),
    })),
  });
}));

// ── Operator actions (Telegram bot and admin panel) ────────────────────────
function orderFilter(id) {
  return mongoose.isValidObjectId(id) ? { _id: new mongoose.Types.ObjectId(String(id)) } : null;
}

function actorName(actor) {
  return String(actor?.name || '').trim().slice(0, 80) || 'admin';
}

router.post('/orders/:id/decision', wrap(async (req, res) => {
  const filter = orderFilter(req.params.id);
  if (!filter) return sendError(res, 404, 'order_not_found');
  const action = req.body?.action;
  if (!['accept', 'reject'].includes(action)) return sendError(res, 422, 'invalid_action');
  const current = await PartnerOrder().findOne(filter).lean();
  if (!current) return sendError(res, 404, 'order_not_found');
  if (current.test) return sendError(res, 409, 'test_order');
  const partner = registry.get(current.partnerCode);
  const by = actorName(req.body?.actor);
  const order = action === 'accept'
    ? await partnerOrders.accept(partner, filter, { by })
    : await partnerOrders.reject(partner, filter, { by, reason: 'rejected_by_shop' });
  res.json({ order: { ...S.order(order), _id: String(order._id) } });
}));

router.post('/orders/:id/cancel', wrap(async (req, res) => {
  const filter = orderFilter(req.params.id);
  if (!filter) return sendError(res, 404, 'order_not_found');
  const current = await PartnerOrder().findOne(filter).lean();
  if (!current) return sendError(res, 404, 'order_not_found');
  const order = await partnerOrders.cancel(registry.get(current.partnerCode), filter, {
    reason: 'cancelled_by_shop', by: actorName(req.body?.actor),
  });
  res.json({ order: { ...S.order(order), _id: String(order._id) } });
}));

module.exports = router;
