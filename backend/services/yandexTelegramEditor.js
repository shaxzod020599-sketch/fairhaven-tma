const { randomBytes } = require('node:crypto');
const User = require('../models/User');
const channelHub = require('../utils/channelHub');
const { actorFor, safeCode } = require('../controllers/yandexController');

/*
 * Picking a Yandex order from Telegram: the same composition edits the admin
 * panel offers (fewer or more pieces, removed lines, catalogue additions)
 * until the order is accepted. Every tap is saved through the hub at once, so
 * Yandex and the durable order cards see it; this message only mirrors it.
 */
const PAGE = 8;
// Up to four buttons per line (its name row, then ➖ ➕ 🗑) plus three closing
// ones; Telegram caps an inline keyboard at 100 buttons.
const MAX_LINES = 24;
const TTL_MS = 30 * 60 * 1000;
const REASON = 'Изменено в Telegram';
const SAVED = { m: 'Убрана 1 шт', p: 'Добавлена 1 шт', d: 'Товар удалён из заказа', a: 'Товар добавлен в заказ' };
const MESSAGES = {
  yandex_forbidden: 'Доступ запрещён',
  yandex_disabled: 'Yandex отключён',
  yandex_items_revision_conflict: 'Состав изменился. Проверьте и повторите.',
  yandex_items_locked: 'Состав уже зафиксирован',
  yandex_unavailable: 'Столько нет в наличии',
  yandex_invalid_items: 'Недопустимый состав',
  yandex_not_found: 'Заказ не найден',
};

function createStore({ ttlMs = TTL_MS, limit = 2000, now = Date.now } = {}) {
  const map = new Map();
  const live = (entry) => entry && now() - entry.at <= ttlMs;
  return {
    put(value) {
      const key = randomBytes(6).toString('base64url');
      this.set(key, value);
      return key;
    },
    set(key, value) {
      map.delete(key); map.set(key, { value, at: now() });
      while (map.size > limit) map.delete(map.keys().next().value);
    },
    get(key) { const entry = map.get(key); return live(entry) ? entry.value : null; },
  };
}

const compact = (id) => id.replace(/-/g, '');
const expand = (value) => `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
function number(raw) {
  const value = parseInt(raw, 36);
  return Number.isSafeInteger(value) && value.toString(36) === raw ? value : null;
}
function parseEditorCallback(value) {
  if (typeof value !== 'string' || Buffer.byteLength(value) > 64) return null;
  const pick = /^ye:a:([\w-]{8})$/.exec(value);
  if (pick) return { op: 'a', key: pick[1] };
  // i = a line's name button, q = asks before d deletes that line.
  const match = /^ye:([mpdqilsfb]):([a-f\d]{32}):([\da-z]{1,11})(?::([\da-z]{1,3}))?$/.exec(value);
  if (!match) return null;
  const [, op, id, revision, arg] = match;
  const itemsRevision = number(revision); const index = arg === undefined ? null : number(arg);
  if (!itemsRevision || (arg !== undefined && index === null) || ('mpdqil'.includes(op) !== (arg !== undefined))) return null;
  return { op, orderId: expand(id), itemsRevision, ...(index === null ? {} : { index }) };
}

function escape(value) {
  return String(value ?? '').replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[char]);
}
function money(value) {
  const [whole, fraction] = String(Math.round(Number(value || 0) * 100) / 100).split('.');
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}${fraction ? `,${fraction}` : ''} UZS`;
}
function short(value, limit) {
  const chars = [...String(value || '')];
  return chars.length > limit ? `${chars.slice(0, limit - 1).join('')}…` : chars.join('');
}
function editable(order) {
  return Array.isArray(order?.actions) && order.actions.length > 0 && !order.itemsFrozen
    && ['received', 'failed'].includes(order.accountingStatus);
}
const button = (text, data) => ({ text, callback_data: data });

const nameOf = (item) => item.name || item.billzProductId;

/** `confirm` is the line whose 🗑 was tapped: its buttons turn into «yes, delete» / «keep it». */
function editorView(order, { closed = false, confirm = null } = {}) {
  const open = !closed && editable(order);
  const asking = open ? order.items[confirm] : null;
  const data = (op, arg) => `ye:${op}:${compact(order.id)}:${order.itemsRevision.toString(36)}${arg === undefined ? '' : `:${arg.toString(36)}`}`;
  const lines = [`✏️ <b>Состав заказа Yandex ${escape(short(order.externalId, 80))}</b>`, ''];
  order.items.forEach((item, index) => lines.push(`${index + 1}. <b>${escape(short(nameOf(item), 120))}</b>`,
    `      ${item.quantity} шт × ${money(item.unitPrice)} = ${money(item.quantity * item.unitPrice)}`));
  if (!order.items.length) lines.push('В заказе не осталось товаров: добавьте товар или отклоните заказ.');
  lines.push('', `Итого: <b>${money(order.totalAmount)}</b>`, '');
  if (closed) {
    lines.push('✅ Готово, состав сохранён.');
    if (order.actions?.includes('accept')) lines.push('Теперь нажмите «✅ Принять» в карточке заказа.');
  } else if (!open) {
    lines.push('🔒 Состав зафиксирован: заказ уже принят или закрыт. Изменить нельзя.');
  } else {
    if (asking) lines.push(`❓ <b>Удалить «${escape(short(nameOf(asking), 120))}» из заказа?</b>`, 'Нажмите «✅ Да, удалить» или «↩️ Не удалять».', '');
    lines.push('<b>Как изменить</b> — кнопки под названием товара:', '➖ 1 шт — на одну штуку меньше', '➕ 1 шт — на одну штуку больше',
      '🗑 Удалить — убрать товар из заказа целиком', '',
      'Каждое нажатие сразу сохраняется и видно Yandex. Закончили — нажмите «✅ Готово», затем «✅ Принять» в карточке заказа.');
    if (order.items.length > MAX_LINES) lines.push(`Товары после ${MAX_LINES}-го меняются в панели.`);
  }
  const text = lines.join('\n');
  if (!open) return { text: short(text, 4000), markup: { inline_keyboard: [] } };
  const rows = order.items.slice(0, MAX_LINES).flatMap((item, index) => [
    [button(`📦 ${index + 1}. ${short(nameOf(item), 36)} · ${item.quantity} шт`, data('i', index))],
    item === asking ? [button('✅ Да, удалить', data('d', index)), button('↩️ Не удалять', data('b'))] : [
      // The last piece leaves only through 🗑, so ➖ never silently removes a product.
      ...(item.quantity > 1 ? [button('➖ 1 шт', data('m', index))] : []),
      button('➕ 1 шт', data('p', index)), button('🗑 Удалить', data('q', index)),
    ],
  ]);
  rows.push([button('➕ Добавить товар', data('l', 0)), button('🔍 Найти товар', data('s'))], [button('✅ Готово', data('f'))]);
  return { text: short(text, 4000), markup: { inline_keyboard: rows } };
}

function productsView(order, products, { page = 0, search = '', pick }) {
  const data = (op, arg) => `ye:${op}:${compact(order.id)}:${order.itemsRevision.toString(36)}${arg === undefined ? '' : `:${arg.toString(36)}`}`;
  const pages = Math.max(1, Math.ceil(products.length / PAGE));
  const current = search ? 0 : Math.min(page, pages - 1);
  const shown = search ? products.slice(0, PAGE * 2) : products.slice(current * PAGE, current * PAGE + PAGE);
  const lines = [`➕ <b>Добавить в заказ Yandex ${escape(short(order.externalId, 80))}</b>`,
    search ? `Поиск: «${escape(short(search, 120))}»` : `Страница ${current + 1} из ${pages}`];
  lines.push(shown.length ? 'Нажмите на товар — он добавится в заказ (1 шт).' : 'Доступных товаров не найдено.');
  const rows = shown.map((product) => [button(`${short(product.name, 40)} · ${money(product.unitPrice)}`, `ye:a:${pick(product)}`)]);
  const nav = [];
  if (!search && current > 0) nav.push(button('◀️', data('l', current - 1)));
  if (!search && current < pages - 1) nav.push(button('▶️', data('l', current + 1)));
  if (nav.length) rows.push(nav);
  rows.push([button('🔍 Найти товар', data('s')), button('⬅️ К составу', data('b'))]);
  return { text: lines.join('\n'), markup: { inline_keyboard: rows } };
}

function createYandexTelegramEditor({ UserModel = User, hub = channelHub, picks = createStore(), prompts = createStore() } = {}) {
  async function actorOf(telegramId) {
    if (!Number.isSafeInteger(telegramId) || telegramId <= 0) return null;
    const user = await UserModel.findOne({ telegramId, role: 'admin', botBlocked: { $ne: true } });
    return user?.botBlocked ? null : actorFor(user, 'telegram');
  }
  async function load(orderId) {
    const result = await hub.requestInternal('GET', ['internal', 'yandex', 'orders', orderId]);
    if (!result.ok || !result.body?.data) throw Object.assign(new Error('load'), { code: safeCode(result) });
    return result.body.data;
  }
  async function catalog(order, search = '') {
    const result = await hub.requestInternal('GET', ['internal', 'yandex', 'products'], { query: { search: search.slice(0, 120), limit: 100 } });
    if (!result.ok) throw Object.assign(new Error('products'), { code: safeCode(result) });
    const present = new Set(order.items.map((item) => item.billzProductId));
    return (result.body?.items || []).filter((item) => !present.has(item.billzProductId))
      .sort((a, b) => String(a.name).localeCompare(String(b.name), 'ru'));
  }
  async function save(order, items, actor) {
    const result = await hub.requestInternal('PUT', ['internal', 'yandex', 'orders', order.id, 'items'], { body: {
      items: items.map(({ billzProductId, quantity }) => ({ billzProductId, quantity })),
      expectedItemsRevision: order.itemsRevision, reason: REASON, actor,
    } });
    return result.ok && result.body?.order ? { order: result.body.order } : { code: safeCode(result) };
  }
  const pickFor = (order, telegramId) => (product) => picks.put({ orderId: order.id, itemsRevision: order.itemsRevision,
    billzProductId: product.billzProductId, telegramId });
  async function show(ctx, view) {
    try { await ctx.editMessageText(view.text, { parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: view.markup }); }
    catch (error) { if (!/message is not modified/i.test(error?.description || error?.message || '')) throw error; }
  }

  /** «✏️ Изменить состав» on the order card: a picking message of its own. */
  async function open(ctx, orderId) {
    const actor = await actorOf(ctx.from?.id);
    if (!actor) return ctx.answerCbQuery(MESSAGES.yandex_forbidden);
    const order = await load(orderId);
    if (!editable(order)) return ctx.answerCbQuery(MESSAGES.yandex_items_locked);
    const view = editorView(order);
    const card = ctx.callbackQuery?.message?.message_id;
    await ctx.reply(view.text, { parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: view.markup,
      ...(card ? { reply_parameters: { message_id: card, allow_sending_without_reply: true } } : {}) });
    return ctx.answerCbQuery('Состав открыт — сообщение ниже');
  }

  async function handle(ctx, input) {
    const telegramId = ctx.from?.id;
    const actor = await actorOf(telegramId);
    if (!actor) return ctx.answerCbQuery(MESSAGES.yandex_forbidden);
    let target = input;
    if (input.op === 'a') {
      const pick = picks.get(input.key);
      if (!pick || pick.telegramId !== telegramId) return ctx.answerCbQuery('Кнопка устарела. Откройте список снова.');
      target = { ...pick, op: 'a' };
    }
    const order = await load(target.orderId);
    if (target.op === 'f') { await show(ctx, editorView(order, { closed: true })); return ctx.answerCbQuery('Готово'); }
    if (target.op === 'b') { await show(ctx, editorView(order)); return ctx.answerCbQuery(); }
    if (!editable(order)) { await show(ctx, editorView(order)); return ctx.answerCbQuery(MESSAGES.yandex_items_locked); }
    if (target.op === 'l') {
      await show(ctx, productsView(order, await catalog(order), { page: target.index, pick: pickFor(order, telegramId) }));
      return ctx.answerCbQuery();
    }
    if (target.op === 's') {
      const prompt = await ctx.reply(`🔍 Напишите название или штрихкод товара для заказа Yandex ${short(order.externalId, 80)}`,
        { reply_markup: { force_reply: true, input_field_placeholder: 'Название товара' } });
      if (prompt?.message_id) prompts.set(`${ctx.chat.id}:${prompt.message_id}`, { orderId: order.id, telegramId });
      return ctx.answerCbQuery();
    }
    if (order.itemsRevision !== target.itemsRevision) {
      await show(ctx, editorView(order));
      return ctx.answerCbQuery(MESSAGES.yandex_items_revision_conflict);
    }
    let items = order.items.map(({ billzProductId, quantity }) => ({ billzProductId, quantity }));
    if (target.op === 'a') {
      const line = items.find((item) => item.billzProductId === target.billzProductId);
      items = line ? items.map((item) => item === line ? { ...item, quantity: item.quantity + 1 } : item)
        : [...items, { billzProductId: target.billzProductId, quantity: 1 }];
    } else {
      const line = items[target.index];
      if (!line) { await show(ctx, editorView(order)); return ctx.answerCbQuery(MESSAGES.yandex_items_revision_conflict); }
      const shown = order.items[target.index];
      if (target.op === 'i') {
        return ctx.answerCbQuery(short(`${nameOf(shown)}: ${shown.quantity} шт × ${money(shown.unitPrice)}. Кнопки под названием меняют этот товар.`, 200));
      }
      if (target.op === 'q') { await show(ctx, editorView(order, { confirm: target.index })); return ctx.answerCbQuery('Подтвердите удаление кнопкой ниже'); }
      if (target.op === 'm' && line.quantity <= 1) return ctx.answerCbQuery('Осталась 1 шт. Чтобы убрать товар, нажмите «🗑 Удалить»');
      items = target.op === 'd' ? items.filter((item) => item !== line)
        : items.map((item) => item === line ? { ...item, quantity: item.quantity + (target.op === 'p' ? 1 : -1) } : item);
    }
    const result = await save(order, items, actor);
    await show(ctx, editorView(result.order || await load(order.id)));
    return ctx.answerCbQuery(result.order ? SAVED[target.op] : MESSAGES[result.code] || 'Не удалось сохранить. Проверьте заказ в панели.');
  }

  /** A typed reply to the search prompt; any other text continues to the bot's own handlers. */
  async function search(ctx, next) {
    const reply = ctx.message?.reply_to_message;
    const prompt = reply && ctx.chat?.type === 'private' ? prompts.get(`${ctx.chat.id}:${reply.message_id}`) : null;
    if (!prompt || prompt.telegramId !== ctx.from?.id) return next();
    try {
      if (!(await actorOf(ctx.from.id))) return ctx.reply(MESSAGES.yandex_forbidden);
      const order = await load(prompt.orderId);
      if (!editable(order)) return ctx.reply(MESSAGES.yandex_items_locked);
      const text = String(ctx.message.text || '').trim().slice(0, 120);
      const view = productsView(order, await catalog(order, text), { ...(text ? { search: text } : {}), pick: pickFor(order, ctx.from.id) });
      return ctx.reply(view.text, { parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: view.markup });
    } catch (_) { return ctx.reply('Сервис временно недоступен'); }
  }

  return { open, handle, search };
}

module.exports = { MESSAGES, parseEditorCallback, editorView, productsView, createStore, createYandexTelegramEditor };
