const { createHash, randomUUID } = require('node:crypto');
const config = require('../config');
const logger = require('../logger');
const ChannelOrder = require('../models/ChannelOrder');
const AdminView = require('../models/AdminView');
const MedicalkaApproval = require('../models/MedicalkaApproval');
const MedicalkaSubOrder = require('../models/MedicalkaSubOrder');

/**
 * Order cards in the Telegram operations channel.
 *
 * Marketplace orders do not pass through the bot backend, so without this an
 * operator would only learn about a Medicalka or Uzum sale by opening the panel.
 * The card is posted when the order arrives and **edited in place** as it
 * progresses, so one order is one message in the channel rather than a stream of
 * updates nobody reads to the end.
 *
 * Strictly outbound. This service exposes no Telegram webhook and accepts no
 * callback: someone who gained posting rights in the channel still cannot move
 * stock. Everything that changes state arrives on the marketplace API or the
 * internal loopback surface, both authenticated.
 */

const API = 'https://api.telegram.org';

// Telegram's own advice for a 429 is to wait `retry_after`; the rest are
// transient network faults. Three attempts covers both without holding an order
// path open for long — the card is an announcement, not part of the sale.
const MAX_ATTEMPTS = 3;
const TIMEOUT_MS = 8000;

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatUZS(amount) {
  return `${(Number(amount) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} UZS`;
}

const CHANNEL_LABELS = {
  medicalka: '🏥 Medicalka',
  uzum: '🛵 Uzum Tezkor',
  'fairhaven-bot': '🤖 Fairhaven bot',
};

const STATUS_LABELS = {
  received: '🕓 Qabul qilindi / Принят',
  reserved: '📦 Bron qilindi / Забронирован',
  sold: '✅ Sotildi / Продан',
  cancelled: '❌ Bekor qilindi / Отменён',
  failed: '⚠️ Billz xatosi / Ошибка Billz',
};

function isConfigured() {
  return Boolean(
    config.telegram.enabled && config.telegram.botToken && config.telegram.ordersChannelId
  );
}

function isMedicalkaConfigured() {
  return Boolean(config.telegram.enabled && config.telegram.botToken);
}

/**
 * One Bot API call, with the retry Telegram asks for.
 *
 * Never throws for a message Telegram will not accept — a card that cannot be
 * posted must not turn into a failed order. The error is logged and the caller
 * carries on.
 */
async function call(method, payload, { unchangedIsSuccess = false } = {}) {
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${API}/bot${config.telegram.botToken}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const body = await res.json().catch(() => ({}));
      if (body?.ok) return body.result;
      if (unchangedIsSuccess && ['editMessageText', 'editMessageReplyMarkup'].includes(method) && res.status === 400
        && /^Bad Request: message is not modified(?::|$)/i.test(body?.description || '')) return { message_id: payload.message_id };

      // 400s are permanent — a bad chat id, a message that cannot be edited
      // because it is identical. Retrying those only delays the log line.
      const retryAfter = body?.parameters?.retry_after;
      if (res.status === 429 && retryAfter && attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, Math.min(retryAfter, 30) * 1000));
        continue;
      }
      if (res.status >= 400 && res.status < 500) {
        lastError = new Error(`telegram ${method}: ${body?.description || res.status}`);
        break;
      }
      lastError = new Error(`telegram ${method}: ${body?.description || res.status}`);
    } catch (err) {
      lastError = err;
    } finally {
      clearTimeout(timer);
    }

    if (attempt < MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }

  logger.warn('telegram call failed', { method, err: lastError?.message });
  return null;
}

/** The card body. Deliberately compact — operators read these on a phone. */
function renderCard(order) {
  const lines = order.items.map((item) => (
    `• ${escapeHtml(item.name || item.billzProductId)} × ${item.quantity}`
    + ` — ${formatUZS(item.quantity * item.unitPrice)}`
  ));

  const header = `${CHANNEL_LABELS[order.channel] || escapeHtml(order.channel)}`
    + ` · <b>${escapeHtml(order.externalId)}</b>`;

  const customer = [
    order.customer?.name && `👤 ${escapeHtml(order.customer.name)}`,
    order.customer?.phone && `📞 ${escapeHtml(order.customer.phone)}`,
    order.customer?.address && `📍 ${escapeHtml(order.customer.address)}`,
  ].filter(Boolean);

  const trouble = order.status === 'failed' && order.billz?.lastError
    ? `\n\n<i>${escapeHtml(order.billz.lastError.slice(0, 300))}</i>`
    : '';

  const billzRef = order.billz?.orderNumber
    ? `\n🧾 Billz: <code>${escapeHtml(order.billz.orderNumber)}</code>`
    : '';

  return [
    header,
    '',
    lines.join('\n'),
    '',
    `💰 <b>${formatUZS(order.totalAmount)}</b>`,
    customer.length ? `\n${customer.join('\n')}` : '',
    `\n${STATUS_LABELS[order.status] || escapeHtml(order.status)}${billzRef}${trouble}`,
  ].filter((part) => part !== '').join('\n');
}

/**
 * Posts or updates the card for one order.
 *
 * Bot orders are the exception: the backend already posts those, with the
 * approve and reject buttons attached, and a second card would split one
 * conversation across two messages. For those we speak up only when something
 * went wrong in Billz, which is the one thing the backend's card cannot show.
 */
async function announceOrder(channel, externalId) {
  if (!isConfigured()) return null;

  const order = await ChannelOrder().findOne({ channel, externalId });
  if (!order) return null;

  const isBotOrder = channel === config.bot.channel;
  if (isBotOrder && order.status !== 'failed') return null;

  const text = renderCard(order);
  const base = {
    chat_id: config.telegram.ordersChannelId,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  };

  if (order.telegramMessageId) {
    const edited = await call('editMessageText', {
      ...base, message_id: order.telegramMessageId, text,
    });
    // A failed edit is usually "message is not modified", which is fine. If the
    // message is genuinely gone we post a fresh one rather than going silent.
    if (edited) return order.telegramMessageId;
  }

  const sent = await call('sendMessage', { ...base, text });
  if (!sent?.message_id) return null;

  // Stored with a targeted update, not a save of the whole document: this runs
  // outside the order path and must not overwrite a status written since.
  await ChannelOrder().updateOne(
    { _id: order._id },
    { $set: { telegramMessageId: sent.message_id } }
  );
  return sent.message_id;
}

function approvalStatus(status) {
  return {
    pending: '⏳ Tasdiq kutilmoqda / Ожидает решения',
    accepted: '✅ Tasdiqlandi / Подтверждено',
    rejected: '❌ Rad etildi / Отклонено',
    cancelled: '🚫 Bekor qilindi / Отменено',
  }[status] || escapeHtml(status);
}

function renderMedicalkaApproval(approval) {
  const customerName = [approval.customer?.firstName, approval.customer?.lastName]
    .filter(Boolean).join(' ');
  const lines = (approval.items || []).map((item) => (
    `• ${escapeHtml(item.name || item.externalName || item.productId)}`
      + ` × ${Number(item.quantity) || 0} — ${formatUZS(item.lineTotal)}`
  ));
  const actor = approval.decision?.actorName
    ? `\n👮 ${escapeHtml(approval.decision.actorName)}` : '';
  return [
    `🏥 <b>Medicalka zayavka / Заявка</b> · <code>${escapeHtml(approval.checkoutId)}</code>`,
    '',
    lines.join('\n'),
    '',
    `💰 <b>${formatUZS(approval.subtotal)}</b>`,
    customerName ? `👤 ${escapeHtml(customerName)}` : '',
    approval.customer?.phone ? `📞 ${escapeHtml(approval.customer.phone)}` : '',
    approval.deliveryType ? `🚚 ${escapeHtml(approval.deliveryType)}` : '',
    '',
    `${approvalStatus(approval.status)}${actor}`,
  ].filter((part) => part !== '').join('\n');
}

function approvalKeyboard(id) {
  return {
    inline_keyboard: [
      [{ text: '✅ Tasdiqlash / Принять', callback_data: `ma:a:${id}` }],
      [{ text: '❌ Rad etish / Отклонить', callback_data: `ma:r:${id}` }],
    ],
  };
}

function createMedicalkaNotifier({
  send = call,
  AdminModel = AdminView(),
  ApprovalModel = MedicalkaApproval(),
  channelId = config.telegram.ordersChannelId,
  now = () => new Date(),
} = {}) {
  async function announce(input) {
    const approval = await ApprovalModel.findById(input._id).lean();
    if (
      !approval || approval.status !== 'pending'
      || !approval.requiresAction || !approval.checkoutActive
    ) return null;

    const admins = await AdminModel.find({
      role: 'admin', telegramId: { $gt: 0 }, botBlocked: { $ne: true },
    }).sort({ telegramId: 1 }).lean();
    const recipients = [
      ...admins.map((admin) => ({
        key: `admin:${admin.telegramId}`,
        type: 'admin',
        chatId: admin.telegramId,
        telegramId: admin.telegramId,
      })),
      ...(channelId ? [{
        key: `channel:${channelId}`,
        type: 'channel',
        chatId: String(channelId),
        telegramId: null,
      }] : []),
    ];
    const delivered = new Set(
      (approval.notification?.messages || []).map((row) => (
        row.recipientKey || (row.telegramId ? `admin:${row.telegramId}` : '')
      ))
    );
    let failed = false;

    for (const recipient of recipients) {
      if (delivered.has(recipient.key)) continue;
      const sent = await send('sendMessage', {
        chat_id: recipient.chatId,
        text: renderMedicalkaApproval(approval),
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: approvalKeyboard(String(approval._id)),
      });
      if (!sent?.message_id) {
        failed = true;
        continue;
      }
      await ApprovalModel.updateOne({
        _id: approval._id,
        'notification.messages': { $not: { $elemMatch: { recipientKey: recipient.key } } },
      }, {
        $push: {
          'notification.messages': {
            recipientKey: recipient.key,
            recipientType: recipient.type,
            chatId: String(recipient.chatId),
            telegramId: recipient.telegramId,
            messageId: sent.message_id,
            sentAt: now(),
          },
        },
      });
    }

    if (failed) throw new Error('medicalka_telegram_partial_failure');
    return true;
  }

  async function finalize(id) {
    const approval = await ApprovalModel.findById(id).lean();
    if (!approval) return null;
    const attemptedAt = now();
    const messages = (approval.notification?.messages || [])
      .filter((message) => (
        !message.finalizedAt
        && (!message.finalizeRetryAt || new Date(message.finalizeRetryAt) <= attemptedAt)
      ));
    const results = await Promise.all(messages.map(async (message) => {
      let edited = null;
      try {
        edited = await send('editMessageText', {
          chat_id: message.chatId || message.telegramId,
          message_id: message.messageId,
          text: renderMedicalkaApproval(approval),
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          reply_markup: { inline_keyboard: [] },
        });
      } catch (_) { /* persist generic failure below */ }
      const match = {
        _id: approval._id,
        'notification.messages': {
          $elemMatch: {
            messageId: message.messageId,
            finalizedAt: null,
          },
        },
      };
      if (!edited) {
        const attempts = Number(message.finalizeAttempts || 0) + 1;
        const retryDelay = Math.min(30000 * (2 ** Math.min(attempts - 1, 4)), 600000);
        await ApprovalModel.updateOne(match, {
          $inc: { 'notification.messages.$.finalizeAttempts': 1 },
          $set: {
            'notification.messages.$.finalizeRetryAt': new Date(
              attemptedAt.getTime() + retryDelay
            ),
            'notification.messages.$.finalizeLastError': 'medicalka_telegram_edit_failed',
          },
        });
        return false;
      }
      await ApprovalModel.updateOne(match, {
        $inc: { 'notification.messages.$.finalizeAttempts': 1 },
        $set: {
          'notification.messages.$.finalizedAt': attemptedAt,
          'notification.messages.$.finalizeRetryAt': null,
          'notification.messages.$.finalizeLastError': '',
        },
      });
      return true;
    }));
    if (results.some((result) => !result)) {
      throw new Error('medicalka_telegram_finalize_partial_failure');
    }
    return true;
  }

  return { announce, finalize };
}

function renderMedicalkaSubOrder(order) {
  const itemLines = (order.items || []).map((item) => (
    `• ${escapeHtml(item.name || item.productId || item.productExternalId)}`
      + ` × ${Number(item.quantity) || 0} — ${formatUZS(item.lineTotal)}`
  ));
  const customerName = [order.customer?.firstName, order.customer?.lastName]
    .filter(Boolean).join(' ');
  const number = order.orderNumber || order.subOrderNumber || order.externalId;
  const delivery = [order.deliveryProvider, order.courierStatus, order.deliveryServiceStatus]
    .filter(Boolean).map(escapeHtml).join(' · ');
  const billzState = order.sale?.reconciliationRequired
    ? `${order.sale?.state || 'pending'} · reconciliation_required`
    : (order.sale?.state || 'pending');
  return [
    `🏥 <b>Medicalka buyurtma / Заказ</b> · <code>${escapeHtml(number)}</code>`,
    order.subOrderNumber && order.subOrderNumber !== number
      ? `Suborder: <code>${escapeHtml(order.subOrderNumber)}</code>` : '',
    '',
    itemLines.join('\n'),
    '',
    `💰 <b>${formatUZS(order.subtotal)}</b>`,
    `💳 ${escapeHtml(order.paymentStatus || 'unknown')} · ${escapeHtml(order.paymentMethod || 'unknown')}`,
    `📦 ${escapeHtml(order.status || 'unknown')}`,
    delivery ? `🚚 ${delivery}` : '',
    `🧾 Billz: ${escapeHtml(billzState)}`,
    customerName ? `👤 ${escapeHtml(customerName)}` : '',
    order.customer?.phone ? `📞 ${escapeHtml(order.customer.phone)}` : '',
  ].filter((part) => part !== '').join('\n');
}

function subOrderFingerprint(order) {
  const data = {
    orderNumber: order.orderNumber,
    subOrderNumber: order.subOrderNumber,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    status: order.status,
    deliveryType: order.deliveryType,
    deliveryProvider: order.deliveryProvider,
    courierStatus: order.courierStatus,
    deliveryServiceStatus: order.deliveryServiceStatus,
    subtotal: order.subtotal,
    customer: order.customer,
    items: order.items,
    mapping: order.mapping,
    sale: order.sale,
    operation: {
      reconciliationRequired: order.operation?.reconciliationRequired,
      lastError: order.operation?.lastError,
    },
    lastAction: order.lastAction,
  };
  return createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

function createMedicalkaSubOrderNotifier({
  send = call,
  Model = MedicalkaSubOrder(),
  channelId = config.telegram.ordersChannelId,
  now = () => new Date(),
} = {}) {
  async function announce(input) {
    if (!channelId || !input?._id) return null;
    const current = await Model.findById(input._id).lean();
    if (!current) return null;
    const fingerprint = subOrderFingerprint(current);
    if (
      current.notification?.messageId
      && current.notification?.fingerprint === fingerprint
    ) return current.notification.messageId;

    const attemptedAt = now();
    const token = randomUUID();
    const staleAt = new Date(attemptedAt.getTime() - 60000);
    const claimed = await Model.findOneAndUpdate({
      _id: current._id,
      $and: [
        { $or: [
          { 'notification.fingerprint': { $ne: fingerprint } },
          { 'notification.messageId': { $in: [null, 0] } },
        ] },
        { $or: [
          { 'notification.claimToken': { $in: ['', null] } },
          { 'notification.claimedAt': { $lte: staleAt } },
        ] },
      ],
    }, {
      $set: {
        'notification.claimToken': token,
        'notification.claimedAt': attemptedAt,
      },
    }, { new: true }).lean();
    if (!claimed) return null;

    let delivered = null;
    try {
      if (claimed.notification?.messageId) {
        delivered = await send('editMessageText', {
          chat_id: claimed.notification.chatId || String(channelId),
          message_id: claimed.notification.messageId,
          text: renderMedicalkaSubOrder(claimed),
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        });
      } else {
        delivered = await send('sendMessage', {
          chat_id: String(channelId),
          text: renderMedicalkaSubOrder(claimed),
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        });
      }
    } catch (_) { /* durable retry state is stored below */ }

    const messageId = claimed.notification?.messageId || delivered?.message_id;
    if (!delivered || !messageId) {
      const attempts = Number(claimed.notification?.attempts || 0) + 1;
      const retryDelay = Math.min(30000 * (2 ** Math.min(attempts - 1, 4)), 600000);
      await Model.updateOne({ _id: claimed._id, 'notification.claimToken': token }, {
        $inc: { 'notification.attempts': 1 },
        $set: {
          'notification.claimToken': '',
          'notification.claimedAt': null,
          'notification.retryAt': new Date(attemptedAt.getTime() + retryDelay),
          'notification.lastError': 'medicalka_suborder_telegram_failed',
        },
      });
      throw new Error('medicalka_suborder_telegram_failed');
    }

    await Model.updateOne({ _id: claimed._id, 'notification.claimToken': token }, {
      $set: {
        'notification.claimToken': '',
        'notification.claimedAt': null,
        'notification.chatId': String(channelId),
        'notification.messageId': messageId,
        'notification.fingerprint': fingerprint,
        'notification.sentAt': claimed.notification?.sentAt || attemptedAt,
        'notification.updatedAt': attemptedAt,
        'notification.retryAt': null,
        'notification.lastError': '',
      },
    });
    return messageId;
  }

  async function drainOnce() {
    const rows = await Model.find({
      'notification.lastError': { $ne: '' },
      'notification.retryAt': { $lte: now() },
    }).sort({ 'notification.retryAt': 1 }).limit(20).select({ _id: 1 }).lean();
    for (const row of rows) {
      try { await announce(row); } catch (_) { /* next retry is already stored */ }
    }
    return rows.length;
  }

  return { announce, drainOnce };
}

async function announceMedicalkaApproval(approval, options = {}) {
  if (!isMedicalkaConfigured()) return null;
  return createMedicalkaNotifier(options).announce(approval);
}

async function finalizeMedicalkaApproval(id, options = {}) {
  if (!isMedicalkaConfigured()) return null;
  return createMedicalkaNotifier(options).finalize(id);
}

async function announceMedicalkaSubOrder(order, options = {}) {
  if (!isConfigured()) return null;
  return createMedicalkaSubOrderNotifier(options).announce(order);
}

async function drainMedicalkaSubOrderNotifications(options = {}) {
  if (!isConfigured()) return null;
  return createMedicalkaSubOrderNotifier(options).drainOnce();
}

module.exports = {
  call,
  announceMedicalkaApproval,
  announceMedicalkaSubOrder,
  announceOrder,
  createMedicalkaNotifier,
  createMedicalkaSubOrderNotifier,
  drainMedicalkaSubOrderNotifications,
  escapeHtml,
  finalizeMedicalkaApproval,
  isConfigured,
  isMedicalkaConfigured,
  renderCard,
  renderMedicalkaApproval,
  renderMedicalkaSubOrder,
};
