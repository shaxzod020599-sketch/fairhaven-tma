const User = require('../models/User');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Collection = require('../models/Collection');
const Setting = require('../models/Setting');
const PromoCode = require('../models/PromoCode');
const { resolveAdmin } = require('../middleware/adminAuth');

// ───────────────────────────────────────────────────────────────────────────
// whoami — lightweight check frontend uses to decide "admin UI or login?"
// ───────────────────────────────────────────────────────────────────────────
exports.whoami = async (req, res) => {
  const admin = await resolveAdmin(req);
  if (!admin) {
    return res.json({ success: true, data: { isAdmin: false } });
  }
  res.json({
    success: true,
    data: {
      isAdmin: true,
      telegramId: admin.telegramId,
      firstName: admin.firstName,
      lastName: admin.lastName,
      username: admin.username,
    },
  });
};

// ───────────────────────────────────────────────────────────────────────────
// Dashboard stats
// ───────────────────────────────────────────────────────────────────────────
exports.stats = async (_req, res) => {
  try {
    const [
      pendingOrders,
      confirmedOrders,
      cancelledOrders,
      totalOrders,
      totalProducts,
      availableProducts,
      totalAdmins,
      totalUsers,
      revenueAgg,
    ] = await Promise.all([
      Order.countDocuments({ status: 'pending' }),
      Order.countDocuments({ status: { $in: ['confirmed', 'preparing', 'delivering', 'delivered'] } }),
      Order.countDocuments({ status: 'cancelled' }),
      Order.countDocuments({}),
      Product.countDocuments({}),
      Product.countDocuments({ isAvailable: true }),
      User.countDocuments({ role: 'admin' }),
      User.countDocuments({ role: 'user', registrationStep: 'done' }),
      Order.aggregate([
        { $match: { status: { $in: ['confirmed', 'preparing', 'delivering', 'delivered'] } } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } },
      ]),
    ]);

    const revenue = revenueAgg[0]?.total || 0;

    res.json({
      success: true,
      data: {
        orders: {
          pending: pendingOrders,
          confirmed: confirmedOrders,
          cancelled: cancelledOrders,
          total: totalOrders,
        },
        products: {
          total: totalProducts,
          available: availableProducts,
          unavailable: totalProducts - availableProducts,
        },
        users: {
          admins: totalAdmins,
          customers: totalUsers,
        },
        revenue,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ───────────────────────────────────────────────────────────────────────────
// Orders — list, get, status updates, revert
// ───────────────────────────────────────────────────────────────────────────
exports.listOrders = async (req, res) => {
  try {
    const { bucket = 'all', search = '' } = req.query;
    const filter = {};

    if (bucket === 'active') {
      filter.status = 'pending';
    } else if (bucket === 'history') {
      filter.status = { $in: ['confirmed', 'preparing', 'delivering', 'delivered', 'cancelled'] };
    } else if (bucket === 'confirmed') {
      filter.status = { $in: ['confirmed', 'preparing', 'delivering', 'delivered'] };
    } else if (bucket === 'cancelled') {
      filter.status = 'cancelled';
    }

    if (search.trim()) {
      const s = search.trim();
      const or = [
        { customerName: { $regex: s, $options: 'i' } },
        { customerPhone: { $regex: s, $options: 'i' } },
      ];
      if (/^[0-9]+$/.test(s)) or.push({ telegramId: Number(s) });
      filter.$or = or;
    }

    const orders = await Order.find(filter).sort({ createdAt: -1 }).limit(500);
    res.json({ success: true, data: orders });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ['pending', 'confirmed', 'preparing', 'delivering', 'delivered', 'cancelled'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ success: false, error: 'invalid_status' });
    }

    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true, runValidators: true }
    );
    if (!order) return res.status(404).json({ success: false, error: 'not_found' });

    const bot = req.app.locals.bot;
    if (bot && bot.telegram && order.channelMessageId) {
      tryEditChannelCard(bot, order, req.admin).catch(() => {});
      tryNotifyCustomer(bot, order, status).catch(() => {});
    }

    res.json({ success: true, data: order });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

// Revert an already-finalised order back to pending. Lets admins re-approve.
exports.revertOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, error: 'not_found' });
    if (order.status === 'pending') {
      return res.status(409).json({ success: false, error: 'already_pending' });
    }

    order.status = 'pending';
    await order.save();

    const bot = req.app.locals.bot;
    if (bot && bot.telegram && order.channelMessageId) {
      tryRevertChannelCard(bot, order).catch(() => {});
    }

    res.json({ success: true, data: order });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

// ───────────────────────────────────────────────────────────────────────────
// Products — full CRUD
// ───────────────────────────────────────────────────────────────────────────
exports.listProducts = async (req, res) => {
  try {
    const { search = '', category, availability } = req.query;
    const filter = {};
    if (category) filter.category = category;
    if (availability === 'available') filter.isAvailable = true;
    if (availability === 'unavailable') filter.isAvailable = false;
    if (search.trim()) {
      const q = search.trim();
      filter.$or = [
        { name: { $regex: q, $options: 'i' } },
        { brand: { $regex: q, $options: 'i' } },
        { sku: { $regex: q, $options: 'i' } },
      ];
    }
    const products = await Product.find(filter).sort({ createdAt: -1 });
    res.json({ success: true, data: products });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.createProduct = async (req, res) => {
  try {
    const p = await Product.create(sanitizeProductBody(req.body));

    const bot = req.app.locals.bot;
    if (bot && typeof bot.broadcastNewProduct === 'function' && p.isAvailable) {
      bot.broadcastNewProduct(p).catch((err) =>
        console.warn('[product.create] broadcast failed:', err.message)
      );
    }

    res.status(201).json({ success: true, data: p });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

exports.updateProduct = async (req, res) => {
  try {
    const before = await Product.findById(req.params.id).lean();
    if (!before) return res.status(404).json({ success: false, error: 'not_found' });

    const p = await Product.findByIdAndUpdate(
      req.params.id,
      sanitizeProductBody(req.body),
      { new: true, runValidators: true }
    );

    const cameBackInStock = before.isAvailable === false && p.isAvailable === true;
    if (cameBackInStock) {
      const bot = req.app.locals.bot;
      if (bot && typeof bot.broadcastBackInStock === 'function') {
        bot.broadcastBackInStock(p).catch((err) =>
          console.warn('[product.update] back-in-stock broadcast failed:', err.message)
        );
      }
    }

    res.json({ success: true, data: p });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

exports.deleteProduct = async (req, res) => {
  try {
    const p = await Product.findByIdAndDelete(req.params.id);
    if (!p) return res.status(404).json({ success: false, error: 'not_found' });
    await Collection.updateMany(
      { productIds: p._id },
      { $pull: { productIds: p._id } }
    );
    res.json({ success: true, message: 'Удалено' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.toggleProductAvailability = async (req, res) => {
  try {
    const p = await Product.findById(req.params.id);
    if (!p) return res.status(404).json({ success: false, error: 'not_found' });
    const wasUnavailable = p.isAvailable === false;
    p.isAvailable = !p.isAvailable;
    await p.save();

    if (wasUnavailable && p.isAvailable) {
      const bot = req.app.locals.bot;
      if (bot && typeof bot.broadcastBackInStock === 'function') {
        bot.broadcastBackInStock(p).catch((err) =>
          console.warn('[product.toggle] back-in-stock broadcast failed:', err.message)
        );
      }
    }

    res.json({ success: true, data: p });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

function sanitizeProductBody(b = {}) {
  const out = {};
  const fields = [
    'name', 'nameUz', 'price', 'category', 'imageUrl', 'images',
    'description', 'descriptionUz', 'descriptionUzLat',
    'isAvailable', 'brand', 'sku', 'tags',
  ];
  for (const f of fields) if (b[f] !== undefined) out[f] = b[f];
  if (typeof out.tags === 'string') out.tags = out.tags.split(',').map((s) => s.trim()).filter(Boolean);
  if (out.price !== undefined) out.price = Number(out.price);
  if (Array.isArray(out.images)) {
    out.images = out.images.map((s) => String(s || '').trim()).filter(Boolean);
  }
  return out;
}

// ───────────────────────────────────────────────────────────────────────────
// Admins
// ───────────────────────────────────────────────────────────────────────────
exports.listAdmins = async (_req, res) => {
  try {
    const admins = await User.find({ role: 'admin' })
      .select('telegramId firstName lastName username phone createdAt')
      .sort({ createdAt: 1 });
    res.json({ success: true, data: admins });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.promoteAdmin = async (req, res) => {
  try {
    const telegramId = Number(req.body.telegramId);
    if (!telegramId) {
      return res.status(400).json({ success: false, error: 'telegramId required' });
    }
    let user = await User.findOne({ telegramId });
    if (!user) {
      // Stub user so the promotion lands even before first /start.
      user = await User.create({
        telegramId,
        role: 'admin',
        firstName: req.body.firstName || '',
        lastName: req.body.lastName || '',
        registrationStep: 'done',
        consentAccepted: true,
        consentAcceptedAt: new Date(),
      });
    } else {
      user.role = 'admin';
      await user.save();
    }
    res.json({ success: true, data: user });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

exports.demoteAdmin = async (req, res) => {
  try {
    const telegramId = Number(req.params.telegramId);
    if (telegramId === Number(req.admin.telegramId)) {
      return res.status(400).json({
        success: false,
        error: 'cannot_demote_self',
        message: 'Вы не можете снять себя',
      });
    }
    const adminCount = await User.countDocuments({ role: 'admin' });
    if (adminCount <= 1) {
      return res.status(400).json({
        success: false,
        error: 'last_admin',
        message: 'Нельзя снять последнего администратора',
      });
    }
    const user = await User.findOneAndUpdate(
      { telegramId },
      { role: 'user' },
      { new: true }
    );
    if (!user) return res.status(404).json({ success: false, error: 'not_found' });
    res.json({ success: true, data: user });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

// ───────────────────────────────────────────────────────────────────────────
// Collections (podborka)
// ───────────────────────────────────────────────────────────────────────────
exports.listCollections = async (_req, res) => {
  try {
    const items = await Collection.find({})
      .populate('productIds', 'name imageUrl price isAvailable')
      .sort({ sortOrder: 1, createdAt: 1 });
    res.json({ success: true, data: items });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.createCollection = async (req, res) => {
  try {
    const c = await Collection.create(sanitizeCollectionBody(req.body));
    res.status(201).json({ success: true, data: c });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

exports.updateCollection = async (req, res) => {
  try {
    const c = await Collection.findByIdAndUpdate(
      req.params.id,
      sanitizeCollectionBody(req.body),
      { new: true, runValidators: true }
    );
    if (!c) return res.status(404).json({ success: false, error: 'not_found' });
    res.json({ success: true, data: c });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

exports.deleteCollection = async (req, res) => {
  try {
    const c = await Collection.findByIdAndDelete(req.params.id);
    if (!c) return res.status(404).json({ success: false, error: 'not_found' });
    res.json({ success: true, message: 'Удалено' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

function sanitizeCollectionBody(b = {}) {
  const out = {};
  const fields = ['name', 'eyebrow', 'description', 'tone', 'imageUrl', 'art', 'productIds', 'sortOrder', 'visible'];
  for (const f of fields) if (b[f] !== undefined) out[f] = b[f];
  return out;
}

// ───────────────────────────────────────────────────────────────────────────
// Settings (support phone, delivery threshold, etc.)
// ───────────────────────────────────────────────────────────────────────────
exports.listSettings = async (_req, res) => {
  try {
    const items = await Setting.find({}).sort({ key: 1 });
    res.json({ success: true, data: items });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.upsertSetting = async (req, res) => {
  try {
    const { key, value, label } = req.body;
    if (!key) return res.status(400).json({ success: false, error: 'key required' });
    const s = await Setting.findOneAndUpdate(
      { key },
      { value, label },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.json({ success: true, data: s });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

exports.deleteSetting = async (req, res) => {
  try {
    await Setting.deleteOne({ key: req.params.key });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ───────────────────────────────────────────────────────────────────────────
// Helpers for bot side-effects
// ───────────────────────────────────────────────────────────────────────────
async function tryEditChannelCard(bot, order, actor) {
  const { formatOrderReceipt } = require('../utils/helpers');
  const ORDERS_CHANNEL_ID = process.env.ORDERS_CHANNEL_ID || '-1003939788373';
  const verdictMap = {
    confirmed: `\n\n✅ <b>Подтверждено</b> (админ-панель${actor ? ' · ' + (actor.firstName || actor.username || '') : ''})`,
    cancelled: `\n\n❌ <b>Отклонено</b> (админ-панель${actor ? ' · ' + (actor.firstName || actor.username || '') : ''})`,
    preparing: `\n\n📦 <b>В сборке</b>`,
    delivering: `\n\n🚚 <b>В доставке</b>`,
    delivered: `\n\n🏠 <b>Доставлено</b>`,
    pending: `\n\n⏳ <b>Возвращено в ожидание</b>`,
  };
  const verdict = verdictMap[order.status] || '';
  try {
    await bot.telegram.editMessageText(
      ORDERS_CHANNEL_ID,
      order.channelMessageId,
      null,
      formatOrderReceipt(order) + verdict,
      { parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: { inline_keyboard: [] } }
    );
  } catch (err) {
    try {
      await bot.telegram.editMessageReplyMarkup(
        ORDERS_CHANNEL_ID,
        order.channelMessageId,
        null,
        { inline_keyboard: [] }
      );
    } catch (_) {}
  }
}

async function tryRevertChannelCard(bot, order) {
  const { formatOrderReceipt } = require('../utils/helpers');
  const ORDERS_CHANNEL_ID = process.env.ORDERS_CHANNEL_ID || '-1003939788373';
  const keyboard = {
    inline_keyboard: [
      [
        { text: '✅ Tasdiqlash / Подтвердить', callback_data: `order:approve:${order._id}` },
        { text: '❌ Rad etish / Отклонить',   callback_data: `order:reject:${order._id}` },
      ],
    ],
  };
  try {
    await bot.telegram.editMessageText(
      ORDERS_CHANNEL_ID,
      order.channelMessageId,
      null,
      formatOrderReceipt(order),
      { parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: keyboard }
    );
  } catch (_) {
    try {
      await bot.telegram.editMessageReplyMarkup(
        ORDERS_CHANNEL_ID,
        order.channelMessageId,
        null,
        keyboard
      );
    } catch (_) {}
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Promo codes — full CRUD
// ───────────────────────────────────────────────────────────────────────────
exports.listPromos = async (_req, res) => {
  try {
    const items = await PromoCode.find({}).sort({ createdAt: -1 });
    const augmented = items.map((p) => ({
      ...p.toObject(),
      currentlyActive: p.isCurrentlyActive(),
    }));
    res.json({ success: true, data: augmented });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.createPromo = async (req, res) => {
  try {
    const body = sanitizePromoBody(req.body);
    if (!body.code) return res.status(400).json({ success: false, error: 'code_required' });
    if (!body.discountValue) return res.status(400).json({ success: false, error: 'discount_required' });
    const existing = await PromoCode.findOne({ code: body.code });
    if (existing) {
      return res.status(409).json({ success: false, error: 'duplicate_code', message: 'Промокод с таким кодом уже существует' });
    }
    const p = await PromoCode.create(body);
    res.status(201).json({ success: true, data: p });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

exports.updatePromo = async (req, res) => {
  try {
    const body = sanitizePromoBody(req.body);
    const p = await PromoCode.findByIdAndUpdate(
      req.params.id,
      body,
      { new: true, runValidators: true }
    );
    if (!p) return res.status(404).json({ success: false, error: 'not_found' });
    res.json({ success: true, data: p });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

exports.deletePromo = async (req, res) => {
  try {
    const p = await PromoCode.findByIdAndDelete(req.params.id);
    if (!p) return res.status(404).json({ success: false, error: 'not_found' });
    res.json({ success: true, message: 'Удалено' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.togglePromo = async (req, res) => {
  try {
    const p = await PromoCode.findById(req.params.id);
    if (!p) return res.status(404).json({ success: false, error: 'not_found' });
    p.isActive = !p.isActive;
    await p.save();
    res.json({ success: true, data: p });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

function sanitizePromoBody(b = {}) {
  const out = {};
  const fields = [
    'code', 'description', 'discountType', 'discountValue',
    'minOrderAmount', 'maxDiscount', 'firstOrderOnly', 'oncePerUser',
    'maxUses', 'isActive', 'startsAt', 'expiresAt',
  ];
  for (const f of fields) if (b[f] !== undefined) out[f] = b[f];
  if (out.code) out.code = String(out.code).trim().toUpperCase();
  ['discountValue', 'minOrderAmount', 'maxDiscount', 'maxUses'].forEach((k) => {
    if (out[k] !== undefined) out[k] = Number(out[k]) || 0;
  });
  ['firstOrderOnly', 'oncePerUser', 'isActive'].forEach((k) => {
    if (out[k] !== undefined) out[k] = !!out[k];
  });
  ['startsAt', 'expiresAt'].forEach((k) => {
    if (out[k] === '' || out[k] === null) out[k] = null;
    else if (out[k] !== undefined) out[k] = new Date(out[k]);
  });
  return out;
}

async function tryNotifyCustomer(bot, order, status) {
  const shortId = order._id.toString().slice(-6).toUpperCase();
  let text = '';
  if (status === 'confirmed') {
    text =
      `✅ <b>Ваш заказ принят!</b>\n\n📋 Номер заказа: <b>#${shortId}</b>\n\n` +
      `Мы приняли ваш заказ и скоро доставим его вам. Курьер свяжется с вами по указанному номеру.\n\nСпасибо, что выбрали FairHaven Health. 🌿`;
  } else if (status === 'cancelled') {
    text =
      `❌ <b>Заказ отменён</b>\n\n📋 Номер заказа: <b>#${shortId}</b>\n\n` +
      `К сожалению, оператор не смог принять этот заказ. Для уточнения обратитесь в контакт-центр:\n📞 ${process.env.SUPPORT_PHONE || '+998 78 150 04 40'}`;
  } else if (status === 'delivering') {
    text = `🚚 <b>Ваш заказ #${shortId} в пути</b>\n\nКурьер свяжется с вами в ближайшее время.`;
  } else if (status === 'delivered') {
    text = `🏠 <b>Заказ #${shortId} доставлен</b>\n\nСпасибо, что выбрали FairHaven Health. Будем рады видеть вас снова! 🌿`;
  } else {
    return;
  }
  try {
    await bot.telegram.sendMessage(order.telegramId, text, { parse_mode: 'HTML' });
  } catch (_) {}
}
