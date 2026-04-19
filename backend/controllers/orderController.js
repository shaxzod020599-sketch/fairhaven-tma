const Order = require('../models/Order');
const User = require('../models/User');

exports.create = async (req, res) => {
  try {
    const { telegramId, items, totalAmount, location, customerName, customerPhone, notes } = req.body;

    let user = await User.findOne({ telegramId });
    if (!user) {
      user = await User.create({ telegramId, firstName: customerName, phone: customerPhone });
    }

    const order = await Order.create({
      userId: user._id,
      telegramId,
      items,
      totalAmount,
      location,
      customerName: customerName || user.firstName,
      customerPhone: customerPhone || user.phone,
      notes: notes || '',
    });

    res.status(201).json({ success: true, data: order });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

exports.getAll = async (req, res) => {
  try {
    const { status, telegramId } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (telegramId) filter.telegramId = Number(telegramId);

    const orders = await Order.find(filter)
      .populate('items.productId', 'name imageUrl')
      .sort({ createdAt: -1 });

    res.json({ success: true, data: orders });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.getById = async (req, res) => {
  try {
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
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status },
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
    const orders = await Order.find({ telegramId: Number(req.params.telegramId) })
      .sort({ createdAt: -1 });
    res.json({ success: true, data: orders });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
