const Order = require('../models/Order');
const User = require('../models/User');
const Product = require('../models/Product');
const PromoCode = require('../models/PromoCode');
const { errorLabel, sendError } = require('../utils/http');

const FREE_DELIVERY_THRESHOLD = 500000;
const DELIVERY_FEE = 25000;
const MAX_ORDER_ITEMS = 50;
const MAX_ITEM_QUANTITY = 100;

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
      items,
      location,
      customerName,
      customerPhone,
      paymentMethod,
      notes,
      promoCode,
    } = req.body;

    const telegramId = req.telegramUser.id;
    const requestedItems = normalizeItems(items);
    if (!requestedItems) {
      return res.status(400).json({
        success: false,
        error: 'invalid_items',
      });
    }
    const safeLocation = normalizeLocation(location);
    const safePhone = normalizePhone(customerPhone || '');
    if (!safeLocation || (customerPhone && !safePhone)) {
      return res.status(400).json({ success: false, error: 'invalid_order_details' });
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

    const productIds = [...new Set(requestedItems.map((item) => item.productId))];
    const products = await Product.find({
      _id: { $in: productIds },
      isAvailable: true,
    });
    const productMap = new Map(products.map((product) => [product._id.toString(), product]));
    if (productMap.size !== productIds.length) {
      return res.status(400).json({ success: false, error: 'unavailable_product' });
    }
    const trustedItems = requestedItems.map((item) => {
      const product = productMap.get(item.productId);
      return {
        productId: product._id,
        name: product.name,
        price: Number(product.price),
        quantity: item.quantity,
      };
    });
    const subtotal = trustedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

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
      items: trustedItems,
      subtotal,
      deliveryFee,
      discount,
      promoCode: appliedPromo ? appliedPromo.code : '',
      totalAmount,
      isFirstOrder,
      location: safeLocation,
      customerName: normalizeText(
        customerName || [user.firstName, user.lastName].filter(Boolean).join(' '),
        120
      ),
      customerPhone: safePhone || normalizePhone(user.phone || ''),
      paymentMethod: paymentMethod === 'card' ? 'card' : 'cash',
      notes: normalizeText(notes, 500),
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
    sendError(res, 400, err);
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
    sendError(res, 500, err);
  }
};

exports.getById = async (req, res) => {
  try {
    const order = await Order.findOne({
      _id: req.params.id,
      telegramId: req.telegramUser.id,
    })
      .populate('items.productId', 'name imageUrl images price');
    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }
    res.json({ success: true, data: order });
  } catch (err) {
    sendError(res, 500, err);
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
    sendError(res, 400, err);
  }
};

exports.getByUser = async (req, res) => {
  try {
    const orders = await Order.find({ telegramId: req.telegramUser.id })
      .sort({ createdAt: -1 });
    res.json({ success: true, data: orders });
  } catch (err) {
    sendError(res, 500, err);
  }
};

exports.cancelByCustomer = async (req, res) => {
  try {
    const telegramId = req.telegramUser.id;

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
        console.warn('[order.cancel] channel edit failed:', errorLabel(err))
      );
    }

    res.json({ success: true, data: order });
  } catch (err) {
    sendError(res, 500, err);
  }
};

exports.validatePromo = async (req, res) => {
  try {
    const { code, subtotal = 0 } = req.body;
    const telegramId = req.telegramUser.id;
    if (!code) {
      return res.status(400).json({ success: false, error: 'code_required' });
    }
    const subtotalN = Number(subtotal) || 0;
    let isFirstOrder = true;
    let userPromosUsed = [];
    const user = await User.findOne({ telegramId });
    if (user) {
      const prev = await Order.countDocuments({ userId: user._id });
      isFirstOrder = prev === 0;
      userPromosUsed = user.promoCodesUsed || [];
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
    sendError(res, 500, err);
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

function normalizeItems(items) {
  if (!Array.isArray(items) || items.length === 0 || items.length > MAX_ORDER_ITEMS) {
    return null;
  }
  const normalized = [];
  for (const item of items) {
    const productId = String(item?.productId || '').trim();
    const quantity = Number(item?.quantity);
    if (
      !/^[a-f0-9]{24}$/i.test(productId) ||
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      quantity > MAX_ITEM_QUANTITY
    ) {
      return null;
    }
    normalized.push({ productId, quantity });
  }
  return normalized;
}

function normalizeLocation(location) {
  const lat = Number(location?.lat);
  const lng = Number(location?.lng);
  const addressString = normalizeText(location?.addressString, 300);
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180 ||
    !addressString
  ) {
    return null;
  }
  return { lat, lng, addressString };
}

function normalizePhone(phone) {
  const text = normalizeText(phone, 32);
  const digits = text.replace(/\D/g, '');
  return digits.length >= 9 && digits.length <= 15 ? text : '';
}

function normalizeText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}
