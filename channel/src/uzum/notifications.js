const { randomUUID, createHash } = require('node:crypto');
const { cleanOrder, deadlineAt } = require('./lifecycle');
const { STOCK, clock, escaped, money, note, payment, timeline } = require('../notify/format');
const LABEL = { accept: '✅ Принять', ready: '📦 Готов', reject: '❌ Отклонить' };
const COMMAND = { accept: 'a', ready: 'ready', reject: 'r' };
function keyboard(row, at) {
  return { inline_keyboard: cleanOrder(row, at).actions.map((action) => [{ text: LABEL[action], callback_data: `uz:${COMMAND[action]}:${row.internalOrderId}` }]) };
}
const STATUS = {
  NEW: '🆕 Новый — ждёт решения', ACCEPTED_BY_RESTAURANT: '✅ Принят — соберите заказ',
  READY: '📦 Готов — отдайте курьеру Uzum', CANCELLED: '❌ Отменён',
};
const object = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});
function render(row, at = new Date()) {
  const clean = cleanOrder(row, at);
  const deadline = deadlineAt(row);
  // Uzum never reports courier progress; the order itself carries the only
  // delivery facts there are: when the courier reaches the shop and how to call.
  const sent = object(row.rawIn); const delivery = object(sent.deliveryInfo);
  const open = clean.status !== 'CANCELLED';
  const customer = [escaped(clean.customer.name, 200), escaped(clean.customer.phone, 40)].filter(Boolean).join(', ');
  const courierAt = open ? clock(delivery.courierArrivementDate, at) : '';
  const courierPhone = open ? note(delivery.phoneNumber, 48) : '';
  const comment = note(sent.comment, 300);
  const steps = timeline([['принят', row.uzum?.acceptedAt], ['готов', row.uzum?.readyAt]], at);
  const lines = [
    `🛵 <b>Заказ Uzum Tezkor ${escaped(clean.externalId, 64)}</b>`,
    `Статус: ${STATUS[clean.status] || escaped(clean.status, 64)}`,
    `Billz: ${STOCK[clean.accountingStatus] || escaped(clean.accountingStatus, 64)}`,
    clean.fulfillmentCancelled ? 'Выдача отменена. Продажа сохранена; возврат не выполнен.' : '',
    clean.status === 'NEW' && !clean.expired ? `⏰ Принять до: <b>${clock(deadline, at)}</b>` : '',
    !deadline ? 'Срок принятия неизвестен' : '',
    clean.expired && !row.uzum?.acceptedAt ? '⌛ Срок принятия истёк' : '',
    courierAt ? `🕒 Курьер приедет: <b>${courierAt}</b>` : '',
    courierPhone ? `📞 Связь с курьером: ${courierPhone}` : '',
    customer ? `👤 Клиент: ${customer}` : '',
    payment(object(sent.paymentInfo).paymentType),
    comment ? `💬 Комментарий: ${comment}` : '',
    steps ? `⏱ ${steps}` : '',
    clean.reconciliationRequired ? '⚠️ Нужна сверка учёта. Откройте админ-панель.' : '',
    clean.inProgress ? '⏳ Решение обрабатывается' : '',
    clean.cancellationPending ? '⏳ Ожидается обработка отмены' : '',
  ].filter(Boolean);
  let text = `${lines.join('\n')}\n\n<b>Состав:</b>`; let shortened = false;
  for (const item of clean.items) {
    const line = `\n• ${escaped(item.name || item.billzProductId, 300)} — ${escaped(item.quantity, 24)} шт × ${money(item.unitPrice)}`;
    if (text.length + line.length > 3500) { shortened = true; break; }
    text += line;
  }
  if (shortened) text += '\n… Полный заказ — в админ-панели.';
  text += `\nИтого: <b>${money(clean.totalAmount)}</b>`;
  if (clean.actions.includes('accept')) text += '\n\n👉 Проверьте наличие товара и нажмите «✅ Принять».';
  else if (clean.actions.includes('ready')) text += '\n\n👉 Соберите заказ к приезду курьера и нажмите «📦 Готов».';
  return `${text}\n<a href="https://admin.fairhaven.uz/orders">Открыть в панели</a>`;
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
