const Product = require('../models/Product');
const Order = require('../models/Order');
const { sendError } = require('../utils/http');

exports.getAll = async (req, res) => {
  try {
    const { category, search, available } = req.query;
    const filter = {};

    if (category) filter.category = category;
    if (available !== undefined) filter.isAvailable = available === 'true';
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { brand: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    const products = await Product.find(filter).sort({ createdAt: -1 });
    res.json({ success: true, data: products });
  } catch (err) {
    sendError(res, 500, err);
  }
};

exports.getById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }
    res.json({ success: true, data: product });
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
 * has been ordered yet.
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
      { $match: { 'product.isAvailable': true } },
      {
        $replaceRoot: {
          newRoot: {
            $mergeObjects: [
              '$product',
              { orderCount: '$orderCount', totalQty: '$totalQty' },
            ],
          },
        },
      },
    ]);

    if (aggregated.length >= limit) {
      return res.json({ success: true, data: aggregated });
    }

    // Fallback: top up with newest available products not already in the list.
    const existingIds = aggregated.map((p) => p._id);
    const needed = limit - aggregated.length;
    const filler = await Product.find({
      isAvailable: true,
      _id: { $nin: existingIds },
    })
      .sort({ createdAt: -1 })
      .limit(needed);

    return res.json({ success: true, data: [...aggregated, ...filler] });
  } catch (err) {
    sendError(res, 500, err);
  }
};

exports.getCategories = async (_req, res) => {
  try {
    const categories = await Product.distinct('category');
    res.json({ success: true, data: categories });
  } catch (err) {
    sendError(res, 500, err);
  }
};
