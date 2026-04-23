const Order = require('../models/Order');
const User = require('../models/User');

exports.create = async (req, res) => {
  try {
    const {
      telegramId,
      items,
      totalAmount,
      location,
      customerName,
      customerPhone,
      paymentMethod,
      notes,
    } = req.body;

    if (!telegramId || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'telegramId and items are required',
      });
    }

    const user = await User.findOne({ telegramId });
    // Only registered users (bot wizard completed + consent accepted) can order.
    if (!user || user.registrationStep !== 'done' || !user.consentAccepted) {
      return res.status(403).json({
        success: false,
        error: 'registration_required',
        message:
          'Buyurtma berish uchun botda ro‘yxatdan o‘ting va ofertani qabul qiling. ' +
          'Для оформления заказа пройдите регистрацию в боте и примите оферту.',
      });
    }

    const order = await Order.create({
      userId: user._id,
      telegramId,
      items,
      totalAmount,
      location,
      customerName: customerName || [user.firstName, user.lastName].filter(Boolean).join(' '),
      customerPhone: customerPhone || user.phone,
      paymentMethod: paymentMethod === 'card' ? 'card' : 'cash',
      notes: notes || '',
    });

    // Forward the order to the FairHaven operators channel.
    // Failure to forward is non-fatal — the order is still persisted.
    const bot = req.app.locals.bot;
    if (bot && typeof bot.forwardOrderToChannel === 'function') {
      try {
        const messageId = await bot.forwardOrderToChannel(order);
        if (messageId) {
          order.channelMessageId = messageId;
          await order.save();
        }
      } catch (fwdErr) {
        console.warn('[order] channel forward failed:', fwdErr.message);
      }
    }

    res.status(201).json({ success: true, data: order });
  } catch (err) {
    console.error('[order.create]', err);
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
