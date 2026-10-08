const test = require('node:test');
const assert = require('node:assert/strict');
const id = 'abcdef12-3456-4789-abcd-0123456789ab';
const compact = 'abcdef1234564789abcd0123456789ab';
const CATALOG = {
  p1: { name: 'Витамин C', unitPrice: 120000 }, p2: { name: 'Омега-3', unitPrice: 300000 },
  p3: { name: 'Цинк', unitPrice: 50000 }, p4: { name: 'Магний', unitPrice: 80000 },
};

function order(extra = {}) {
  return { id, externalId: 'Y-100', itemsRevision: 1, itemsFrozen: false, accountingStatus: 'received', actions: ['accept', 'reject'],
    items: [{ billzProductId: 'p1', name: 'Витамин C', quantity: 2, unitPrice: 120000 }, { billzProductId: 'p2', name: 'Омега-3', quantity: 1, unitPrice: 300000 }],
    totalAmount: 540000, ...extra };
}
// Mirrors the hub: optimistic itemsRevision, server-side names and prices.
function fakeHub(state) {
  const calls = [];
  return { calls, state, async requestInternal(method, segments, options = {}) {
    calls.push([method, segments.slice(2).join('/'), options]);
    if (method === 'GET' && segments[2] === 'products') {
      const search = (options.query?.search || '').toLowerCase();
      return { ok: true, body: { items: Object.entries(CATALOG).filter(([, item]) => item.name.toLowerCase().includes(search))
        .map(([billzProductId, item]) => ({ billzProductId, ...item, availableQuantity: 5 })) } };
    }
    if (method === 'GET') return { ok: true, body: { data: state.order } };
    const body = options.body;
    if (body.expectedItemsRevision !== state.order.itemsRevision) return { ok: false, status: 409, body: { error: 'yandex_items_revision_conflict' } };
    if (body.items.some((item) => item.quantity > 5)) return { ok: false, status: 409, body: { error: 'yandex_unavailable' } };
    const items = body.items.map((item) => ({ ...item, name: CATALOG[item.billzProductId].name, unitPrice: CATALOG[item.billzProductId].unitPrice }));
    state.order = { ...state.order, items, itemsRevision: state.order.itemsRevision + 1,
      totalAmount: items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0) };
    return { ok: true, body: { order: state.order } };
  } };
}
function setup({ role = 'admin', current = order() } = {}) {
  const { registerYandexActions } = require('../services/yandexTelegramAction');
  const { createYandexTelegramEditor } = require('../services/yandexTelegramEditor');
  const state = { order: current, role }; const hub = fakeHub(state);
  const editor = createYandexTelegramEditor({ hub,
    UserModel: { findOne: async ({ telegramId }) => (state.role === 'admin' ? { role: 'admin', telegramId, firstName: 'Ali' } : null) } });
  const actions = []; let text;
  registerYandexActions({ action: (pattern, handler) => actions.push([pattern, handler]), on: (_type, handler) => { text = handler; } }, { editor });
  const tap = async (data, from = 77) => {
    const ctx = { from: { id: from }, chat: { type: 'private', id: from }, callbackQuery: { data, message: { message_id: 500 } },
      answers: [], edits: [], replies: [],
      answerCbQuery: async (value) => { ctx.answers.push(value); },
      editMessageText: async (body, options) => { ctx.edits.push({ text: body, options }); },
      reply: async (body, options) => { ctx.replies.push({ text: body, options }); return { message_id: 900 + ctx.replies.length }; } };
    await actions.find(([pattern]) => pattern.test(data))[1](ctx);
    return ctx;
  };
  const type = async (message, from = 77) => {
    const ctx = { from: { id: from }, chat: { type: 'private', id: from }, message, replies: [],
      reply: async (body, options) => { ctx.replies.push({ text: body, options }); return { message_id: 950 }; } };
    let passed = false; await text(ctx, async () => { passed = true; });
    return { ctx, passed };
  };
  return { state, hub, tap, type };
}
const keyboard = (view) => (view.options.reply_markup.inline_keyboard || []).flat();
const find = (view, label) => keyboard(view).find((button) => button.text === label)?.callback_data;
// A product's buttons sit in the row right under its name row.
function under(view, name, label) {
  const rows = view.options.reply_markup.inline_keyboard;
  const at = rows.findIndex((row) => row.length === 1 && row[0].text.includes(` ${name} · `));
  return at < 0 ? undefined : rows[at + 1]?.find((button) => button.text === label)?.callback_data;
}
const saves = (hub) => hub.calls.filter(([method]) => method === 'PUT');

test('editor callbacks are strict and every button fits Telegram 64 bytes', () => {
  const { parseEditorCallback, editorView } = require('../services/yandexTelegramEditor');
  assert.deepEqual(parseEditorCallback(`ye:m:${compact}:1:0`), { op: 'm', orderId: id, itemsRevision: 1, index: 0 });
  assert.deepEqual(parseEditorCallback(`ye:q:${compact}:1:2`), { op: 'q', orderId: id, itemsRevision: 1, index: 2 });
  assert.deepEqual(parseEditorCallback(`ye:i:${compact}:1:0`), { op: 'i', orderId: id, itemsRevision: 1, index: 0 });
  assert.deepEqual(parseEditorCallback(`ye:f:${compact}:z`), { op: 'f', orderId: id, itemsRevision: 35 });
  assert.deepEqual(parseEditorCallback('ye:a:Ab-_0123'), { op: 'a', key: 'Ab-_0123' });
  for (const value of [`ye:m:${compact}:1`, `ye:q:${compact}:1`, `ye:f:${compact}:1:0`, `ye:m:${compact}:0:0`, `ye:m:${compact}:01:0`, `ye:m:${compact}:1:00`,
    `ye:x:${compact}:1:0`, `ye:m:${compact.toUpperCase()}:1:0`, `ye:m:${compact}:1:0\n`, 'ye:a:short', null, 'ye:' + 'x'.repeat(80)]) {
    assert.equal(parseEditorCallback(value), null, String(value));
  }
  const many = order({ itemsRevision: Number.MAX_SAFE_INTEGER, items: Array.from({ length: 40 }, (_, index) => ({ billzProductId: `p${index}`, name: `Товар ${index}`, quantity: 2, unitPrice: 1 })) });
  const view = editorView(many);
  const buttons = view.markup.inline_keyboard.flat();
  assert.ok(buttons.length <= 100); assert.ok(buttons.every((button) => Buffer.byteLength(button.callback_data) <= 64));
  assert.ok(buttons.every((button) => parseEditorCallback(button.callback_data)));
  assert.match(view.text, /после 24-го/);
  // Every product gets its own name row, then plainly worded buttons; the last piece has no ➖.
  assert.deepEqual(editorView(order()).markup.inline_keyboard.map((row) => row.map(({ text }) => text)), [
    ['📦 1. Витамин C · 2 шт'], ['➖ 1 шт', '➕ 1 шт', '🗑 Удалить'], ['📦 2. Омега-3 · 1 шт'], ['➕ 1 шт', '🗑 Удалить'],
    ['➕ Добавить товар', '🔍 Найти товар'], ['✅ Готово'],
  ]);
  assert.match(editorView(order()).text, /🗑 Удалить — убрать товар из заказа целиком/);
  assert.deepEqual(editorView(order({ itemsFrozen: true })).markup, { inline_keyboard: [] });
  assert.match(editorView(order({ itemsFrozen: true })).text, /зафиксирован/);
  assert.match(editorView(order({ items: [{ billzProductId: 'p', name: '<b>&', quantity: 1, unitPrice: 1 }] })).text, /&lt;b&gt;&amp;/);
});

test('card button opens a picking message; minus, plus and a confirmed delete save at once through the hub', async () => {
  const { hub, tap } = setup();
  const opened = await tap(`ya:e:${compact}:5:1`);
  assert.equal(opened.replies.length, 1); assert.equal(opened.replies[0].options.reply_parameters.message_id, 500);
  assert.match(opened.replies[0].text, /Витамин C<\/b>\n\s+2 шт × 120 000 UZS = 240 000 UZS/); assert.match(opened.replies[0].text, /Итого: <b>540 000 UZS/);
  let view = opened.replies[0];
  const minus = await tap(under(view, 'Витамин C', '➖ 1 шт'));
  assert.deepEqual(saves(hub)[0][2].body, { items: [{ billzProductId: 'p1', quantity: 1 }, { billzProductId: 'p2', quantity: 1 }],
    expectedItemsRevision: 1, reason: 'Изменено в Telegram', actor: { type: 'telegram', telegramId: 77, name: 'Ali' } });
  assert.equal(minus.answers[0], 'Убрана 1 шт'); view = minus.edits[0]; assert.match(view.text, /1 шт × 120 000 UZS = 120 000 UZS/);
  assert.equal(under(view, 'Витамин C', '➖ 1 шт'), undefined);
  const floor = await tap(`ye:m:${compact}:2:0`);
  assert.match(floor.answers[0], /Осталась 1 шт.*🗑 Удалить/); assert.equal(saves(hub).length, 1);
  const plus = await tap(under(view, 'Омега-3', '➕ 1 шт')); view = plus.edits[0];
  assert.equal(plus.answers[0], 'Добавлена 1 шт');
  assert.deepEqual(saves(hub)[1][2].body.items, [{ billzProductId: 'p1', quantity: 1 }, { billzProductId: 'p2', quantity: 2 }]);
  const info = await tap(keyboard(view).find((button) => button.text.startsWith('📦 2. Омега-3')).callback_data);
  assert.match(info.answers[0], /^Омега-3: 2 шт × 300 000 UZS/); assert.equal(info.edits.length, 0);
  // 🗑 only asks; the order changes on «✅ Да, удалить», and «↩️ Не удалять» keeps it.
  const ask = await tap(under(view, 'Витамин C', '🗑 Удалить'));
  assert.equal(saves(hub).length, 2); assert.match(ask.edits[0].text, /Удалить «Витамин C» из заказа\?/);
  assert.equal(under(ask.edits[0], 'Омега-3', '🗑 Удалить') !== undefined, true);
  const kept = await tap(under(ask.edits[0], 'Витамин C', '↩️ Не удалять'));
  assert.equal(saves(hub).length, 2); assert.doesNotMatch(kept.edits[0].text, /Удалить «/);
  const asked = (await tap(under(kept.edits[0], 'Витамин C', '🗑 Удалить'))).edits[0];
  const removed = await tap(under(asked, 'Витамин C', '✅ Да, удалить')); view = removed.edits[0];
  assert.deepEqual(saves(hub)[2][2].body.items, [{ billzProductId: 'p2', quantity: 2 }]); assert.equal(removed.answers[0], 'Товар удалён из заказа');
  assert.doesNotMatch(view.text, /Витамин C/); assert.match(view.text, /Итого: <b>600 000 UZS/);
  const done = await tap(find(view, '✅ Готово'));
  assert.deepEqual(done.edits[0].options.reply_markup, { inline_keyboard: [] });
  assert.match(done.edits[0].text, /Готово, состав сохранён/); assert.match(done.edits[0].text, /нажмите «✅ Принять»/);
});

test('stale buttons, stock limits and other admins never save a guessed composition', async () => {
  const { hub, state, tap } = setup();
  const first = (await tap(`ya:e:${compact}:5:1`)).replies[0];
  await tap(under(first, 'Витамин C', '➕ 1 шт'));
  const stale = await tap(under(first, 'Омега-3', '🗑 Удалить'));
  assert.equal(saves(hub).length, 1); assert.match(stale.answers[0], /Состав изменился/); assert.match(stale.edits[0].text, /3 шт × 120 000/);
  const staleDelete = await tap(`ye:d:${compact}:1:1`);
  assert.equal(saves(hub).length, 1); assert.match(staleDelete.answers[0], /Состав изменился/);
  state.order = { ...state.order, items: [{ ...state.order.items[0], quantity: 5 }] };
  const limit = await tap(under(stale.edits[0], 'Витамин C', '➕ 1 шт'));
  assert.equal(limit.answers[0], 'Столько нет в наличии'); assert.equal(state.order.items[0].quantity, 5);
  state.role = 'user';
  const denied = await tap(under(limit.edits[0], 'Витамин C', '➖ 1 шт'));
  assert.equal(denied.answers[0], 'Доступ запрещён'); assert.equal(saves(hub).length, 2);
});

test('catalogue page and typed search add products that are not yet in the order', async () => {
  const { hub, tap, type } = setup();
  const editor = (await tap(`ya:e:${compact}:5:1`)).replies[0];
  const list = (await tap(find(editor, '➕ Добавить товар'))).edits[0];
  assert.deepEqual(keyboard(list).map((button) => button.text).slice(0, 2), ['Магний · 80 000 UZS', 'Цинк · 50 000 UZS']);
  assert.ok(!keyboard(list).some((button) => /Витамин|Омега/.test(button.text)));
  assert.equal((await tap(find(list, 'Цинк · 50 000 UZS'), 88)).answers[0], 'Кнопка устарела. Откройте список снова.');
  const added = await tap(find(list, 'Цинк · 50 000 UZS'));
  assert.deepEqual(saves(hub)[0][2].body.items.at(-1), { billzProductId: 'p3', quantity: 1 }); assert.match(added.edits[0].text, /Цинк<\/b>\n\s+1 шт × 50 000/);
  assert.equal(added.answers[0], 'Товар добавлен в заказ');
  const prompt = await tap(find(added.edits[0], '🔍 Найти товар'));
  assert.equal(prompt.replies[0].options.reply_markup.force_reply, true);
  assert.equal((await type({ text: 'привет' })).passed, true);
  assert.equal((await type({ text: 'маг', reply_to_message: { message_id: 901 } }, 88)).passed, true);
  const found = await type({ text: 'маг', reply_to_message: { message_id: 901 } });
  assert.equal(found.passed, false);
  assert.deepEqual(hub.calls.filter(([, path]) => path === 'products').at(-1)[2].query, { search: 'маг', limit: 100 });
  const results = found.ctx.replies[0];
  assert.match(results.text, /Поиск: «маг»/); assert.deepEqual(keyboard(results).map((button) => button.text)[0], 'Магний · 80 000 UZS');
  await tap(find(results, 'Магний · 80 000 UZS'));
  assert.deepEqual(saves(hub)[1][2].body.items.at(-1), { billzProductId: 'p4', quantity: 1 });
});

test('accepted or locked orders open no editor and refuse further picking', async () => {
  const { hub, state, tap } = setup({ current: order({ itemsFrozen: true, accountingStatus: 'reserved', actions: ['cooking', 'reject'] }) });
  const opened = await tap(`ya:e:${compact}:5:1`);
  assert.equal(opened.replies.length, 0); assert.equal(opened.answers[0], 'Состав уже зафиксирован');
  state.order = order();
  const editor = (await tap(`ya:e:${compact}:5:1`)).replies[0];
  state.order = { ...state.order, itemsFrozen: true, accountingStatus: 'reserved' };
  const late = await tap(under(editor, 'Витамин C', '🗑 Удалить'));
  assert.equal(late.answers[0], 'Состав уже зафиксирован'); assert.deepEqual(late.edits[0].options.reply_markup, { inline_keyboard: [] });
  assert.equal(saves(hub).length, 0);
});
