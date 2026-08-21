const config = require('../config');
const logger = require('../logger');
const ChannelOrder = require('../models/ChannelOrder');
const AdminView = require('../models/AdminView');
const MedicalkaApproval = require('../models/MedicalkaApproval');

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
async function call(method, payload) {
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
    const delivered = new Set(
      (approval.notification?.messages || []).map((row) => Number(row.telegramId))
    );
    let failed = false;

    for (const admin of admins) {
      if (delivered.has(Number(admin.telegramId))) continue;
      const sent = await send('sendMessage', {
        chat_id: admin.telegramId,
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
        'notification.messages.telegramId': { $ne: admin.telegramId },
      }, {
        $push: {
          'notification.messages': {
            telegramId: admin.telegramId,
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
          chat_id: message.telegramId,
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
            telegramId: message.telegramId,
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

let medicalkaNotifier = null;

function getMedicalkaNotifier() {
  if (!medicalkaNotifier) medicalkaNotifier = createMedicalkaNotifier();
  return medicalkaNotifier;
}

async function announceMedicalkaApproval(approval) {
  if (!isMedicalkaConfigured()) return null;
  return getMedicalkaNotifier().announce(approval);
}

async function finalizeMedicalkaApproval(id) {
  if (!isMedicalkaConfigured()) return null;
  return getMedicalkaNotifier().finalize(id);
}

module.exports = {
  announceMedicalkaApproval,
  announceOrder,
  createMedicalkaNotifier,
  escapeHtml,
  finalizeMedicalkaApproval,
  isConfigured,
  isMedicalkaConfigured,
  renderCard,
  renderMedicalkaApproval,
};
