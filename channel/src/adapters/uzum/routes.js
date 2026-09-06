const express = require('express');
const config = require('../../config');
const logger = require('../../logger');
const catalog = require('../../core/catalog');
const orders = require('../../core/orders');
const images = require('../../media/images');
const notify = require('../../notify/telegram');
const ChannelOrder = require('../../models/ChannelOrder');
const { readSettings } = require('../../models/SettingView');
const { channelLimiter, authFailureLimiter } = require('../../middleware/rateLimit');
const { issueToken, requireBearer, CHANNEL } = require('./oauth');
const contract = require('./contract');
const { isDeepStrictEqual } = require('node:util');
const S = require('./serializers');

/**
 * Uzum Tezkor Retail API — our side of it.
 *
 * The contract is the Yandex Eats one, which makes this file the template for
 * the Yandex integration later. Three of its rules are load-bearing and none of
 * them are obvious from the endpoint list:
 *
 *   - **Fifteen minutes.** If Uzum does not see ACCEPTED_BY_RESTAURANT within
 *     that window it cancels the order. So accepting an order writes a record
 *     and answers; the Billz reservation happens after the response, and a slow
 *     Billz costs us a reservation rather than the order.
 *   - **A resent order must return the same id with a 200.** Their retry is
 *     indistinguishable from a new order except by `eatsId`, so that is the
 *     unique key.
 *   - **Both `/` and `/v1/` must work.** The router is mounted twice rather
 *     than each route being declared twice.
 */
const router = express.Router();

router.use(express.json({ type: ['application/json', 'application/vnd.eats.order.v2+json'], limit: '256kb' }));
router.use(authFailureLimiter);

// Uzum posts the token request as a form, everything else as JSON.
router.use(express.urlencoded({ extended: false, limit: '16kb' }));

// Exactly the keys the admin panel writes — see the backend's
// channelController, which owns this collection. A near-miss here reads as
// "no default configured" and silently falls back to the environment, so the
// operator's setting would never reach Uzum.
const SETTING_KEYS = ['channels.defaultMxikCode', 'channels.defaultPackageCode'];

function fail(res, status, description, code = status) {
  return res.status(status).type('application/json').json(S.errors({ code, description }));
}

/** Every nomenclature call names the store; a mismatch is a misconfiguration. */
function checkStore(req, res) {
  if (!config.uzum.storeId) {
    fail(res, 503, 'UZUM_STORE_ID is not configured on this deployment');
    return false;
  }
  if (String(req.params.storeId) !== config.uzum.storeId) {
    fail(res, 404, `Store ${req.params.storeId} is not served by this integration`, 404);
    return false;
  }
  return true;
}

/**
 * Products this channel may see.
 *
 * Uzum renders a picture for every line, so a product without a usable image is
 * held back rather than sent with an empty array — the same rule the shop
 * applies to itself. Nothing is fetched from the Billz CDN to fill the gap:
 * Billz forbids serving their media, and a product nobody has photographed is
 * not ready to sell on a marketplace.
 */
async function publishable() {
  const page = await catalog.listForChannel(CHANNEL, { skip: 0, limit: Number.MAX_SAFE_INTEGER });
  return page.items.filter((entry) => S.supportedEntry(entry) && images.hasUsableImage(entry.card));
}

// ── OAuth2 ──────────────────────────────────────────────────────────────────
// Deliberately before the bearer guard: this is where a token comes from.
router.post('/security/oauth/token', channelLimiter, issueToken);

// Everything below needs a token.
router.use(requireBearer, channelLimiter);

// ── Nomenclature ────────────────────────────────────────────────────────────
router.get('/nomenclature/:storeId/composition', async (req, res, next) => {
  try {
    if (!checkStore(req, res)) return;
    const [entries, settings] = await Promise.all([publishable(), readSettings(SETTING_KEYS)]);
    res.type(S.CONTENT_TYPES.nomenclature).json(S.composition(entries, S.defaultsFrom(settings)));
  } catch (err) { next(err); }
});

router.get('/nomenclature/:storeId/availability', async (req, res, next) => {
  try {
    if (!checkStore(req, res)) return;
    const entries = await publishable();
    res.type(S.CONTENT_TYPES.availability).json(S.availability(entries));
  } catch (err) { next(err); }
});

/** Optional in their contract, and useful as the first call an integrator makes. */
router.get('/restaurants', (_req, res) => {
  res.type(S.CONTENT_TYPES.nomenclature).json([{
    id: config.uzum.storeId,
    name: config.billz.shopName || 'Fairhaven Health',
    enabled: Boolean(config.uzum.storeId),
  }]);
});

// ── Orders ──────────────────────────────────────────────────────────────────

/** Prices supported piece orders from the same listing used by composition. */
async function readOrder(body) {
  const items = [];
  const quantities = new Map();
  for (const raw of body.items) {
    const entry = await catalog.findForChannel(CHANNEL, raw.id);
    if (!entry || !S.supportedEntry(entry) || !images.hasUsableImage(entry.card)) return { error: `Item ${raw.id} is not available`, code: 422 };
    const price = catalog.priceFor(entry.card, CHANNEL);
    if (raw.price !== price) return { error: `Price mismatch for item ${raw.id}`, code: 422 };
    const quantity = (quantities.get(raw.id) || 0) + raw.quantity;
    quantities.set(raw.id, quantity);
    if (!Number.isSafeInteger(quantity) || quantity > catalog.publishedQuantity(entry.card, entry.mirror, CHANNEL)
      || !catalog.isAvailable(entry.card, entry.mirror, CHANNEL)) return { error: `Insufficient stock for item ${raw.id}`, code: 422 };
    items.push({ billzProductId: raw.id, name: entry.card.nameUz || entry.card.name || entry.mirror.name || '', quantity: raw.quantity, unitPrice: price });
  }
  return {
    externalId: body.eatsId,
    items,
    customer: {
      name: (body.deliveryInfo?.clientName || '').slice(0, 200),
      phone: (body.deliveryInfo?.clientPhoneNumber || '').slice(0, 40),
      address: '',
    },
  };
}

router.post('/order', async (req, res, next) => {
  try {
    if (!config.uzum.storeId) return fail(res, 503, 'UZUM_STORE_ID is not configured');
    const invalid = contract.validate(req.body);
    if (invalid) return fail(res, invalid.code, invalid.error);
    if (req.body.restaurantId !== undefined && req.body.restaurantId !== config.uzum.storeId) return fail(res, 422, 'restaurantId does not match this store');
    const snapshot = contract.snapshot(req.body);
    const existing = await ChannelOrder().findOne({ channel: CHANNEL, externalId: req.body.eatsId }).lean();
    if (existing) {
      if (!isDeepStrictEqual(S.order(existing), snapshot)) return fail(res, 422, 'eatsId already exists with a different order');
      return res.json({ orderId: existing.internalOrderId, result: 'OK' });
    }
    const parsed = await readOrder(req.body);
    if (parsed.error) return fail(res, parsed.code, parsed.error);

    const { order, created } = await orders.acceptOrder(CHANNEL, {
      externalId: parsed.externalId,
      items: parsed.items,
      customer: parsed.customer,
      raw: snapshot,
    });
    if (!created && !isDeepStrictEqual(S.order(order), snapshot)) return fail(res, 422, 'eatsId already exists with a different order');

    // Answered before Billz is touched. Their fifteen-minute deadline is on the
    // acknowledgement, and a resend must produce this same body.
    res.json({ orderId: order.internalOrderId, result: 'OK' });

    if (created) {
      orders.reserveOrder(order.internalOrderId)
        .catch((err) => logger.error('reservation failed after accepting uzum order', {
          internalOrderId: order.internalOrderId, err,
        }))
        .finally(() => notify.announceOrder(CHANNEL, parsed.externalId)
          .catch((err) => logger.warn('order announcement failed', { err })));
    }
  } catch (err) { next(err); }
});

/** Loads an order by the id we handed back, or the one they know it by. */
async function findOrder(orderId) {
  const key = String(orderId || '');
  return ChannelOrder().findOne({
    channel: CHANNEL,
    $or: [{ internalOrderId: key }, { externalId: key }],
  }).lean();
}

router.get('/order/:orderId', async (req, res, next) => {
  try {
    const record = await findOrder(req.params.orderId);
    if (!record) return fail(res, 404, `Order ${req.params.orderId} not found`, 404);
    res.type(S.CONTENT_TYPES.order).json(S.order(record));
  } catch (err) { next(err); }
});

router.get('/order/:orderId/status', async (req, res, next) => {
  try {
    const record = await findOrder(req.params.orderId);
    if (!record) return fail(res, 404, `Order ${req.params.orderId} not found`, 404);
    res.json(S.orderStatus(record));
  } catch (err) { next(err); }
});

/** PUT replaces order composition; this optional operation is unsupported. */
router.put('/order/:orderId', async (req, res, next) => {
  try {
    const record = await findOrder(req.params.orderId);
    if (!record) return fail(res, 404, `Order ${req.params.orderId} not found`);
    return fail(res, 422, 'Order composition updates are unsupported');
  } catch (err) { next(err); }
});

router.delete('/order/:orderId', async (req, res, next) => {
  try {
    if (!req.body || typeof req.body.eatsId !== 'string' || !req.body.eatsId.trim()
      || (req.body.comment !== undefined && typeof req.body.comment !== 'string')
      || Object.keys(req.body).some((key) => !['eatsId', 'comment'].includes(key))) return fail(res, 400, 'eatsId and optional comment are required');
    const record = await findOrder(req.params.orderId);
    if (!record) return fail(res, 404, `Order ${req.params.orderId} not found`, 404);

    if (req.body.eatsId !== record.externalId) return fail(res, 400, 'eatsId does not match the loaded order');
    if (record.status === 'cancelled') return res.status(200).end();

    try {
      await orders.cancelOrder(record.internalOrderId, {
        reason: String(req.body?.comment || 'cancelled by uzum').slice(0, 300),
      });
    } catch (err) {
      // A delivered order is returned, not cancelled — different accounting,
      // and not something this endpoint may do silently.
      return fail(res, 409, err.message, 409);
    }

    const fresh = await findOrder(record.internalOrderId);
    res.status(200).end();

    notify.announceOrder(CHANNEL, fresh.externalId)
      .catch((err) => logger.warn('order announcement failed', { err }));
  } catch (err) { next(err); }
});

// Their client reads `description`, so a bare status would tell an integrator
// nothing about which of several paths they got wrong.
router.use((req, res) => {
  res.status(404).type('application/json').json(S.errors({
    code: 404,
    description: `Unknown endpoint ${req.method} ${req.baseUrl}${req.path}`,
  }));
});

router.use((err, _req, res, _next) => {
  if (err.type === 'entity.parse.failed') return fail(res, 400, 'Malformed JSON');
  if (err.type === 'entity.too.large') return fail(res, 413, 'Request body is too large');
  logger.error('uzum request failed', { err });
  res.status(500).type('application/json').json(S.errors({
    code: 500, description: 'internal error',
  }));
});

module.exports = router;
