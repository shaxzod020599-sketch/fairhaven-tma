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
const statuses = require('./statuses');
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

router.use(authFailureLimiter);

// Uzum posts the token request as a form, everything else as JSON.
router.use(express.urlencoded({ extended: false, limit: '16kb' }));

const SETTING_KEYS = ['defaultMxikCode', 'defaultPackageCode'];

function fail(res, status, description, code = status) {
  return res.status(status).type(S.CONTENT_TYPES.order).json(S.errors({ code, description }));
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
  return page.items.filter(({ card }) => images.hasUsableImage(card));
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

const MAX_LINES = 200;

/**
 * Validates an incoming order and prices it from our own catalogue.
 *
 * Their `price` is read and ignored. A marketplace that decides what we are paid
 * is a marketplace that can be wrong — or stale — in the direction that costs
 * us money, and a price mismatch is better resolved by them re-reading the
 * catalogue than by us honouring a number we never set.
 */
async function readOrder(body) {
  const externalId = String(body?.eatsId || body?.eats_id || '').trim();
  if (!externalId) return { error: 'eatsId is required', code: 400 };

  const rawItems = Array.isArray(body?.items) ? body.items : [];
  if (!rawItems.length) return { error: 'items must contain at least one product', code: 400 };
  if (rawItems.length > MAX_LINES) {
    return { error: `an order may not exceed ${MAX_LINES} lines`, code: 400 };
  }

  const items = [];
  for (const raw of rawItems) {
    const billzProductId = String(raw?.id || raw?.productId || '').trim();
    const quantity = Number(raw?.quantity);
    if (!billzProductId) return { error: 'each item needs an id', code: 400 };
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return { error: `invalid quantity for item ${billzProductId}`, code: 400 };
    }

    const entry = await catalog.findForChannel(CHANNEL, billzProductId);
    if (!entry) return { error: `Item ${billzProductId} is not available`, code: 404 };

    items.push({
      billzProductId,
      name: entry.card.nameUz || entry.card.name || entry.mirror.name || '',
      quantity,
      unitPrice: catalog.priceFor(entry.card, CHANNEL),
    });
  }

  return {
    externalId,
    items,
    customer: {
      name: String(body?.customer?.name || body?.customerName || '').slice(0, 200),
      phone: String(body?.customer?.phone || body?.phoneNumber || '').slice(0, 40),
      address: String(body?.deliveryAddress || body?.address || '').slice(0, 500),
    },
  };
}

router.post('/order', async (req, res, next) => {
  try {
    const parsed = await readOrder(req.body);
    if (parsed.error) return fail(res, parsed.code, parsed.error);

    const { order, created } = await orders.acceptOrder(CHANNEL, {
      externalId: parsed.externalId,
      items: parsed.items,
      customer: parsed.customer,
      raw: req.body,
    });

    // Answered before Billz is touched. Their fifteen-minute deadline is on the
    // acknowledgement, and a resend must produce this same body.
    res.type(S.CONTENT_TYPES.order).json({ orderId: order.internalOrderId, result: 'OK' });

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
    res.type(S.CONTENT_TYPES.order).json(S.orderStatus(record));
  } catch (err) { next(err); }
});

/**
 * Status changes driven by Uzum.
 *
 * Only two of their states mean anything for stock — delivered and cancelled.
 * The rest are acknowledgements of a courier flow we do not run, and they are
 * accepted without changing anything. An unrecognised status is refused rather
 * than treated as one of those: silently ignoring an unknown state would hide a
 * real change behind a 200.
 */
router.put('/order/:orderId', async (req, res, next) => {
  try {
    const record = await findOrder(req.params.orderId);
    if (!record) return fail(res, 404, `Order ${req.params.orderId} not found`, 404);

    const { action, error } = statuses.actionFor(req.body?.status);
    if (error) return fail(res, 400, error);

    if (action) {
      try {
        if (action === 'sell') await orders.completeOrder(record.internalOrderId);
        if (action === 'cancel') {
          await orders.cancelOrder(record.internalOrderId, { reason: 'cancelled by uzum' });
        }
      } catch (err) {
        logger.warn('uzum status change refused', {
          orderId: record.internalOrderId, status: req.body?.status, err,
        });
        return fail(res, 409, err.message, 409);
      }
    }

    const fresh = await findOrder(record.internalOrderId);
    res.type(S.CONTENT_TYPES.order).json(S.orderStatus(fresh));

    if (action) {
      notify.announceOrder(CHANNEL, fresh.externalId)
        .catch((err) => logger.warn('order announcement failed', { err }));
    }
  } catch (err) { next(err); }
});

router.delete('/order/:orderId', async (req, res, next) => {
  try {
    const record = await findOrder(req.params.orderId);
    if (!record) return fail(res, 404, `Order ${req.params.orderId} not found`, 404);

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
    res.type(S.CONTENT_TYPES.order).json({ orderId: fresh.internalOrderId, result: 'OK' });

    notify.announceOrder(CHANNEL, fresh.externalId)
      .catch((err) => logger.warn('order announcement failed', { err }));
  } catch (err) { next(err); }
});

// Their client reads `description`, so a bare status would tell an integrator
// nothing about which of several paths they got wrong.
router.use((req, res) => {
  res.status(404).type(S.CONTENT_TYPES.order).json(S.errors({
    code: 404,
    description: `Unknown endpoint ${req.method} ${req.baseUrl}${req.path}`,
  }));
});

router.use((err, _req, res, _next) => {
  logger.error('uzum request failed', { err });
  res.status(500).type(S.CONTENT_TYPES.order).json(S.errors({
    code: 500, description: 'internal error',
  }));
});

module.exports = router;
