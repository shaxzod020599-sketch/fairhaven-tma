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
// Three buttons per line; Telegram caps an inline keyboard at 100 buttons.
const MAX_LINES = 30;
const TTL_MS = 30 * 60 * 1000;
const REASON = 'Изменено в Telegram';
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
  const match = /^ye:([mpdlsfb]):([a-f\d]{32}):([\da-z]{1,11})(?::([\da-z]{1,3}))?$/.exec(value);
  if (!match) return null;
  const [, op, id, revision, arg] = match;
  const itemsRevision = number(revision); const index = arg === undefined ? null : number(arg);
  if (!itemsRevision || (arg !== undefined && index === null) || ('mpdl'.includes(op) !== (arg !== undefined))) return null;
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

function editorView(order, { closed = false } = {}) {
  const open = !closed && editable(order);
  const data = (op, arg) => `ye:${op}:${compact(order.id)}:${order.itemsRevision.toString(36)}${arg === undefined ? '' : `:${arg.toString(36)}`}`;
  const lines = [`✏️ <b>Состав · Yandex ${escape(short(order.externalId, 80))}</b>`, ''];
  order.items.forEach((item, index) => lines.push(`${index + 1}. ${escape(short(item.name || item.billzProductId, 120))} — ${item.quantity} × ${money(item.unitPrice)}`));
  if (!order.items.length) lines.push('Состав пуст: добавьте товар или отклоните заказ.');
  lines.push('', `Итого: <b>${money(order.totalAmount)}</b>`);
  if (open && order.items.length > MAX_LINES) lines.push(`Строки после ${MAX_LINES}-й меняются в панели.`);
  lines.push(closed ? '✅ Редактор закрыт. Состав сохранён.'
    : open ? 'Изменения сразу видит Yandex. Состав фиксируется кнопкой «Принять».' : '🔒 Состав зафиксирован. Изменения недоступны.');
  const text = lines.join('\n');
  if (!open) return { text: short(text, 4000), markup: { inline_keyboard: [] } };
  const rows = order.items.slice(0, MAX_LINES).map((_item, index) => [
    button(`➖ ${index + 1}`, data('m', index)), button(`➕ ${index + 1}`, data('p', index)), button(`🗑 ${index + 1}`, data('d', index)),
  ]);
  rows.push([button('➕ Добавить товар', data('l', 0)), button('🔍 Поиск', data('s'))], [button('✅ Готово', data('f'))]);
  return { text: short(text, 4000), markup: { inline_keyboard: rows } };
}

function productsView(order, products, { page = 0, search = '', pick }) {
  const data = (op, arg) => `ye:${op}:${compact(order.id)}:${order.itemsRevision.toString(36)}${arg === undefined ? '' : `:${arg.toString(36)}`}`;
  const pages = Math.max(1, Math.ceil(products.length / PAGE));
  const current = search ? 0 : Math.min(page, pages - 1);
  const shown = search ? products.slice(0, PAGE * 2) : products.slice(current * PAGE, current * PAGE + PAGE);
  const lines = [`➕ <b>Добавить в заказ Yandex ${escape(short(order.externalId, 80))}</b>`,
    search ? `Поиск: «${escape(short(search, 120))}»` : `Страница ${current + 1} из ${pages}`];
  if (!shown.length) lines.push('Доступных товаров не найдено.');
  const rows = shown.map((product) => [button(`${short(product.name, 40)} · ${money(product.unitPrice)}`, `ye:a:${pick(product)}`)]);
  const nav = [];
  if (!search && current > 0) nav.push(button('◀️', data('l', current - 1)));
  if (!search && current < pages - 1) nav.push(button('▶️', data('l', current + 1)));
  if (nav.length) rows.push(nav);
  rows.push([button('🔍 Поиск', data('s')), button('⬅️ К составу', data('b'))]);
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
    return ctx.answerCbQuery('Редактор состава открыт');
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
      if (target.op === 'm' && line.quantity <= 1) return ctx.answerCbQuery('Минимум 1 шт. Чтобы убрать строку, нажмите 🗑');
      items = target.op === 'd' ? items.filter((item) => item !== line)
        : items.map((item) => item === line ? { ...item, quantity: item.quantity + (target.op === 'p' ? 1 : -1) } : item);
    }
    const result = await save(order, items, actor);
    await show(ctx, editorView(result.order || await load(order.id)));
    return ctx.answerCbQuery(result.order ? 'Сохранено' : MESSAGES[result.code] || 'Не удалось сохранить. Проверьте заказ в панели.');
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
