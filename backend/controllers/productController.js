const Product = require('../models/Product');
const Order = require('../models/Order');
const { sendError } = require('../utils/http');
const {
  LISTED, PUBLIC_SELECT, PUBLIC_PROJECTION, toPublicProduct, catalogFields,
} = require('../utils/publicProduct');
const { NEED_KEYS, KIND_KEYS } = require('../utils/catalog/taxonomy');
const { resolveBrand } = require('../utils/catalog/brands');

// The GET handlers below are public; see utils/publicProduct.js.

// The site loads the whole catalogue in one request and filters it locally.
const LIST_MAX = 1000;

const escapeRegex = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

exports.getAll = async (req, res) => {
  try {
    const { category, search, available } = req.query;
    const filter = { ...LISTED };

    if (category) filter.category = String(category);
    if (available !== undefined) filter.isAvailable = available === 'true';
    if (search) {
      // Typed by visitors: "C++" or "(" must search for themselves, not break the query.
      const pattern = escapeRegex(String(search).trim());
      filter.$or = [
        { name: { $regex: pattern, $options: 'i' } },
        { brand: { $regex: pattern, $options: 'i' } },
        { description: { $regex: pattern, $options: 'i' } },
      ];
    }
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || LIST_MAX, 1), LIST_MAX);

    const products = await Product.find(filter)
      .select(PUBLIC_SELECT)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    res.json({ success: true, data: products.map(toPublicProduct) });
  } catch (err) {
    sendError(res, 500, err);
  }
};

exports.getById = async (req, res) => {
  try {
    if (!/^[a-f0-9]{24}$/i.test(String(req.params.id))) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }
    const product = await Product.findOne({ _id: req.params.id, ...LISTED }).select(PUBLIC_SELECT).lean();
    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }
    res.json({ success: true, data: toPublicProduct(product) });
  } catch (err) {
    sendError(res, 500, err);
  }
};

exports.create = async (req, res) => {
  try {
    const product = await Product.create(req.body);
    res.status(201).json({ success: true, data: product });
  } catch (err) {
    sendError(res, 400, err);
  }
};

exports.update = async (req, res) => {
  try {
    const patch = { ...req.body };
    // Same rule as everywhere else availability is written by hand.
    if (patch.isAvailable !== undefined) patch.autoStock = false;
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      patch,
      { new: true, runValidators: true }
    );
    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }
    res.json({ success: true, data: product });
  } catch (err) {
    sendError(res, 400, err);
  }
};

exports.remove = async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }
    res.json({ success: true, message: 'Product deleted' });
  } catch (err) {
    sendError(res, 500, err);
  }
};

exports.toggleAvailability = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }
    product.isAvailable = !product.isAvailable;
    // A manual decision outranks Billz; see services/stockReconciler.js.
    product.autoStock = false;
    await product.save();
    res.json({
      success: true,
      data: product,
      message: product.isAvailable ? 'Товар в наличии (bor)' : 'Нет в наличии (yo\'q)',
    });
  } catch (err) {
    sendError(res, 500, err);
  }
};

/**
 * Top N most-ordered products. Aggregates over all orders (any status).
 * Falls back to the N most-recently-added available products when nothing
 * has been ordered yet. Order counts stay internal: only the products go out.
 */
exports.getPopular = async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 3, 1), 20);

    const aggregated = await Order.aggregate([
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.productId',
          totalQty: { $sum: '$items.quantity' },
          orderCount: { $sum: 1 },
        },
      },
      { $sort: { totalQty: -1, orderCount: -1 } },
      { $limit: limit },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'product',
        },
      },
      { $unwind: '$product' },
      { $match: { 'product.isAvailable': true, 'product.approved': LISTED.approved } },
      { $replaceRoot: { newRoot: '$product' } },
      { $project: PUBLIC_PROJECTION },
    ]);

    if (aggregated.length >= limit) {
      return res.json({ success: true, data: aggregated.map(toPublicProduct) });
    }

    // Fallback: top up with newest available products not already in the list.
    const existingIds = aggregated.map((p) => p._id);
    const needed = limit - aggregated.length;
    const filler = await Product.find({
      ...LISTED,
      isAvailable: true,
      _id: { $nin: existingIds },
    })
      .select(PUBLIC_SELECT)
      .sort({ createdAt: -1 })
      .limit(needed)
      .lean();

    return res.json({ success: true, data: [...aggregated, ...filler].map(toPublicProduct) });
  } catch (err) {
    sendError(res, 500, err);
  }
};

exports.getCategories = async (_req, res) => {
  try {
    const categories = await Product.distinct('category', LISTED);
    res.json({ success: true, data: categories });
  } catch (err) {
    sendError(res, 500, err);
  }
};

// The catalogue changes a few times a day; a minute of staleness is fine and
// spares a full scan on every page view.
const TAXONOMY_TTL_MS = 60 * 1000;
let taxonomyCache = null;

async function buildTaxonomy() {
  const products = await Product.find(LISTED).select(PUBLIC_SELECT).lean();
  const needs = new Map(NEED_KEYS.map((key) => [key, 0]));
  const kinds = new Map(KIND_KEYS.map((key) => [key, 0]));
  const brands = new Map();
  for (const product of products) {
    const fields = catalogFields(product);
    for (const need of fields.needs) needs.set(need, needs.get(need) + 1);
    if (kinds.has(fields.kind)) kinds.set(fields.kind, kinds.get(fields.kind) + 1);
    if (!fields.brandSlug) continue;
    const entry = brands.get(fields.brandSlug) || {
      slug: fields.brandSlug,
      name: fields.brandName,
      count: 0,
      country: resolveBrand(product).country,
    };
    entry.count += 1;
    brands.set(fields.brandSlug, entry);
  }
  return {
    total: products.length,
    needs: [...needs].map(([key, count]) => ({ key, count })),
    kinds: [...kinds].map(([key, count]) => ({ key, count })),
    brands: [...brands.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
  };
}

/** GET /api/products/taxonomy: goal, kind and brand counts over listed products. */
exports.getTaxonomy = async (_req, res) => {
  try {
    if (!taxonomyCache || Date.now() - taxonomyCache.at > TAXONOMY_TTL_MS) {
      taxonomyCache = { at: Date.now(), data: await buildTaxonomy() };
    }
    res.json({ success: true, data: taxonomyCache.data });
  } catch (err) {
    sendError(res, 500, err);
  }
};

exports._internal = {
  clearTaxonomyCache() {
    taxonomyCache = null;
  },
};
