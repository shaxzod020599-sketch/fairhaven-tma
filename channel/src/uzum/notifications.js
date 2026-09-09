const { randomUUID, createHash } = require('node:crypto');
const { cleanOrder, deadlineAt } = require('./lifecycle');
const LABEL = { accept: '✅ Принять', ready: '📦 Готов', reject: '❌ Отклонить' };
const COMMAND = { accept: 'a', ready: 'ready', reject: 'r' };
function keyboard(row, at) {
  return { inline_keyboard: cleanOrder(row, at).actions.map((action) => [{ text: LABEL[action], callback_data: `uz:${COMMAND[action]}:${row.internalOrderId}` }]) };
}
function render(row, at = new Date()) {
  const clean = cleanOrder(row, at);
  const deadline = deadlineAt(row);
  const lines = [
    `🛵 Uzum Tezkor · ${String(row.externalId).slice(0, 64)}`,
    clean.status,
    clean.fulfillmentCancelled ? 'Выдача отменена. Продажа сохранена; возврат не выполнен.' : '',
    deadline ? `Принять до: ${deadline.toLocaleString('ru-RU', { timeZone: 'Asia/Tashkent' })} (UTC+05:00)` : 'Срок принятия неизвестен',
    clean.expired && !row.uzum?.acceptedAt ? 'Срок принятия истёк' : '',
    clean.reconciliationRequired ? '⚠️ Нужна сверка учёта. Откройте админ-панель.' : '',
    clean.inProgress ? 'Решение обрабатывается' : '',
    clean.cancellationPending ? 'Ожидается обработка отмены' : '',
    `Итого: ${clean.totalAmount} UZS`,
    clean.customer.name.slice(0, 200), clean.customer.phone.slice(0, 40),
    ...(row.items || []).map((item) => `• ${item.name || item.billzProductId} × ${item.quantity} — ${item.unitPrice} UZS`),
  ].filter(Boolean);
  let text = ''; let shortened = false;
  for (const point of lines.join('\n').toWellFormed()) {
    if (text.length + point.length > 3500) { shortened = true; break; }
    text += point;
  }
  if (shortened) text += '\n… Полный заказ — в админ-панели.';
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function createNotifier({
  Model = require('../models/ChannelOrder')(), AdminModel,
  channelId, enabled = () => {
    const config = require('../config');
    return config.uzum.enabled && config.telegram.enabled && Boolean(config.telegram.botToken);
  },
  send = (method, payload) => require('../notify/telegram').call(method, payload, { unchangedIsSuccess: true }), now = () => new Date(),
} = {}) {
  async function deliver(input) {
    if (!enabled()) return;
    const token = randomUUID(); const filter = { channel: 'uzum', _id: input._id };
    let row = await Model.findOneAndUpdate({ ...filter, $or: [
      { 'uzum.notification.token': null }, { 'uzum.notification.token': '' }, { 'uzum.notification.leaseUntil': { $lte: now() } },
    ] }, { $set: { 'uzum.notification.token': token, 'uzum.notification.leaseUntil': new Date(now().getTime() + 120_000) } }, { new: true }).lean();
    if (!row) return;
    const owned = { ...filter, 'uzum.notification.token': token };
    const revision = row.uzum.revision;
    let failed = false;
    try {
      const admins = await (AdminModel || require('../models/AdminView')()).find({ role: 'admin', telegramId: { $gt: 0 }, botBlocked: { $ne: true } }).lean();
      const channel = channelId === undefined ? require('../config').telegram.ordersChannelId : channelId;
      const recipients = new Set([...admins.map((admin) => String(admin.telegramId)), ...(channel ? [String(channel)] : [])]);
      // Previously sent cards also need final keyboard cleanup after demotion.
      const previous = row.uzum.notification?.messages || [];
      for (const message of previous) recipients.add(message.chatId);
      if (!recipients.size) failed = true;
      for (const chatId of recipients) {
        if (!enabled()) { failed = true; break; }
        row = await Model.findOneAndUpdate(owned, { $set: { 'uzum.notification.leaseUntil': new Date(now().getTime() + 120_000) } }, { new: true }).lean();
        if (!row) return;
        const adminAllowed = admins.some((admin) => String(admin.telegramId) === chatId);
        const allowed = adminAllowed || String(channel) === chatId;
        const stored = (row.uzum.notification?.messages || []).find((message) => message.chatId === chatId);
        if (!allowed) {
          const result = await send('editMessageReplyMarkup', { chat_id: chatId, message_id: stored.messageId, reply_markup: { inline_keyboard: [] } });
          if (!result?.message_id) { failed = true; continue; }
          await Model.updateOne(owned, { $set: { 'uzum.notification.messages': row.uzum.notification.messages.filter((message) => message.chatId !== chatId) } });
          continue;
        }
        const markup = keyboard(row, now());
        const text = render(row, now());
        const key = createHash('sha256').update(JSON.stringify([text, markup])).digest('hex');
        if (stored?.key === key) continue;
        const result = await send(stored ? 'editMessageText' : 'sendMessage', {
          chat_id: chatId, ...(stored ? { message_id: stored.messageId } : {}), text,
          parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: markup,
        });
        if (!result?.message_id) { failed = true; continue; }
        const messages = (row.uzum.notification?.messages || []).filter((message) => message.chatId !== chatId);
        messages.push({ chatId, messageId: result.message_id, key });
        await Model.updateOne(owned, { $set: { 'uzum.notification.messages': messages } });
      }
      const deadline = deadlineAt(row);
      const staleAt = row.uzum.operation?.startedAt && new Date(new Date(row.uzum.operation.startedAt).getTime() + 300_000);
      const retryAt = failed ? new Date(now().getTime() + 15_000)
        : staleAt > now() ? staleAt : row.status === 'received' && deadline > now() ? deadline : null;
      // CAS revision prevents a concurrent decision from losing its outbox work.
      await Model.updateOne({ ...owned, 'uzum.revision': revision }, { $set: {
        'uzum.notification.pending': failed, 'uzum.notification.retryAt': retryAt,
      } });
    } catch (_) {
      await Model.updateOne(owned, { $set: { 'uzum.notification.pending': true, 'uzum.notification.retryAt': new Date(now().getTime() + 15_000) } });
    } finally {
      await Model.updateOne(owned, { $set: { 'uzum.notification.token': '', 'uzum.notification.leaseUntil': null } });
    }
  }
  async function drainOnce() {
    if (!enabled()) return;
    const rows = await Model.find({ channel: 'uzum', 'uzum.version': 1, $and: [
      { $or: [{ 'uzum.notification.pending': true }, { 'uzum.notification.retryAt': { $lte: now(), $ne: null } }] },
      { $or: [{ 'uzum.notification.retryAt': null }, { 'uzum.notification.retryAt': { $lte: now() } }] },
    ] }).sort({ 'uzum.notification.retryAt': 1 }).limit(50).lean();
    for (const row of rows) await deliver(row);
  }
  return { deliver, drainOnce };
}
function start() {
  const config = require('../config');
  if (!config.uzum.enabled) return null;
  const notifier = createNotifier(); let running = false;
  const run = async () => {
    if (running || !config.uzum.enabled) return;
    running = true;
    try { await require('./lifecycle').drainCancellations(); await notifier.drainOnce(); } catch (_) {} finally { running = false; }
  };
  run(); const timer = setInterval(run, 5000); timer.unref?.(); return timer;
}
module.exports = { createNotifier, keyboard, render, start };
