const { randomUUID, createHash } = require('node:crypto');
const COMMAND = { accept: 'a', cooking: 'c', ready: 'r', reject: 'x', edit: 'e' };
const LABEL = { accept: '✅ Принять', cooking: '🍳 Готовится', ready: '📦 Готов', reject: '❌ Отклонить', edit: '✏️ Изменить состав' };
const positive = (number) => Number.isSafeInteger(number) && number > 0;
const LEASE_MS = 120000;
const RETRY_MS = 15000;
function encodeCallback(id, action, revision, itemsRevision) {
  if (typeof id !== 'string' || !/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(id)
    || typeof action !== 'string' || !Object.hasOwn(COMMAND, action) || !positive(revision) || !positive(itemsRevision)) return null;
  return `ya:${COMMAND[action]}:${id.replace(/-/g, '').toLowerCase()}:${revision.toString(36)}:${itemsRevision.toString(36)}`;
}
// The bot opens its own picking message; the composition stays editable until acceptance.
const editable = (clean) => clean.actions.length > 0 && !clean.itemsFrozen && ['received', 'failed'].includes(clean.accountingStatus);
function keyboard(row, at = new Date()) {
  const clean = require('./lifecycle').cleanOrder(row, at);
  return { inline_keyboard: [...(editable(clean) ? ['edit'] : []), ...clean.actions].flatMap((action) => {
    const callback = encodeCallback(clean.id, action, clean.revision, clean.itemsRevision);
    return callback ? [[{ text: LABEL[action], callback_data: callback }]] : [];
  }) };
}
// Bound escaped units, never cut an entity or a Unicode code point.
function escaped(value, limit) {
  const raw = typeof value === 'string' ? value : typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
  let text = '';
  for (const point of raw) {
    const entity = ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[point] || point.toWellFormed();
    if (text.length + entity.length > limit - 1) return `${text}…`;
    text += entity;
  }
  return text;
}
function money(value) {
  const [whole, fraction] = String(Math.round(Number(value) * 100) / 100 || 0).split('.');
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}${fraction ? `,${fraction}` : ''} UZS`;
}
const STATUS = {
  NEW: '🆕 Новый — ждёт решения', ACCEPTED_BY_RESTAURANT: '✅ Принят', COOKING: '🍳 Собирается', READY: '📦 Готов, ждёт курьера',
  TAKEN_BY_COURIER: '🚚 У курьера', DELIVERED: '🏁 Доставлен', CANCELLED: '❌ Отменён',
};
const STOCK = {
  received: 'товар ещё не списан', reserved: 'товар отложен под заказ', sold: 'продано, товар списан',
  cancelled: 'резерв снят, товар вернулся в продажу', failed: '⚠️ ошибка — проверьте заказ в панели',
};
function render(row, at = new Date()) {
  const clean = require('./lifecycle').cleanOrder(row, at);
  const customer = [escaped(clean.customer.name, 200), escaped(clean.customer.phone, 60)].filter(Boolean).join(', ');
  const lines = [
    `🛵 <b>Заказ Yandex ${escaped(clean.externalId, 240)}</b>`,
    `Статус: ${STATUS[clean.status] || escaped(clean.status, 64)}`,
    `Billz: ${STOCK[clean.accountingStatus] || escaped(clean.accountingStatus, 64)}`,
    customer ? `👤 ${customer}` : '',
    !clean.enabled ? '⚠️ Yandex отключён' : '',
    !clean.accountingEnabled ? '⚠️ Учёт отключён' : '',
    clean.reconciliationRequired ? '⚠️ Нужна сверка учёта. Откройте панель.' : '',
    clean.inProgress ? '⏳ Решение обрабатывается' : '',
    clean.cancellationPending ? '⏳ Ожидается обработка отмены' : '',
  ].filter(Boolean);
  let text = `${lines.join('\n')}\n\n<b>Состав:</b>`; let shortened = false;
  for (const item of clean.items) {
    const line = `\n• ${escaped(item.name || item.billzProductId, 300)} — ${escaped(item.quantity, 24)} шт × ${money(item.unitPrice)}`;
    if (text.length + line.length > 3500) { shortened = true; break; }
    text += line;
  }
  if (shortened) text += '\n… Полный состав — в панели.';
  text += `\nИтого: <b>${money(clean.totalAmount)}</b>`;
  if (clean.actions.includes('accept')) {
    text += editable(clean)
      ? '\n\n👉 Проверьте состав. Нужно убрать или добавить товар — «✏️ Изменить состав». Потом нажмите «✅ Принять».'
      : '\n\n👉 Проверьте состав и нажмите «✅ Принять».';
  } else if (clean.actions.includes('ready')) text += '\n\n👉 Когда заказ собран, нажмите «📦 Готов».';
  return `${text}\n<a href="https://admin.fairhaven.uz/orders">Открыть в панели</a>`;
}
const YANDEX_EVENTS = {
  TAKEN_BY_COURIER: '🚚 Yandex: курьер забрал заказ',
  DELIVERED: '✅ Yandex: заказ доставлен',
  reject: '❌ Yandex отменил заказ',
};
/** Changes Yandex itself reported, oldest first; admin decisions are already on the card. */
function yandexEvents(row) {
  return (row.yandex?.audit || []).filter((entry) => entry?.actor?.type === 'yandex' && entry.at
    && Object.hasOwn(YANDEX_EVENTS, entry.action) && ['received', 'requested'].includes(entry.outcome))
    .map((entry) => ({ at: new Date(entry.at), text: [`${YANDEX_EVENTS[entry.action]} · ${escaped(row.externalId, 240)}`,
      entry.action === 'reject' && entry.reason ? `Причина: ${escaped(entry.reason, 300)}` : ''].filter(Boolean).join('\n') }))
    .sort((a, b) => a.at - b.at);
}
function isEnabled() {
  const config = require('../config');
  return config.yandex.enabled && config.telegram.enabled && Boolean(config.telegram.botToken);
}
async function sendTelegram(method, payload) {
  if (!['sendMessage', 'editMessageText', 'editMessageReplyMarkup'].includes(method) || !isEnabled()) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const token = require('../config').telegram.botToken;
    // One attempt only: a later request must recheck authority and lease ownership.
    const response = await fetch(`https://api.telegram.org/bot${encodeURIComponent(token)}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      redirect: 'error', signal: controller.signal,
    });
    const body = await response.json();
    if (response.ok && body?.ok === true && positive(body.result?.message_id)) return { message_id: body.result.message_id };
    if (response.status === 400 && method !== 'sendMessage' && positive(payload?.message_id)
      && typeof body?.description === 'string' && /^Bad Request: message is not modified(?::|$)/i.test(body.description)) {
      return { message_id: payload.message_id };
    }
    const seconds = body?.parameters?.retry_after;
    if (response.status === 429 && positive(seconds) && positive(seconds * 1000)) return { retryAfterMs: seconds * 1000 };
  } catch (_) { /* Only the durable outbox retries; never log transport data. */ }
  finally { clearTimeout(timer); }
  return null;
}
function presentationRetry(row, at) {
  const { STALE_MS } = require('./lifecycle');
  const times = [[row.yandex.operation?.token, row.yandex.operation?.startedAt], [row.billz?.operationToken, row.billz?.operationStartedAt]]
    .filter(([token, started]) => token && started).map(([, started]) => +new Date(started) + STALE_MS).filter((time) => time > +at);
  return times.length ? new Date(Math.min(...times)) : null;
}
function createNotifier({ Model = require('../models/ChannelOrder')(), AdminModel,
  enabled = isEnabled, send = sendTelegram,
  now = () => new Date(),
} = {}) {
  const cooldownDue = () => ({ $or: [
    { 'yandex.notification.cooldownUntil': null }, { 'yandex.notification.cooldownUntil': { $lte: now() } },
  ] });
  async function deliver(input) {
    if (!enabled()) return;
    const filter = { channel: 'yandex', 'yandex.version': 1, _id: input._id };
    const token = randomUUID();
    let row = await Model.findOneAndUpdate({ ...filter, $and: [cooldownDue()], $or: [
      { 'yandex.notification.token': { $in: ['', null] } }, { 'yandex.notification.leaseUntil': { $lte: now() } },
    ] }, { $set: { 'yandex.notification.token': token, 'yandex.notification.leaseUntil': new Date(+now() + LEASE_MS) } }, { new: true }).lean();
    if (!row) return;
    const owned = () => ({ ...filter, 'yandex.notification.token': token, 'yandex.notification.leaseUntil': { $gt: now() } });
    const revision = row.yandex.revision;
    let failed = false; let nextPresentationAt = null; let retryNotBefore = 0;
    const failureRetry = () => new Date(Math.max(+now() + RETRY_MS, retryNotBefore));
    try {
      const admins = AdminModel || require('../models/AdminView')();
      const candidates = await admins.find({ role: 'admin', botBlocked: { $ne: true }, telegramId: { $gt: 0 } }).lean();
      const recipients = new Set(candidates.filter((admin) => positive(admin.telegramId)).map((admin) => String(admin.telegramId)));
      for (const message of row.yandex.notification.messages || []) {
        if (typeof message.chatId === 'string' && positive(Number(message.chatId)) && String(Number(message.chatId)) === message.chatId) recipients.add(message.chatId);
      }
      if (!recipients.size) failed = true;
      for (const chatId of recipients) {
        if (!enabled()) { failed = true; break; }
        // Authorization is re-read per recipient, including previously delivered cards.
        const admin = await admins.findOne({ telegramId: Number(chatId) }).lean();
        row = await Model.findOneAndUpdate({ ...owned(), 'yandex.revision': revision },
          { $set: { 'yandex.notification.leaseUntil': new Date(+now() + LEASE_MS) } }, { new: true }).lean();
        if (!row) return;
        if (!enabled()) { failed = true; break; }
        const messages = row.yandex.notification.messages || [];
        const stored = messages.find((message) => message.chatId === chatId);
        const allowed = admin?.role === 'admin' && admin.botBlocked !== true && admin.telegramId === Number(chatId);
        if (!allowed && !stored) continue;
        const presentedAt = now();
        const markup = allowed ? keyboard(row, presentedAt) : { inline_keyboard: [] };
        const text = allowed ? render(row, presentedAt) : undefined;
        const deadline = allowed ? presentationRetry(row, presentedAt) : null;
        if (deadline && (!nextPresentationAt || deadline < nextPresentationAt)) nextPresentationAt = deadline;
        const key = allowed ? createHash('sha256').update(JSON.stringify([text, markup])).digest('hex') : '';
        // Card edits are silent in Telegram, so Yandex-side changes also get a
        // short reply. A card's first presentation already shows earlier events.
        const since = stored?.announcedAt ? +new Date(stored.announcedAt) : null;
        const fresh = allowed && since !== null ? yandexEvents(row).filter((event) => +event.at > since) : [];
        if (allowed && stored?.key === key && !fresh.length) continue;
        try {
          let messageId = stored?.messageId;
          if (!(allowed && stored?.key === key)) {
            const result = await send(!allowed ? 'editMessageReplyMarkup' : stored ? 'editMessageText' : 'sendMessage', {
              chat_id: chatId, ...(stored ? { message_id: stored.messageId } : {}), reply_markup: markup,
              ...(allowed ? { text, parse_mode: 'HTML', disable_web_page_preview: true } : {}),
            });
            if (!positive(result?.message_id)) {
              failed = true;
              const retryAt = positive(result?.retryAfterMs) ? new Date(+now() + result.retryAfterMs) : null;
              if (retryAt && Number.isFinite(+retryAt)) {
                // Cooldown survives revision resets without acknowledging their pending work.
                const cooled = await Model.updateOne(owned(), { $max: { 'yandex.notification.cooldownUntil': retryAt } });
                if (!cooled.matchedCount) return;
                retryNotBefore = +retryAt;
                break; // Flood control also defers remaining recipients; no inline retry or sleep.
              }
              continue;
            }
            messageId = result.message_id;
          }
          let announcedAt = since === null ? presentedAt : new Date(since);
          let cooledUntil = null;
          for (const event of fresh) {
            const reply = await send('sendMessage', { chat_id: chatId, text: event.text, parse_mode: 'HTML',
              reply_parameters: { message_id: messageId, allow_sending_without_reply: true } });
            if (!positive(reply?.message_id)) {
              failed = true;
              if (positive(reply?.retryAfterMs)) cooledUntil = new Date(+now() + reply.retryAfterMs);
              break;
            }
            announcedAt = event.at;
          }
          const updated = messages.filter((message) => message.chatId !== chatId);
          if (allowed) updated.push({ chatId, messageId, key, announcedAt });
          // An external send/DB-ack crash can duplicate a card; callbacks have separate financial fencing.
          const saved = await Model.updateOne(owned(), { $set: { 'yandex.notification.messages': updated } });
          if (!saved.matchedCount) return;
          if (cooledUntil) {
            const cooled = await Model.updateOne(owned(), { $max: { 'yandex.notification.cooldownUntil': cooledUntil } });
            if (!cooled.matchedCount) return;
            retryNotBefore = +cooledUntil;
            break;
          }
        } catch (_) { failed = true; }
      }
      await Model.updateOne({ ...owned(), 'yandex.revision': revision }, { $set: {
        'yandex.notification.pending': failed,
        // Keep the rendered presentation's deadline even if delivery crossed it.
        'yandex.notification.retryAt': failed ? failureRetry() : nextPresentationAt,
      } });
    } catch (_) {
      await Model.updateOne({ ...owned(), 'yandex.revision': revision }, { $set: {
        'yandex.notification.pending': true, 'yandex.notification.retryAt': failureRetry(),
      } });
    } finally {
      await Model.updateOne(owned(), { $set: { 'yandex.notification.token': '', 'yandex.notification.leaseUntil': null } });
    }
  }
  async function drainOnce() {
    if (!enabled()) return;
    const rows = await Model.find({ channel: 'yandex', 'yandex.version': 1, $and: [
      cooldownDue(),
      { $or: [{ 'yandex.notification.pending': true }, { 'yandex.notification.retryAt': { $lte: now(), $ne: null } }] },
      { $or: [{ 'yandex.notification.retryAt': null }, { 'yandex.notification.retryAt': { $lte: now() } }] },
    ] }).sort({ 'yandex.notification.retryAt': 1 }).limit(50).lean();
    for (const row of rows) await deliver(row);
  }
  return { deliver, drainOnce };
}
function start({ notifier } = {}) {
  if (!isEnabled()) return null;
  const worker = notifier || createNotifier(); let running = false;
  const run = async () => {
    if (running || !isEnabled()) return;
    running = true;
    try { await worker.drainOnce(); } catch (_) {} finally { running = false; }
  };
  void run(); const timer = setInterval(run, 5000); timer.unref?.(); return timer;
}
module.exports = { createNotifier, encodeCallback, keyboard, render, sendTelegram, start, yandexEvents };
