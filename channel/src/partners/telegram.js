const config = require('../config');
const logger = require('../logger');
const AdminView = require('../models/AdminView');
const PartnerOrder = require('../models/PartnerOrder');
const notify = require('../notify/telegram');
const { clock, money, note } = require('../notify/format');
const registry = require('./registry');

/**
 * Operator cards for live partner orders.
 *
 * A new order is posted to every admin privately and to the orders channel,
 * with Accept / Reject buttons (`pa:a:<id>`, `pa:r:<id>`; the bot backend
 * handles the taps). Every later status change edits the same messages and
 * removes the buttons, so one order stays one card.
 */

const STATUS = {
  new: '🕓 Javob kutilmoqda / Ждёт ответа',
  accepted: '✅ Qabul qilindi, Billz’da bron / Принят, резерв в Billz',
  rejected: '❌ Rad etildi / Отклонён',
  cancelled: '🚫 Hamkor bekor qildi / Отменён',
  completed: '🎉 Yetkazildi, Billz’da sotildi / Доставлен, продан в Billz',
};

const REASONS = {
  timeout: 'vaqtida javob berilmadi / нет ответа вовремя',
  rejected_by_shop: 'operator rad etdi / отклонил оператор',
  cancelled_by_partner: 'hamkor bekor qildi / отменил партнёр',
  cancelled_by_shop: 'do‘kon bekor qildi / отменил магазин',
};

function render(order, partnerName, at = new Date()) {
  const lines = (order.items || []).map((item) => (
    `• ${note(item.name, 120) || item.productId} × ${item.quantity} — ${money(item.lineTotal)}`
  ));
  const deadline = order.status === 'new' ? clock(order.deadlineAt, at) : '';
  const delivery = order.delivery?.type === 'pickup'
    ? '🏪 Olib ketish / Самовывоз'
    : `🚚 Yetkazish / Доставка${order.delivery?.address ? `: ${note(order.delivery.address, 300)}` : ''}`;
  const reason = order.reason ? (REASONS[order.reason] || note(order.reason, 200)) : '';
  const blocks = [
    [
      `🤝 <b>${note(partnerName, 80)}</b> · <code>#${order.number}</code> · ${note(order.externalId, 64)}`,
      deadline ? `⏰ Javob muddati / Ответить до: <b>${deadline}</b>` : '',
    ],
    lines,
    [
      `💰 <b>${money(order.total)}</b>`,
      order.customer?.name ? `👤 ${note(order.customer.name, 100)}` : '',
      order.customer?.phone ? `📞 ${note(order.customer.phone, 32)}` : '',
      delivery,
      order.delivery?.comment ? `💬 ${note(order.delivery.comment, 300)}` : '',
      order.comment ? `📝 ${note(order.comment, 300)}` : '',
    ],
    [
      STATUS[order.status] || order.status,
      order.decidedBy ? `👮 ${note(order.decidedBy, 80)}` : '',
      reason ? `ℹ️ ${reason}` : '',
    ],
  ];
  return blocks.map((block) => block.filter(Boolean).join('\n')).filter(Boolean).join('\n\n');
}

function keyboard(id) {
  return {
    inline_keyboard: [
      [{ text: '✅ Qabul qilish / Принять', callback_data: `pa:a:${id}` }],
      [{ text: '❌ Rad etish / Отклонить', callback_data: `pa:r:${id}` }],
    ],
  };
}

function createPartnerNotifier({
  send = notify.call,
  OrderModel = PartnerOrder(),
  AdminModel = AdminView(),
  channelId = config.telegram.ordersChannelId,
  partnerName = (code) => registry.get(code)?.name || code,
} = {}) {
  async function recipients() {
    const admins = await AdminModel.find({
      role: 'admin', telegramId: { $gt: 0 }, botBlocked: { $ne: true },
    }).sort({ telegramId: 1 }).lean();
    return [
      ...admins.map((admin) => ({ key: `admin:${admin.telegramId}`, chatId: String(admin.telegramId) })),
      ...(channelId ? [{ key: `channel:${channelId}`, chatId: String(channelId) }] : []),
    ];
  }

  async function announce(order) {
    const sent = new Set((order.notification?.messages || []).map((m) => m.recipientKey));
    let failed = false;
    for (const recipient of await recipients()) {
      if (sent.has(recipient.key)) continue;
      const message = await send('sendMessage', {
        chat_id: recipient.chatId,
        text: render(order, partnerName(order.partnerCode)),
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        ...(order.status === 'new' ? { reply_markup: keyboard(String(order._id)) } : {}),
      });
      if (!message?.message_id) {
        failed = true;
        continue;
      }
      await OrderModel.updateOne({ _id: order._id }, {
        $push: {
          'notification.messages': {
            recipientKey: recipient.key,
            chatId: recipient.chatId,
            messageId: message.message_id,
            sentAt: new Date(),
            finalizedStatus: order.status === 'new' ? '' : order.status,
          },
        },
      });
    }
    if (!failed) await OrderModel.updateOne({ _id: order._id }, { $set: { 'notification.pending': false } });
    return !failed;
  }

  async function refresh(order) {
    let failed = false;
    for (const message of order.notification?.messages || []) {
      if (message.finalizedStatus === order.status) continue;
      const edited = await send('editMessageText', {
        chat_id: message.chatId,
        message_id: message.messageId,
        text: render(order, partnerName(order.partnerCode)),
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: order.status === 'new' ? keyboard(String(order._id)) : { inline_keyboard: [] },
      }, { unchangedIsSuccess: true });
      if (!edited) {
        failed = true;
        continue;
      }
      await OrderModel.updateOne(
        { _id: order._id, 'notification.messages.messageId': message.messageId },
        { $set: { 'notification.messages.$.finalizedStatus': order.status } }
      );
    }
    // A status that changed while we were editing leaves `stale` set for the
    // next round; only a card that shows the current status is marked clean.
    if (!failed) {
      await OrderModel.updateOne(
        { _id: order._id, status: order.status },
        { $set: { 'notification.stale': false } }
      );
    }
    return !failed;
  }

  async function drain() {
    if (!config.telegram.enabled || !config.telegram.botToken) return 0;
    const due = await OrderModel.find({
      test: false,
      $or: [{ 'notification.pending': true }, { 'notification.stale': true }],
    }).sort({ createdAt: 1 }).limit(20).lean();
    for (const order of due) {
      try {
        if (order.notification.pending) await announce(order);
        else await refresh(order);
      } catch (err) {
        logger.warn('partner card update failed', { number: order.number, err });
      }
    }
    return due.length;
  }

  return { announce, refresh, drain };
}

module.exports = { render, keyboard, createPartnerNotifier, STATUS };
