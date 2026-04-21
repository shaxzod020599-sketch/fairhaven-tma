const Order = require('../models/Order');
const User = require('../models/User');
const { buildOrderData } = require('../utils/orderPayload');
const { ensureObjectId, parseTelegramId } = require('../utils/validators');

const ALLOWED_STATUSES = new Set(['pending', 'confirmed', 'preparing', 'delivering', 'delivered', 'cancelled']);

exports.create = async (req, res) => {
  try {
    const telegramId = parseTelegramId(req.body.telegramId);
    if (!telegramId) {
      return res.status(400).json({ success: false, error: 'Invalid telegramId' });
    }

    const orderData = await buildOrderData({
      items: req.body.items,
      location: req.body.location,
      customerName: req.body.customerName,
      customerPhone: req.body.customerPhone,
      notes: req.body.notes,
    });

    let user = await User.findOne({ telegramId });
    if (!user) {
      user = await User.create({
        telegramId,
        firstName: orderData.customerName,
        phone: orderData.customerPhone,
      });
    }

    const order = await Order.create({
      userId: user._id,
      telegramId,
      items: orderData.items,
      totalAmount: orderData.totalAmount,
      location: orderData.location,
      customerName: orderData.customerName || user.firstName || '',
      customerPhone: orderData.customerPhone || user.phone || '',
      notes: orderData.notes || '',
    });

    res.status(201).json({ success: true, data: order });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

exports.getAll = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = {};
    const telegramId = req.query.telegramId ? parseTelegramId(req.query.telegramId) : null;
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const skip = (page - 1) * limit;

    if (status) {
      if (!ALLOWED_STATUSES.has(status)) {
        return res.status(400).json({ success: false, error: 'Invalid status filter' });
      }
      filter.status = status;
    }
    if (req.query.telegramId) {
      if (!telegramId) {
        return res.status(400).json({ success: false, error: 'Invalid telegramId filter' });
      }
      filter.telegramId = telegramId;
    }

    const orders = await Order.find(filter)
      .populate('items.productId', 'name imageUrl')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Order.countDocuments(filter);

    res.json({
      success: true,
      data: orders,
      meta: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.getById = async (req, res) => {
  try {
    if (!ensureObjectId(req.params.id)) {
      return res.status(400).json({ success: false, error: 'Invalid order id' });
    }
    const order = await Order.findById(req.params.id)
      .populate('items.productId', 'name imageUrl price');
    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }
    res.json({ success: true, data: order });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.updateStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const normalizedStatus = typeof status === 'string' ? status.trim() : '';
    if (!ensureObjectId(req.params.id)) {
      return res.status(400).json({ success: false, error: 'Invalid order id' });
    }
    if (!normalizedStatus || !ALLOWED_STATUSES.has(normalizedStatus)) {
      return res.status(400).json({ success: false, error: 'Invalid status' });
    }
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status: normalizedStatus },
      { new: true, runValidators: true }
    );
    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }
    res.json({ success: true, data: order });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

exports.getByUser = async (req, res) => {
  try {
    const telegramId = parseTelegramId(req.params.telegramId);
    if (!telegramId) {
      return res.status(400).json({ success: false, error: 'Invalid telegramId' });
    }
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const skip = (page - 1) * limit;

    const filter = { telegramId };
    const [orders, total] = await Promise.all([
      Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Order.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: orders,
      meta: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
