const Order = require('../models/Order');
const User = require('../models/User');
const PromoCode = require('../models/PromoCode');

const FREE_DELIVERY_THRESHOLD = 500000;
const DELIVERY_FEE = 25000;

async function resolvePromo(code, subtotal, isFirstOrder, userPromosUsed) {
  if (!code) return { discount: 0, promo: null };
  const normalized = String(code).trim().toUpperCase();
  if (!normalized) return { discount: 0, promo: null };
  const promo = await PromoCode.findOne({ code: normalized });
  if (!promo || !promo.isCurrentlyActive()) {
    return { discount: 0, promo: null, error: 'invalid_promo' };
  }
  if (promo.firstOrderOnly && !isFirstOrder) {
    return { discount: 0, promo: null, error: 'first_order_only' };
  }
  if (promo.oncePerUser && (userPromosUsed || []).includes(normalized)) {
    return { discount: 0, promo: null, error: 'already_used' };
  }
  if (subtotal < (promo.minOrderAmount || 0)) {
    return { discount: 0, promo: null, error: 'min_order_not_met', minOrderAmount: promo.minOrderAmount };
  }
  const discount = promo.calculateDiscount(subtotal);
  return { discount, promo };
}

exports.create = async (req, res) => {
  try {
    const {
      telegramId,
      items,
      location,
      customerName,
      customerPhone,
      paymentMethod,
      notes,
      promoCode,
    } = req.body;

    if (!telegramId || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'telegramId and items are required',
      });
    }

    const user = await User.findOne({ telegramId });
    if (!user || user.registrationStep !== 'done' || !user.consentAccepted) {
      return res.status(403).json({
        success: false,
        error: 'registration_required',
        message:
          'Buyurtma berish uchun botda ro‘yxatdan o‘ting va ofertani qabul qiling. ' +
          'Для оформления заказа пройдите регистрацию в боте и примите оферту.',
      });
    }

    const previousOrders = await Order.countDocuments({ userId: user._id });
    const isFirstOrder = previousOrders === 0;

    const subtotal = items.reduce((sum, it) => sum + (Number(it.price) || 0) * (Number(it.quantity) || 0), 0);

    const promoResult = await resolvePromo(
      promoCode,
      subtotal,
      isFirstOrder,
      user.promoCodesUsed,
    );
    if (promoCode && promoResult.error) {
      return res.status(400).json({
        success: false,
        error: promoResult.error,
        message: 'Промокод недействителен',
      });
    }
    const discount = promoResult.discount;
    const appliedPromo = promoResult.promo;

    const deliveryFee = subtotal === 0 || subtotal >= FREE_DELIVERY_THRESHOLD ? 0 : DELIVERY_FEE;
    const totalAmount = Math.max(0, subtotal - discount + deliveryFee);

    const order = await Order.create({
      userId: user._id,
      telegramId,
      items,
      subtotal,
      deliveryFee,
      discount,
      promoCode: appliedPromo ? appliedPromo.code : '',
      totalAmount,
      isFirstOrder,
      location,
      customerName: customerName || [user.firstName, user.lastName].filter(Boolean).join(' '),
      customerPhone: customerPhone || user.phone,
      paymentMethod: paymentMethod === 'card' ? 'card' : 'cash',
      notes: notes || '',
    });

    if (appliedPromo) {
      appliedPromo.usedCount = (appliedPromo.usedCount || 0) + 1;
      await appliedPromo.save();
      if (appliedPromo.oncePerUser) {
        user.promoCodesUsed = Array.from(new Set([...(user.promoCodesUsed || []), appliedPromo.code]));
        await user.save();
      }
    }

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
      .populate('items.productId', 'name imageUrl images')
      .sort({ createdAt: -1 });

    res.json({ success: true, data: orders });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.getById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('items.productId', 'name imageUrl images price');
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

exports.cancelByCustomer = async (req, res) => {
  try {
    const telegramId = Number(req.body?.telegramId || req.query?.telegramId);
    if (!telegramId) {
      return res.status(400).json({ success: false, error: 'telegramId required' });
    }

    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }
    if (order.telegramId !== telegramId) {
      return res.status(403).json({ success: false, error: 'Not your order' });
    }
    if (order.status !== 'pending') {
      return res.status(409).json({
        success: false,
        error: 'already_processed',
        status: order.status,
      });
    }

    order.status = 'cancelled';
    await order.save();

    const bot = req.app.locals.bot;
    if (bot && typeof bot.markOrderCancelledByCustomer === 'function') {
      bot.markOrderCancelledByCustomer(order).catch((err) =>
        console.warn('[order.cancel] channel edit failed:', err.message)
      );
    }

    res.json({ success: true, data: order });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.validatePromo = async (req, res) => {
  try {
    const { code, subtotal = 0, telegramId } = req.body;
    if (!code) {
      return res.status(400).json({ success: false, error: 'code_required' });
    }
    const subtotalN = Number(subtotal) || 0;
    let isFirstOrder = true;
    let userPromosUsed = [];
    if (telegramId) {
      const user = await User.findOne({ telegramId: Number(telegramId) });
      if (user) {
        const prev = await Order.countDocuments({ userId: user._id });
        isFirstOrder = prev === 0;
        userPromosUsed = user.promoCodesUsed || [];
      }
    }
    const result = await resolvePromo(code, subtotalN, isFirstOrder, userPromosUsed);
    if (result.error || !result.promo) {
      return res.json({
        success: false,
        valid: false,
        error: result.error || 'invalid_promo',
        minOrderAmount: result.minOrderAmount || 0,
        message: messageForError(result.error),
      });
    }
    res.json({
      success: true,
      valid: true,
      data: {
        code: result.promo.code,
        discount: result.discount,
        discountType: result.promo.discountType,
        discountValue: result.promo.discountValue,
        description: result.promo.description,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

function messageForError(code) {
  switch (code) {
    case 'first_order_only': return 'Промокод действует только для первого заказа';
    case 'already_used': return 'Промокод уже использован';
    case 'min_order_not_met': return 'Сумма заказа меньше минимальной для этого промокода';
    case 'invalid_promo':
    default: return 'Промокод не найден или истёк';
  }
}
