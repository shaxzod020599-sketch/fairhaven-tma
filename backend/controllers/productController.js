const Product = require('../models/Product');
const { ensureObjectId, escapeRegex, pick } = require('../utils/validators');

const ALLOWED_PRODUCT_FIELDS = [
  'name',
  'nameUz',
  'price',
  'category',
  'imageUrl',
  'description',
  'descriptionUz',
  'isAvailable',
  'brand',
  'sku',
  'tags',
];

exports.getAll = async (req, res) => {
  try {
    const { category, search, available } = req.query;
    const filter = {};
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const skip = (page - 1) * limit;

    if (category) filter.category = category;
    if (available !== undefined) filter.isAvailable = available === 'true';
    if (search) {
      const safeSearch = escapeRegex(String(search).trim().slice(0, 80));
      if (safeSearch) {
        filter.$or = [
          { name: { $regex: safeSearch, $options: 'i' } },
          { brand: { $regex: safeSearch, $options: 'i' } },
          { description: { $regex: safeSearch, $options: 'i' } },
        ];
      }
    }

    const [products, total] = await Promise.all([
      Product.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Product.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: products,
      meta: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.getById = async (req, res) => {
  try {
    if (!ensureObjectId(req.params.id)) {
      return res.status(400).json({ success: false, error: 'Invalid product id' });
    }
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }
    res.json({ success: true, data: product });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.create = async (req, res) => {
  try {
    const payload = pick(req.body || {}, ALLOWED_PRODUCT_FIELDS);
    const product = await Product.create(payload);
    res.status(201).json({ success: true, data: product });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

exports.update = async (req, res) => {
  try {
    if (!ensureObjectId(req.params.id)) {
      return res.status(400).json({ success: false, error: 'Invalid product id' });
    }
    const payload = pick(req.body || {}, ALLOWED_PRODUCT_FIELDS);
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      payload,
      { new: true, runValidators: true }
    );
    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }
    res.json({ success: true, data: product });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

exports.remove = async (req, res) => {
  try {
    if (!ensureObjectId(req.params.id)) {
      return res.status(400).json({ success: false, error: 'Invalid product id' });
    }
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }
    res.json({ success: true, message: 'Product deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.toggleAvailability = async (req, res) => {
  try {
    if (!ensureObjectId(req.params.id)) {
      return res.status(400).json({ success: false, error: 'Invalid product id' });
    }
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }
    product.isAvailable = !product.isAvailable;
    await product.save();
    res.json({
      success: true,
      data: product,
      message: product.isAvailable ? 'Товар в наличии (bor)' : 'Нет в наличии (yo\'q)',
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.getCategories = async (_req, res) => {
  try {
    const categories = await Product.distinct('category');
    res.json({ success: true, data: categories });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
