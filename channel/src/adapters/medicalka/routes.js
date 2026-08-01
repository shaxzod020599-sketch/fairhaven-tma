const express = require('express');
const config = require('../../config');
const catalog = require('../../core/catalog');
const orders = require('../../core/orders');
const logger = require('../../logger');
const notify = require('../../notify/telegram');
const BillzProduct = require('../../models/BillzProduct');
const ChannelOrder = require('../../models/ChannelOrder');
const ProductCard = require('../../models/ProductCard');
const { requireKey, CHANNEL } = require('./auth');
const { channelLimiter, authFailureLimiter } = require('../../middleware/rateLimit');
const S = require('./serializers');

/**
 * Medicalka integration surface.
 *
 * We are the provider: Medicalka polls these endpoints with the token we issue
 * and posts orders with the secret. Shapes and status codes follow their
 * integration guide exactly — including the string-typed price and quantity,
 * and the 404 on a product that is out of stock, which their client turns into
 * `None` rather than an exception.
 */
const router = express.Router();

// Bounds an unauthenticated flood before it reaches the key lookup, then bounds
// an authenticated caller per key. The contract documents a 429, so one has to
// exist; both are generous against the polling schedule it asks for.
router.use(authFailureLimiter);

// One shop in Billz, so one pharmacy. Their contract still expects a list, and
// order submission carries no pharmacy_id because there is only one branch.
const PHARMACY_ID = 1;

const MAX_LIMIT = 1000;

function pagination(req) {
  const skip = Math.max(0, Number(req.query.skip) || 0);
  const rawLimit = Number(req.query.limit);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0
    ? Math.min(rawLimit, MAX_LIMIT)
    : 50;
  return { skip, limit };
}

function unprocessable(res, detail) {
  return res.status(422).json({ detail });
}

function notFound(res, detail) {
  return res.status(404).json({ detail });
}

/** Attaches the integer id and channel price each serialiser needs. */
async function decorate(entry) {
  const medicalkaId = await catalog.ensureMedicalkaId(entry.mirror);
  return { ...entry, medicalkaId, price: catalog.priceFor(entry.card, CHANNEL) };
}

const read = [requireKey('token'), channelLimiter];

// ── Access check ────────────────────────────────────────────────────────────
router.get('/pharmacies', read, (_req, res) => {
  const items = [S.pharmacy({
    id: PHARMACY_ID,
    name: config.billz.shopName || 'Fairhaven Health',
    createdAt: config.billz.shopCreatedAt,
  })];
  res.json(S.list(items, items.length));
});

// ── Catalogue ───────────────────────────────────────────────────────────────
router.get('/products', read, async (req, res, next) => {
  try {
    const { skip, limit } = pagination(req);
    const page = await catalog.listForChannel(CHANNEL, { skip, limit });
    const items = await Promise.all(page.items.map(async (entry) => {
      return S.product(await decorate(entry));
    }));
    res.json(S.list(items, page.total));
  } catch (err) { next(err); }
});

router.get('/products/search', read, async (req, res, next) => {
  try {
    const query = String(req.query.q || req.query.query || '').trim();
    if (!query) return unprocessable(res, 'query parameter "q" is required');
    const { skip, limit } = pagination(req);
    const page = await catalog.listForChannel(CHANNEL, { skip, limit, search: query });
    const items = await Promise.all(page.items.map(async (entry) => {
      return S.product(await decorate(entry));
    }));
    res.json(S.list(items, page.total));
  } catch (err) { next(err); }
});

router.get('/products/:id', read, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return unprocessable(res, 'product id must be a positive integer');
    }
    const mirror = await BillzProduct().findOne({ medicalkaId: id }).lean();
    if (!mirror) return notFound(res, `Product ${id} not found`);

    const entry = await catalog.findForChannel(CHANNEL, mirror.billzProductId);
    if (!entry) return notFound(res, `Product ${id} not found`);

    res.json(S.product({ ...entry, medicalkaId: id, price: catalog.priceFor(entry.card, CHANNEL) }));
  } catch (err) { next(err); }
});

// ── Stock ───────────────────────────────────────────────────────────────────
// Only products actually in stock appear here; their guide states that anything
// missing from the list is simply unavailable, which is why is_available is
// constant true.
router.get('/inventory', read, async (req, res, next) => {
  try {
    const { skip, limit } = pagination(req);
    const page = await catalog.listForChannel(CHANNEL, { skip: 0, limit: Number.MAX_SAFE_INTEGER });
    const inStock = page.items.filter(({ card, mirror }) =>
      catalog.isAvailable(card, mirror, CHANNEL));

    const window = inStock.slice(skip, skip + limit);
    const items = await Promise.all(window.map(async (entry) => {
      const decorated = await decorate(entry);
      return S.inventoryRow({
        pharmacyId: PHARMACY_ID,
        medicalkaId: decorated.medicalkaId,
        quantity: catalog.publishedQuantity(entry.card, entry.mirror, CHANNEL),
        price: decorated.price,
      });
    }));
    res.json(S.list(items, inStock.length));
  } catch (err) { next(err); }
});

// A product with no stock answers 404 — their client wraps this into `None`
// so integrators do not have to catch an exception per missing product.
router.get('/stock', read, async (req, res, next) => {
  try {
    const productId = Number(req.query.product_id);
    if (!Number.isInteger(productId) || productId <= 0) {
      return unprocessable(res, 'query parameter "product_id" must be a positive integer');
    }
    // A malformed id is a bad parameter (422); a well-formed one we do not have
    // is a missing object (404). Answering 404 for both told an integrator the
    // pharmacy was gone when they had simply sent nonsense.
    let pharmacyId = PHARMACY_ID;
    if (req.query.pharmacy_id !== undefined) {
      pharmacyId = Number(req.query.pharmacy_id);
      if (!Number.isInteger(pharmacyId) || pharmacyId <= 0) {
        return unprocessable(res, 'query parameter "pharmacy_id" must be a positive integer');
      }
    }
    if (pharmacyId !== PHARMACY_ID) {
      return notFound(res, `Pharmacy ${pharmacyId} not found`);
    }

    const mirror = await BillzProduct().findOne({ medicalkaId: productId }).lean();
    if (!mirror) return notFound(res, `Product ${productId} not found`);

    const entry = await catalog.findForChannel(CHANNEL, mirror.billzProductId);
    if (!entry || !catalog.isAvailable(entry.card, entry.mirror, CHANNEL)) {
      return notFound(res, `Product ${productId} is not in stock`);
    }

    res.json(S.inventoryRow({
      pharmacyId: PHARMACY_ID,
      medicalkaId: productId,
      quantity: catalog.publishedQuantity(entry.card, entry.mirror, CHANNEL),
      price: catalog.priceFor(entry.card, CHANNEL),
    }));
  } catch (err) { next(err); }
});

// ── Orders ──────────────────────────────────────────────────────────────────
const write = [requireKey('secret'), channelLimiter];

/**
 * Their status vocabulary, mapped to what it means for stock.
 *
 * `received` and `accepted` are acknowledgements that change nothing on our
 * side — the reservation is already made when the order arrives.
 */
const STATUS_ACTIONS = {
  paid: 'sell',
  payment_confirmed: 'sell',
  cancelled: 'cancel',
  cancelled_by_buyer: 'cancel',
};

/**
 * Validates and normalises an incoming order.
 *
 * Prices come from our own catalogue, never from the request. A marketplace
 * sending a price we did not set would otherwise decide what we are paid, and
 * a stale one on their side would quietly sell below cost.
 */
async function readOrderBody(body) {
  const externalId = String(body?.order_id || '').trim();
  if (!externalId) return { error: 'order_id is required' };

  const rawItems = Array.isArray(body?.items) ? body.items : [];
  if (!rawItems.length) return { error: 'items must contain at least one product' };

  const items = [];
  for (const raw of rawItems) {
    const productId = Number(raw?.product_id);
    const quantity = Number(raw?.quantity);
    if (!Number.isInteger(productId) || productId <= 0) {
      return { error: `invalid product_id: ${raw?.product_id}` };
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return { error: `invalid quantity for product ${productId}` };
    }

    const mirror = await BillzProduct().findOne({ medicalkaId: productId }).lean();
    if (!mirror) return { error: `product ${productId} not found`, status: 404 };

    const entry = await catalog.findForChannel(CHANNEL, mirror.billzProductId);
    if (!entry) return { error: `product ${productId} is not available`, status: 404 };

    items.push({
      billzProductId: mirror.billzProductId,
      name: entry.card.name || mirror.name,
      quantity,
      unitPrice: catalog.priceFor(entry.card, CHANNEL),
    });
  }

  return {
    externalId,
    items,
    customer: {
      name: [body?.customer?.first_name, body?.customer?.last_name].filter(Boolean).join(' '),
      phone: String(body?.customer?.phone || ''),
      address: String(body?.delivery_address || ''),
    },
  };
}

router.post('/orders', write, async (req, res, next) => {
  try {
    const parsed = await readOrderBody(req.body);
    if (parsed.error) {
      return parsed.status === 404
        ? notFound(res, parsed.error)
        : unprocessable(res, parsed.error);
    }

    const { order, created } = await orders.acceptOrder(CHANNEL, {
      externalId: parsed.externalId,
      items: parsed.items,
      customer: parsed.customer,
      raw: req.body,
    });

    // Answer before touching Billz. A resend gets the same answer as the
    // original, which is what stops one customer order becoming two sales.
    res.json({ wc_order_id: order.internalOrderId, status: 'received' });

    if (created) {
      orders.reserveOrder(order.internalOrderId)
        .catch((err) => {
          // Already recorded on the order as `failed`; an operator retries from
          // the panel. Rejecting the request instead would make the marketplace
          // resend an order we have in fact accepted.
          logger.error('reservation failed after accepting order', {
            internalOrderId: order.internalOrderId, err,
          });
        })
        // Announced either way: a reservation that failed is precisely what an
        // operator needs to see, and the card carries the reason.
        .finally(() => notify.announceOrder(CHANNEL, parsed.externalId)
          .catch((err) => logger.warn('order announcement failed', { err })));
    }
  } catch (err) { next(err); }
});

router.post('/orders/:orderId/status', write, async (req, res, next) => {
  try {
    const status = String(req.body?.status || '').trim();
    const action = STATUS_ACTIONS[status];
    if (!action && !['received', 'accepted'].includes(status)) {
      return unprocessable(res, `unknown status "${status}"`);
    }

    const order = await ChannelOrder()
      .findOne({ channel: CHANNEL, internalOrderId: req.params.orderId })
      .lean();
    if (!order) return notFound(res, `Order ${req.params.orderId} not found`);

    try {
      if (action === 'sell') await orders.completeOrder(order.internalOrderId);
      if (action === 'cancel') await orders.cancelOrder(order.internalOrderId, { reason: status });
    } catch (err) {
      // A refused transition is a client error — telling them 200 would leave
      // both sides believing different things about the same order.
      logger.warn('channel status change refused', { orderId: order.internalOrderId, status, err });
      return unprocessable(res, err.message);
    }

    const fresh = await ChannelOrder().findOne({ internalOrderId: order.internalOrderId }).lean();
    res.json({ wc_order_id: fresh.internalOrderId, status: fresh.status });

    // Edits the existing card rather than posting again, so one order stays one
    // message in the channel.
    notify.announceOrder(CHANNEL, fresh.externalId)
      .catch((err) => logger.warn('order announcement failed', { err }));
  } catch (err) { next(err); }
});

// Anything else under this prefix is a client mistake, not a server fault.
router.use((req, res) => {
  res.status(404).json({ detail: `Unknown endpoint ${req.method} ${req.baseUrl}${req.path}` });
});

module.exports = router;
module.exports.PHARMACY_ID = PHARMACY_ID;
