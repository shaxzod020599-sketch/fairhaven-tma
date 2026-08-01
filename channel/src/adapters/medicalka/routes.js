const express = require('express');
const config = require('../../config');
const catalog = require('../../core/catalog');
const BillzProduct = require('../../models/BillzProduct');
const ProductCard = require('../../models/ProductCard');
const { requireKey, CHANNEL } = require('./auth');
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

const read = requireKey('token');

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
        quantity: catalog.sellableStock(entry.card, entry.mirror, CHANNEL),
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
    const pharmacyId = req.query.pharmacy_id === undefined
      ? PHARMACY_ID
      : Number(req.query.pharmacy_id);
    if (pharmacyId !== PHARMACY_ID) {
      return notFound(res, `Pharmacy ${req.query.pharmacy_id} not found`);
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
      quantity: catalog.sellableStock(entry.card, entry.mirror, CHANNEL),
      price: catalog.priceFor(entry.card, CHANNEL),
    }));
  } catch (err) { next(err); }
});

// ── Orders ──────────────────────────────────────────────────────────────────
// Submission lands in the next step, together with the Billz reservation flow.
// Answering 501 with a readable reason beats a 404 that looks like a wrong URL.
const write = requireKey('secret');

router.post('/orders', write, (_req, res) => {
  res.status(501).json({ detail: 'Order submission is not enabled yet' });
});

router.post('/orders/:orderId/status', write, (_req, res) => {
  res.status(501).json({ detail: 'Order status updates are not enabled yet' });
});

// Anything else under this prefix is a client mistake, not a server fault.
router.use((req, res) => {
  res.status(404).json({ detail: `Unknown endpoint ${req.method} ${req.baseUrl}${req.path}` });
});

module.exports = router;
module.exports.PHARMACY_ID = PHARMACY_ID;
