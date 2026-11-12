const express = require('express');
const config = require('../../config');
const logger = require('../../logger');
const catalog = require('../../core/catalog');
const settingView = require('../../models/SettingView');
const ChannelKey = require('../../models/ChannelKey');
const { hashKey, describeKey } = require('../../models/ChannelKey');
const Partner = require('../../models/Partner');
const registry = require('../../partners/registry');
const partnerOrders = require('../../partners/orders');
const webhooks = require('../../partners/webhooks');
const S = require('../../partners/serializers');
const { channelLimiter, authFailureLimiter } = require('../../middleware/rateLimit');

/**
 * FairHaven Partner API v1 — our own contract, shared by every partner.
 *
 * Partners pull the catalogue and stock, push orders, and learn about status
 * changes by webhook or by polling. Documentation: docs/integrations/
 * partner-api.ru.md and the OpenAPI file next to it (also served at
 * /partner/docs).
 *
 * Every error has the same shape: {"error": {"code", "message", "details"?}}.
 */
const router = express.Router();
const { CATALOG_CHANNEL, PartnerApiError } = partnerOrders;

const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 100;

function sendError(res, status, code, message, details) {
  return res.status(status).json({ error: { code, message, ...(details ? { details } : {}) } });
}

function paging(req) {
  const offset = Math.max(0, Math.floor(Number(req.query.offset)) || 0);
  const raw = Math.floor(Number(req.query.limit));
  const limit = Number.isFinite(raw) && raw > 0 ? Math.min(raw, MAX_LIMIT) : DEFAULT_LIMIT;
  return { limit, offset };
}

function presentedKey(req) {
  const header = String(req.get('authorization') || '');
  const bearer = /^Bearer\s+(\S+)$/i.exec(header);
  if (bearer) return bearer[1];
  return String(req.get('x-api-key') || '').trim();
}

/**
 * Authenticates a partner key. `kind: 'secret'` endpoints change orders and
 * refuse the read token; read endpoints accept either key.
 */
function requireKey(kind) {
  return async function partnerAuth(req, res, next) {
    const presented = presentedKey(req);
    if (!presented) {
      return sendError(res, 401, 'unauthorized', 'send your key in the "Authorization: Bearer <key>" header');
    }
    const shape = describeKey(presented);
    if (kind === 'secret' && shape?.kind === 'token') {
      return sendError(res, 401, 'unauthorized', 'this endpoint needs the order secret (fhp_s_…); the read token was sent');
    }

    let record;
    try {
      record = await ChannelKey().findOne({ hash: hashKey(presented) }).lean();
    } catch (err) {
      logger.error('partner key lookup failed', { err });
      return sendError(res, 500, 'internal_error', 'internal error');
    }
    const code = Partner.codeOf(record?.channel);
    if (!record || !code || (kind === 'secret' && record.kind !== 'secret')) {
      return sendError(res, 401, 'unauthorized', 'unknown or revoked key');
    }
    if (!record.active) return sendError(res, 401, 'unauthorized', 'this key has been revoked');

    const partner = registry.get(code) || await registry.refresh(code).catch(() => null);
    if (!partner) return sendError(res, 401, 'unauthorized', 'unknown or revoked key');
    if (partner.mode === 'off') {
      return sendError(res, 403, 'partner_disabled', 'access is switched off — contact FairHaven');
    }

    req.channelKey = { id: record._id, kind: record.kind };
    req.partner = partner;
    ChannelKey().updateOne({ _id: record._id }, { $set: { lastUsedAt: new Date() } }).catch(() => {});
    return next();
  };
}

const read = [authFailureLimiter, requireKey('any'), channelLimiter];
const write = [authFailureLimiter, requireKey('secret'), channelLimiter];

const SETTING_KEYS = ['channels.defaultMxikCode', 'channels.defaultPackageCode'];
const taxDefaults = () => settingView.readSettings(SETTING_KEYS)
  .then((settings) => ({
    mxikCode: String(settings?.['channels.defaultMxikCode'] ?? config.defaultMxikCode ?? '').trim(),
    packageCode: String(settings?.['channels.defaultPackageCode'] ?? config.defaultPackageCode ?? '').trim(),
  }))
  .catch(() => ({ mxikCode: config.defaultMxikCode || '', packageCode: config.defaultPackageCode || '' }));

async function describe({ card, mirror }, defaults) {
  return {
    card,
    mirror,
    id: await catalog.ensureMedicalkaId(mirror),
    price: catalog.priceFor(card, CATALOG_CHANNEL),
    oldPrice: catalog.oldPriceFor(card, CATALOG_CHANNEL),
    quantity: catalog.publishedQuantity(card, mirror, CATALOG_CHANNEL),
    defaults,
  };
}

const wrap = (handler) => async (req, res, next) => {
  try {
    await handler(req, res);
  } catch (err) {
    if (err instanceof PartnerApiError) return sendError(res, err.status, err.code, err.message, err.details);
    return next(err);
  }
};

// ── Access check ─────────────────────────────────────────────────────────────
router.get('/me', read, (req, res) => {
  res.json({
    partner: { code: req.partner.code, name: req.partner.name, mode: req.partner.mode },
    key: req.channelKey.kind === 'secret' ? 'secret' : 'token',
    shop: { name: config.billz.shopName },
    webhook_configured: Boolean(req.partner.webhookUrl),
    server_time: new Date().toISOString(),
  });
});

// ── Catalogue ────────────────────────────────────────────────────────────────
router.get('/products', read, wrap(async (req, res) => {
  const { limit, offset } = paging(req);
  const search = String(req.query.search || '').trim().slice(0, 100);
  const [listing, defaults] = await Promise.all([
    catalog.listForChannel(CATALOG_CHANNEL, { skip: offset, limit, search }),
    taxDefaults(),
  ]);
  const items = await Promise.all(listing.items.map(async (entry) => S.product(await describe(entry, defaults))));
  res.json(S.page(items, listing.total, { limit, offset }));
}));

router.get('/products/:id', read, wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) return sendError(res, 422, 'validation_error', 'id must be a positive integer');
  const mirror = await require('../../models/BillzProduct')().findOne({ medicalkaId: id }).lean();
  const entry = mirror ? await catalog.findForChannel(CATALOG_CHANNEL, mirror.billzProductId) : null;
  if (!entry) return sendError(res, 404, 'product_not_found', `product ${id} is not in the catalogue`);
  res.json(S.product(await describe(entry, await taxDefaults())));
}));

// ── Stock ────────────────────────────────────────────────────────────────────
// Every product in the catalogue, including those at zero: a product that
// runs out stays in the list with quantity 0, so "missing" never has to mean
// anything.
router.get('/stock', read, wrap(async (req, res) => {
  const { limit, offset } = paging(req);
  const listing = await catalog.listForChannel(CATALOG_CHANNEL, { skip: offset, limit });
  const items = await Promise.all(listing.items.map(async ({ card, mirror }) => S.stockRow({
    id: await catalog.ensureMedicalkaId(mirror),
    price: catalog.priceFor(card, CATALOG_CHANNEL),
    quantity: catalog.publishedQuantity(card, mirror, CATALOG_CHANNEL),
  })));
  res.json({ ...S.page(items, listing.total, { limit, offset }), generated_at: new Date().toISOString() });
}));

// ── Orders ───────────────────────────────────────────────────────────────────
router.post('/orders', write, wrap(async (req, res) => {
  const { order, created } = await partnerOrders.createOrder(req.partner, req.body);
  res.status(created ? 201 : 200).json(S.order(order));
}));

router.get('/orders', read, wrap(async (req, res) => {
  const { limit, offset } = paging(req);
  const status = String(req.query.status || '');
  if (status && !require('../../models/PartnerOrder').STATUSES.includes(status)) {
    return sendError(res, 422, 'validation_error', 'unknown status filter');
  }
  const { items, total } = await partnerOrders.listOrders(req.partner.code, { status, limit, offset });
  res.json(S.page(items.map(S.order), total, { limit, offset }));
}));

router.get('/orders/:orderId', read, wrap(async (req, res) => {
  const order = await partnerOrders.findOrder(req.partner, req.params.orderId);
  if (!order) return sendError(res, 404, 'order_not_found', 'order not found');
  res.json(S.order(order));
}));

const own = (req) => ({
  partnerCode: req.partner.code, externalId: String(req.params.orderId), test: req.partner.mode === 'test',
});

router.post('/orders/:orderId/cancel', write, wrap(async (req, res) => {
  const order = await partnerOrders.cancel(req.partner, own(req), { reason: req.body?.reason, by: 'partner' });
  res.json(S.order(order));
}));

router.post('/orders/:orderId/complete', write, wrap(async (req, res) => {
  const order = await partnerOrders.complete(req.partner, own(req));
  res.json(S.order(order));
}));

// ── Webhook check ────────────────────────────────────────────────────────────
router.post('/webhook/test', write, wrap(async (req, res) => {
  if (!req.partner.webhookUrl) {
    return sendError(res, 409, 'webhook_not_configured', 'no webhook URL is set for you yet — send it to FairHaven');
  }
  const result = await webhooks.sendPing(req.partner);
  res.json(result);
}));

router.use((req, res) => sendError(res, 404, 'not_found', `unknown endpoint ${req.method} ${req.baseUrl}${req.path}`));

module.exports = router;
module.exports.requireKey = requireKey;
