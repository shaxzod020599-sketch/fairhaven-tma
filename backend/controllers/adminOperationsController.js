const mongoose = require('mongoose');
const Order = require('../models/Order');
const User = require('../models/User');
const Product = require('../models/Product');
const PromoCode = require('../models/PromoCode');
const BillzProductView = require('../models/BillzProductView');
const AuditLog = require('../models/AuditLog');
const Broadcast = require('../models/Broadcast');
const workflow = require('../services/orderWorkflow');
const audit = require('../services/adminAudit');
const broadcastService = require('../services/broadcastService');
const salesAnalytics = require('./salesAnalyticsController');
const { parseAnalyticsQuery } = require('../utils/analyticsQuery');
const { errorLabel, sendError } = require('../utils/http');

/**
 * Operator endpoints the original panel never had: the order workbench
 * (detail, legal transitions, claim, notes), customer edit/block, the
 * period dashboard, global search, the audit feed and guarded broadcasts.
 *
 * Everything is additive — the legacy /orders/:id/status and /orders/:id/revert
 * contracts stay untouched for the old panel.
 */

const REVENUE_STATUSES = ['confirmed', 'preparing', 'delivering', 'delivered'];
const LOW_STOCK_THRESHOLD = 3;

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ───────────────────────────────────────────────────────────────────────────
// Order workbench
// ───────────────────────────────────────────────────────────────────────────

async function customerContext(order) {
  if (!order.telegramId) return null;
  const [user, ordersCount] = await Promise.all([
    User.findOne({ telegramId: order.telegramId })
      .select('telegramId firstName lastName username phone customerBlocked')
      .lean(),
    Order.countDocuments({ telegramId: order.telegramId }),
  ]);
  if (!user) return { telegramId: order.telegramId, ordersCount };
  return { ...user, ordersCount };
}

exports.getOrderDetail = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).lean();
    if (!order) return res.status(404).json({ success: false, error: 'not_found' });
    res.json({
      success: true,
      data: {
        order,
        actions: workflow.allowedTransitions(order.status),
        canRevert: order.status !== 'pending',
        customer: await customerContext(order),
      },
    });
  } catch (err) {
    sendError(res, 500, err);
  }
};

exports.transitionOrder = async (req, res) => {
  try {
    const { to, reason = '' } = req.body || {};
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, error: 'not_found' });

    const from = order.status;
    try {
      workflow.transition({ order, to, reason, admin: req.admin });
    } catch (err) {
      if (err.code) {
        return res.status(err.code === 'reason_required' ? 400 : 409).json({
          success: false,
          error: err.code,
          message: err.message,
          allowed: err.allowed,
        });
      }
      throw err;
    }
    await order.save();

    await audit.record({
      admin: req.admin,
      action: 'order.transition',
      entityType: 'order',
      entityId: order._id,
      summary: { from, to, reason: reason || undefined },
    });

    const bot = req.app.locals.bot;
    if (bot && bot.telegram) {
      const adminController = require('./adminController');
      if (order.channelMessageId) {
        adminController.tryEditChannelCard(bot, order, req.admin).catch((err) =>
          console.warn('[order.transition] channel edit failed:', errorLabel(err))
        );
      }
      adminController.tryNotifyCustomer(bot, order, to).catch((err) =>
        console.warn('[order.transition] customer notification failed:', errorLabel(err))
      );
    }

    res.json({
      success: true,
      data: { order: order.toObject(), actions: workflow.allowedTransitions(order.status) },
    });
  } catch (err) {
    sendError(res, 400, err);
  }
};

exports.addOrderNote = async (req, res) => {
  try {
    const text = String(req.body?.text || '').trim().slice(0, 2000);
    if (!text) return res.status(400).json({ success: false, error: 'text_required' });
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, error: 'not_found' });

    order.internalNotes.push({
      text,
      at: new Date(),
      by: audit.adminIdentity(req.admin),
    });
    await order.save();
    res.json({ success: true, data: { internalNotes: order.internalNotes } });
  } catch (err) {
    sendError(res, 400, err);
  }
};

exports.claimOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, error: 'not_found' });

    const me = audit.adminIdentity(req.admin);
    if (req.body?.release) {
      order.claimedBy = { telegramId: null, name: '' };
      order.claimedAt = null;
    } else {
      const holder = order.claimedBy?.telegramId;
      if (holder && holder !== me.telegramId) {
        return res.status(409).json({
          success: false,
          error: 'claimed_by_other',
          message: `Заказ уже взял ${order.claimedBy.name || holder}`,
          data: { claimedBy: order.claimedBy },
        });
      }
      order.claimedBy = me;
      order.claimedAt = new Date();
    }
    await order.save();
    res.json({ success: true, data: { claimedBy: order.claimedBy, claimedAt: order.claimedAt } });
  } catch (err) {
    sendError(res, 400, err);
  }
};

// ───────────────────────────────────────────────────────────────────────────
// Customers — edit + block
// ───────────────────────────────────────────────────────────────────────────

exports.updateCustomer = async (req, res) => {
  try {
    const telegramId = Number(req.params.telegramId);
    if (!telegramId) return res.status(400).json({ success: false, error: 'invalid_id' });

    const patch = {};
    for (const field of ['firstName', 'lastName', 'phone']) {
      if (req.body?.[field] !== undefined) patch[field] = String(req.body[field]).trim().slice(0, 120);
    }
    if (!Object.keys(patch).length) {
      return res.status(400).json({ success: false, error: 'nothing_to_update' });
    }

    const user = await User.findOneAndUpdate({ telegramId }, { $set: patch }, { new: true });
    if (!user) return res.status(404).json({ success: false, error: 'not_found' });
    res.json({ success: true, data: user });
  } catch (err) {
    sendError(res, 400, err);
  }
};

exports.blockCustomer = async (req, res) => {
  try {
    const telegramId = Number(req.params.telegramId);
    if (!telegramId) return res.status(400).json({ success: false, error: 'invalid_id' });
    const blocked = Boolean(req.body?.blocked);

    const user = await User.findOneAndUpdate(
      { telegramId },
      { $set: { customerBlocked: blocked } },
      { new: true }
    );
    if (!user) return res.status(404).json({ success: false, error: 'not_found' });

    await audit.record({
      admin: req.admin,
      action: blocked ? 'customer.block' : 'customer.unblock',
      entityType: 'user',
      entityId: telegramId,
      summary: { name: [user.firstName, user.lastName].filter(Boolean).join(' ') },
    });
    res.json({ success: true, data: user });
  } catch (err) {
    sendError(res, 400, err);
  }
};

// ───────────────────────────────────────────────────────────────────────────
// Dashboard — period metrics, revenue series, top products, risk panels
// ───────────────────────────────────────────────────────────────────────────

const PERIODS = { '1d': 1, '7d': 7, '30d': 30 };

function bucketKey(date, hourly) {
  const d = new Date(date);
  return hourly
    ? `${d.toISOString().slice(0, 13)}:00`
    : d.toISOString().slice(0, 10);
}

exports.dashboard = async (req, res) => {
  try {
    const period = PERIODS[req.query.period] ? req.query.period : '7d';
    const days = PERIODS[period];
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const hourly = period === '1d';

    const sourceQueries = ['fairhaven.uz', 'medicalka', 'uzum']
      .map((source) => parseAnalyticsQuery({ source, preset: period }));
    const [
      orders,
      pendingCount,
      conflictCount,
      conflictOrders,
      recentActivity,
      sources,
      billz,
    ] = await Promise.all([
      Order.find({ createdAt: { $gte: since } })
        .select('status totalAmount items createdAt')
        .limit(5000)
        .lean(),
      Order.countDocuments({ status: 'pending' }),
      Order.countDocuments({ 'billzSync.conflict': { $ne: '' } }),
      Order.find({ 'billzSync.conflict': { $ne: '' } })
        .select('_id status billzSync.conflict createdAt totalAmount customerName')
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
      AuditLog.find({}).sort({ createdAt: -1 }).limit(8).lean(),
      Promise.all(sourceQueries.map((query) => salesAnalytics.loadSourceSummary(query.source, query))),
      salesAnalytics.loadBillzState(),
    ]);

    const paid = orders.filter((o) => REVENUE_STATUSES.includes(o.status));
    const revenue = paid.reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0);
    const cancelled = orders.filter((o) => o.status === 'cancelled').length;

    // Revenue series: zero-filled buckets so the chart's x-axis is the period,
    // not just the days that happened to have sales.
    const buckets = new Map();
    const stepMs = hourly ? 3600_000 : 86_400_000;
    const start = hourly ? since.setMinutes(0, 0, 0) : since.setHours(0, 0, 0, 0);
    for (let t = start; t <= Date.now(); t += stepMs) {
      buckets.set(bucketKey(t, hourly), 0);
    }
    for (const order of paid) {
      const key = bucketKey(order.createdAt, hourly);
      buckets.set(key, (buckets.get(key) || 0) + (Number(order.totalAmount) || 0));
    }
    const series = [...buckets.entries()].map(([key, value]) => ({ key, value }));

    const productTotals = new Map();
    for (const order of paid) {
      for (const item of order.items || []) {
        const entry = productTotals.get(item.name) || { name: item.name, quantity: 0, amount: 0 };
        entry.quantity += Number(item.quantity) || 0;
        entry.amount += (Number(item.quantity) || 0) * (Number(item.price) || 0);
        productTotals.set(item.name, entry);
      }
    }
    const topProducts = [...productTotals.values()]
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    // Low stock: linked cards whose sellable remainder is at or under threshold.
    const lowMirror = await BillzProductView.find({
      deletedInBillz: false,
      $expr: {
        $lte: [
          { $subtract: [{ $ifNull: ['$stock', 0] }, { $add: [
            { $ifNull: ['$reservedQty', 0] }, { $ifNull: ['$pendingQty', 0] },
            ...['uzumSoldHolds', 'yandexSoldHolds'].map((field) => ({ $sum: { $map: {
              input: { $ifNull: [`$${field}`, []] }, as: 'hold', in: { $ifNull: ['$$hold.quantity', 0] },
            } } })),
          ] }] },
          LOW_STOCK_THRESHOLD,
        ],
      },
    }).select('billzProductId name stock reservedQty pendingQty uzumSoldHolds yandexSoldHolds').limit(50).lean();
    const lowIds = lowMirror.map((m) => m.billzProductId);
    const lowLinked = lowIds.length
      ? await Product.find({ billzProductId: { $in: lowIds } }).select('name billzProductId').limit(6).lean()
      : [];
    const mirrorById = new Map(lowMirror.map((m) => [m.billzProductId, m]));
    const lowStock = lowLinked.map((p) => {
      const m = mirrorById.get(p.billzProductId);
      const available = require('../services/stockReconciler').availableQuantity(m);
      return { productId: p._id, name: p.name, available };
    });

    const attention = [];
    if (billz.inventory?.freshness !== 'fresh') {
      attention.push({
        key: 'billz_inventory',
        tone: billz.inventory?.freshness === 'stale' ? 'warning' : 'danger',
        title: billz.inventory?.freshness === 'stale'
          ? 'Billz qoldiq ma’lumoti eskirgan'
          : 'Billz qoldiq ma’lumoti mavjud emas',
        destination: '/billz',
        freshness: billz.inventory?.freshness || 'unavailable',
        syncedAt: billz.inventory?.syncedAt || null,
      });
    }

    res.json({
      success: true,
      data: {
        period,
        metrics: {
          revenue,
          orders: orders.length,
          averageCheck: paid.length ? Math.round(revenue / paid.length) : 0,
          cancelled,
          pending: pendingCount,
        },
        series,
        topProducts,
        lowStock,
        conflicts: { count: conflictCount, orders: conflictOrders },
        sources,
        billz,
        attention,
        recentActivity,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    sendError(res, 500, err);
  }
};

// ───────────────────────────────────────────────────────────────────────────
// Global search — orders, customers, products, promos
// ───────────────────────────────────────────────────────────────────────────

exports.search = async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) {
      return res.json({ success: true, data: { orders: [], customers: [], products: [], promos: [] } });
    }
    const re = new RegExp(escapeRegex(q), 'i');
    const hexish = /^[0-9a-f]{4,24}$/i.test(q);

    const orderMatch = [
      { customerName: re },
      { customerPhone: re },
    ];
    if (/^\d+$/.test(q)) orderMatch.push({ telegramId: Number(q) });

    const [orders, customers, products, promos] = await Promise.all([
      Order.aggregate([
        { $addFields: { sid: { $toString: '$_id' } } },
        {
          $match: hexish
            ? { $or: [...orderMatch, { sid: { $regex: `${escapeRegex(q.toLowerCase())}$` } }] }
            : { $or: orderMatch },
        },
        { $sort: { createdAt: -1 } },
        { $limit: 5 },
        { $project: { status: 1, totalAmount: 1, customerName: 1, createdAt: 1 } },
      ]),
      User.find({
        $or: [
          { firstName: re }, { lastName: re }, { username: re }, { phone: re },
          ...(/^\d+$/.test(q) ? [{ telegramId: Number(q) }] : []),
        ],
      }).select('telegramId firstName lastName username phone role').limit(5).lean(),
      Product.find({ $or: [{ name: re }, { brand: re }, { sku: re }] })
        .select('name brand sku price isAvailable').limit(5).lean(),
      PromoCode.find({ code: new RegExp(escapeRegex(q), 'i') })
        .select('code discountType discountValue isActive').limit(5).lean(),
    ]);

    res.json({ success: true, data: { orders, customers, products, promos } });
  } catch (err) {
    sendError(res, 500, err);
  }
};

// ───────────────────────────────────────────────────────────────────────────
// Audit activity feed
// ───────────────────────────────────────────────────────────────────────────

exports.listActivity = async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
    const filter = {};
    if (req.query.action) filter.action = new RegExp(`^${escapeRegex(req.query.action)}`);

    const [items, total] = await Promise.all([
      AuditLog.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      AuditLog.countDocuments(filter),
    ]);
    res.json({ success: true, data: items, meta: { total, page, limit } });
  } catch (err) {
    sendError(res, 500, err);
  }
};

// ───────────────────────────────────────────────────────────────────────────
// Broadcasts — draft → tested → sending → completed|failed
// ───────────────────────────────────────────────────────────────────────────

exports.listBroadcasts = async (_req, res) => {
  try {
    const items = await Broadcast.find({}).sort({ createdAt: -1 }).limit(30).lean();
    res.json({ success: true, data: items });
  } catch (err) {
    sendError(res, 500, err);
  }
};

exports.previewBroadcast = async (req, res) => {
  try {
    const segment = String(req.body?.segment || 'all');
    const { count } = await broadcastService.resolveSegment(segment);
    res.json({
      success: true,
      data: { segment, count, capped: count > broadcastService.MAX_RECIPIENTS },
    });
  } catch (err) {
    if (err.code === 'invalid_segment') {
      return res.status(400).json({ success: false, error: 'invalid_segment' });
    }
    sendError(res, 500, err);
  }
};

exports.createBroadcast = async (req, res) => {
  try {
    const text = String(req.body?.text || '').trim();
    const segment = String(req.body?.segment || '');
    if (text.length < 5) return res.status(400).json({ success: false, error: 'text_too_short' });
    if (!['all', 'recent30', 'inactive90'].includes(segment)) {
      return res.status(400).json({ success: false, error: 'invalid_segment' });
    }
    const { count } = await broadcastService.resolveSegment(segment);
    const broadcast = await Broadcast.create({
      text: text.slice(0, 3500),
      segment,
      createdBy: audit.adminIdentity(req.admin),
      counts: { targets: count, sent: 0, failed: 0, skipped: 0 },
    });
    res.status(201).json({ success: true, data: broadcast });
  } catch (err) {
    sendError(res, 400, err);
  }
};

exports.testBroadcast = async (req, res) => {
  try {
    const broadcast = await Broadcast.findById(req.params.id);
    if (!broadcast) return res.status(404).json({ success: false, error: 'not_found' });
    if (!['draft', 'tested'].includes(broadcast.status)) {
      return res.status(409).json({ success: false, error: 'already_sent' });
    }

    const bot = req.app.locals.bot;
    if (!bot || !bot.telegram) {
      return res.status(503).json({ success: false, error: 'bot_unavailable' });
    }
    if (!req.admin?.telegramId) {
      return res.status(400).json({ success: false, error: 'admin_chat_unknown' });
    }

    await bot.telegram.sendMessage(
      req.admin.telegramId,
      `🧪 <b>Тест рассылки</b>\n\n${broadcast.text}`,
      { parse_mode: 'HTML' }
    );
    broadcast.status = 'tested';
    broadcast.testedAt = new Date();
    await broadcast.save();
    res.json({ success: true, data: broadcast });
  } catch (err) {
    sendError(res, 502, err, 'test_send_failed');
  }
};

exports.sendBroadcast = async (req, res) => {
  try {
    if (req.body?.confirm !== true) {
      return res.status(400).json({ success: false, error: 'confirmation_required' });
    }
    const bot = req.app.locals.bot;
    if (!bot || !bot.telegram) {
      return res.status(503).json({ success: false, error: 'bot_unavailable' });
    }

    // draft→sending must be atomic: two admins clicking "send" at once must
    // produce one run, and an untested draft must never slip through.
    const broadcast = await Broadcast.findOneAndUpdate(
      { _id: req.params.id, status: 'tested' },
      { $set: { status: 'sending', startedAt: new Date() } },
      { new: true }
    );
    if (!broadcast) {
      const existing = await Broadcast.findById(req.params.id).lean();
      if (!existing) return res.status(404).json({ success: false, error: 'not_found' });
      return res.status(409).json({
        success: false,
        error: existing.status === 'draft' ? 'test_required' : 'already_sent',
        message: existing.status === 'draft'
          ? 'Сначала отправьте тест себе — кнопка «Тест мне».'
          : 'Эта рассылка уже отправляется или завершена.',
      });
    }

    await audit.record({
      admin: req.admin,
      action: 'broadcast.send',
      entityType: 'broadcast',
      entityId: broadcast._id,
      summary: { segment: broadcast.segment, targets: broadcast.counts.targets },
    });

    broadcastService.deliver({ broadcast, bot }).catch((err) =>
      console.error('[broadcast] delivery crashed:', err.message)
    );
    res.json({ success: true, data: broadcast });
  } catch (err) {
    sendError(res, 400, err);
  }
};
