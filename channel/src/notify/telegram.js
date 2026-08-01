const config = require('../config');
const logger = require('../logger');
const ChannelOrder = require('../models/ChannelOrder');

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

module.exports = { announceOrder, escapeHtml, isConfigured, renderCard };
