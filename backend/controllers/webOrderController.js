const crypto = require('crypto');
const Order = require('../models/Order');
const Product = require('../models/Product');
const { sendError } = require('../utils/http');
const {
  resolvePromo,
  normalizeItems,
  normalizePhone,
  normalizeText,
  FREE_DELIVERY_THRESHOLD,
  DELIVERY_FEE,
  messageForError,
} = require('./orderController')._internal;

/**
 * Web checkout has no map picker — the address arrives as free text.
 * Coordinates are optional; when present they must be sane.
 */
function normalizeWebLocation(location) {
  const addressString = normalizeText(location?.addressString, 300);
  if (!addressString) return null;
  const lat = Number(location?.lat);
  const lng = Number(location?.lng);
  const hasCoords =
    Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 &&
    (lat !== 0 || lng !== 0);
  return { lat: hasCoords ? lat : 0, lng: hasCoords ? lng : 0, addressString };
}

async function loadTrustedItems(items) {
  const requested = normalizeItems(items);
  if (!requested) return null;
  const productIds = [...new Set(requested.map((item) => item.productId))];
  const products = await Product.find({ _id: { $in: productIds }, isAvailable: true });
  const productMap = new Map(products.map((p) => [p._id.toString(), p]));
  if (productMap.size !== productIds.length) return null;
  return requested.map((item) => {
    const product = productMap.get(item.productId);
    return {
      productId: product._id,
      name: product.name,
      price: Number(product.price),
      quantity: item.quantity,
    };
  });
}

async function forwardToChannel(req, order) {
  const bot = req.app.locals.bot;
  if (bot && typeof bot.forwardOrderToChannel === 'function') {
    try {
      const messageId = await bot.forwardOrderToChannel(order);
      if (messageId) {
        order.channelMessageId = messageId;
        await order.save();
      }
    } catch (fwdErr) {
      console.warn('[web-order] channel forward failed:', fwdErr.message);
    }
  }
}

function publicOrder(order) {
  const obj = order.toObject ? order.toObject() : order;
  delete obj.accessToken;
  return obj;
}

/**
 * POST /api/web/orders — site checkout.
 * Authenticated sessions (webAuthOptional) place a full user order that the
 * mini-app also sees; anonymous visitors go through the guest branch.
 * Prices always come from the DB — the client only sends ids + quantities.
 */
exports.create = async (req, res) => {
  try {
    const {
      items,
      location,
      customerName,
      customerPhone,
      email,
      paymentMethod,
      notes,
      promoCode,
    } = req.body;

    const trustedItems = await loadTrustedItems(items);
    if (!trustedItems) {
      return res.status(400).json({ success: false, error: 'invalid_items' });
    }

    const safeLocation = normalizeWebLocation(location);
    if (!safeLocation) {
      return res.status(400).json({ success: false, error: 'address_required' });
    }

    const user = req.webUser || null;
    const safePhone = normalizePhone(customerPhone || (user ? user.phone : ''));
    const safeName = normalizeText(
      customerName || (user ? [user.firstName, user.lastName].filter(Boolean).join(' ') : ''),
      120
    );
    if (!safeName || !safePhone) {
      return res.status(400).json({ success: false, error: 'guest_fields_required' });
    }

    const subtotal = trustedItems.reduce((sum, it) => sum + it.price * it.quantity, 0);

    let isFirstOrder = false;
    let promosUsed = [];
    if (user) {
      const previousOrders = await Order.countDocuments({ userId: user._id });
      isFirstOrder = previousOrders === 0;
      promosUsed = user.promoCodesUsed || [];
    }

    const promoResult = await resolvePromo(
      promoCode,
      subtotal,
      user ? isFirstOrder : true,
      promosUsed
    );
    if (promoCode && promoResult.error) {
      return res.status(400).json({
        success: false,
        error: promoResult.error,
        message: messageForError(promoResult.error),
      });
    }
    const discount = promoResult.discount;
    const appliedPromo = promoResult.promo;

    const deliveryFee =
      subtotal === 0 || subtotal >= FREE_DELIVERY_THRESHOLD ? 0 : DELIVERY_FEE;
    const totalAmount = Math.max(0, subtotal - discount + deliveryFee);

    const order = await Order.create({
      userId: user ? user._id : null,
      telegramId: user ? user.telegramId : null,
      email: normalizeText(email, 120),
      items: trustedItems,
      subtotal,
      deliveryFee,
      discount,
      promoCode: appliedPromo ? appliedPromo.code : '',
      totalAmount,
      isFirstOrder,
      location: safeLocation,
      customerName: safeName,
      customerPhone: safePhone,
      paymentMethod: paymentMethod === 'card' ? 'card' : 'cash',
      notes: normalizeText(notes, 500),
      source: user ? 'web' : 'web-guest',
      accessToken: crypto.randomBytes(16).toString('hex'),
    });

    if (appliedPromo) {
      appliedPromo.usedCount = (appliedPromo.usedCount || 0) + 1;
      await appliedPromo.save();
      if (user && appliedPromo.oncePerUser) {
        user.promoCodesUsed = Array.from(
          new Set([...(user.promoCodesUsed || []), appliedPromo.code])
        );
        await user.save();
      }
    }

    await forwardToChannel(req, order);

    const data = publicOrder(order);
    data.accessToken = order.accessToken; // returned once, to the creator only
    res.status(201).json({ success: true, data });
  } catch (err) {
    sendError(res, 400, err);
  }
};

/**
 * GET /api/web/orders/:id?t=<accessToken>
 * Success-page fetch. A session that owns the order also passes without t.
 */
exports.getById = async (req, res) => {
  try {
    if (!/^[a-f0-9]{24}$/i.test(req.params.id)) {
      return res.status(404).json({ success: false, error: 'order_not_found' });
    }
    const order = await Order.findById(req.params.id)
      .populate('items.productId', 'name imageUrl images price');
    if (!order) {
      return res.status(404).json({ success: false, error: 'order_not_found' });
    }

    const token = String(req.query.t || '');
    const ownsBySession =
      req.webUser && order.telegramId &&
      Number(order.telegramId) === Number(req.webUser.telegramId);
    // Compare digests so lengths always match for timingSafeEqual.
    const ownsByToken =
      Boolean(token && order.accessToken) &&
      crypto.timingSafeEqual(
        crypto.createHash('sha256').update(order.accessToken).digest(),
        crypto.createHash('sha256').update(token).digest()
      );

    if (!ownsBySession && !ownsByToken) {
      return res.status(403).json({ success: false, error: 'forbidden' });
    }
    res.json({ success: true, data: publicOrder(order) });
  } catch (err) {
    sendError(res, 500, err);
  }
};

/** GET /api/web/my/orders — session-scoped history. */
exports.myOrders = async (req, res) => {
  try {
    const orders = await Order.find({ telegramId: req.webUser.telegramId })
      .sort({ createdAt: -1 })
      .limit(50);
    res.json({ success: true, data: orders.map(publicOrder) });
  } catch (err) {
    sendError(res, 500, err);
  }
};

/** POST /api/web/promo/validate — promo check for the web cart. */
exports.validatePromo = async (req, res) => {
  try {
    const { code, subtotal = 0 } = req.body;
    if (!code) {
      return res.status(400).json({ success: false, error: 'code_required' });
    }
    const user = req.webUser || null;
    let isFirstOrder = true;
    let promosUsed = [];
    if (user) {
      const prev = await Order.countDocuments({ userId: user._id });
      isFirstOrder = prev === 0;
      promosUsed = user.promoCodesUsed || [];
    }
    const result = await resolvePromo(code, Number(subtotal) || 0, isFirstOrder, promosUsed);
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
