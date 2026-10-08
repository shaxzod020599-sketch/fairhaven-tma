const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { MongoMemoryServer } = require('../../backend/node_modules/mongodb-memory-server');
process.env.BILLZ_SECRET_TOKEN = 'local-test';
process.env.BILLZ_SHOP_ID = 'local-shop';
process.env.BILLZ_WRITE_ENABLED = 'false';
process.env.CHANNEL_TELEGRAM_ENABLED = 'false';
process.env.YANDEX_ENABLED = 'true';
process.env.CHANNEL_INTERNAL_TOKEN = 'local-internal-test-token';
let mongod; let db; let config; let Order; let admins;
const at = new Date('2026-09-08T10:00:00Z');
test.before(async () => {
  mongod = await MongoMemoryServer.create(); process.env.MONGO_URI = mongod.getUri();
  db = require('../src/db'); await db.connect(); config = require('../src/config');
  Order = require('../src/models/ChannelOrder')(); await Order.init();
  admins = db.getConnection().collection('users');
});
test.beforeEach(async () => {
  config.yandex.enabled = true; config.billzWriteEnabled = true;
  config.telegram.enabled = false; config.telegram.botToken = ''; config.telegram.ordersChannelId = '-100999';
  await Order.deleteMany({}); await admins.deleteMany({});
  await admins.insertMany([{ telegramId: 77, role: 'admin' }, { telegramId: 88, role: 'admin' },
    { telegramId: 99, role: 'user' }, { telegramId: 100, role: 'admin', botBlocked: true },
    ...[-100, 0, 1.5, 9007199254740992].map((telegramId) => ({ telegramId, role: 'admin' }))]);
});
test.after(async () => { await db?.disconnect(); await mongod?.stop(); });
async function row(extra = {}) {
  return (await Order.create({ channel: 'yandex', internalOrderId: randomUUID(), externalId: randomUUID(),
    status: 'received', items: [{ billzProductId: 'p', name: 'Vitamin', quantity: 2, unitPrice: 100 }], totalAmount: 200,
    customer: { name: 'Customer', phone: '+998000000000' },
    yandex: { requestSnapshot: { items: [] }, ...extra } })).toObject();
}
const read = (input) => Order.findById(input._id).lean();
function notifier(options = {}) {
  return require('../src/yandex/notifications').createNotifier({ Model: Order,
    AdminModel: require('../src/models/AdminView')(), enabled: () => true, now: () => at, ...options });
}
test('partial send failure persists recipients and retry skips already delivered cards', async () => {
  const input = await row(); const calls = []; let fail = true;
  const worker = notifier({ send: async (method, payload) => {
    calls.push({ method, payload });
    if (payload.chat_id === '88' && fail) throw new Error('fake send failure');
    return { message_id: Number(payload.chat_id) + 1 };
  } });
  await worker.deliver(input);
  let stored = await read(input);
  assert.equal(stored.yandex.notification.pending, true);
  assert.deepEqual(stored.yandex.notification.messages.map((m) => m.chatId), ['77']);
  assert.match(stored.yandex.notification.messages[0].key, /^[a-f\d]{64}$/);
  assert.equal(+stored.yandex.notification.retryAt, +at + 15000);
  fail = false; await worker.deliver(input); stored = await read(input);
  assert.deepEqual(calls.map((c) => c.payload.chat_id), ['77', '88', '88']);
  assert.equal(stored.yandex.notification.pending, false);
  assert.equal(stored.yandex.notification.messages.length, 2);
  assert.equal(stored.yandex.notification.token, '');
});
test('Yandex-side status changes reach each admin once as a reply to the card', async () => {
  const input = await row(); const calls = []; let replyFails = false;
  const worker = notifier({ send: async (method, payload) => {
    calls.push({ method, payload });
    if (replyFails && payload.reply_parameters) return null;
    return { message_id: payload.message_id || Number(payload.chat_id) + 1 };
  } });
  await worker.deliver(input);
  assert.deepEqual((await read(input)).yandex.notification.messages.map((m) => +new Date(m.announcedAt)), [+at, +at]);
  let tick = 0;
  const event = async (action, outcome, extra = {}) => Order.updateOne({ _id: input._id }, {
    $set: { 'yandex.notification.pending': true, ...extra }, $inc: { 'yandex.revision': 1 },
    $push: { 'yandex.audit': { action, actor: { type: action === 'accept' ? 'admin' : 'yandex' }, reason: 'нет курьера', at: new Date(+at + (tick += 1000)), outcome } } });
  const replies = () => calls.filter((c) => c.payload.reply_parameters).map((c) => [c.payload.chat_id, c.payload.reply_parameters.message_id, c.payload.text]);
  calls.length = 0; await event('accept', 'completed'); await worker.deliver(input);
  assert.deepEqual(replies(), []);
  calls.length = 0; replyFails = true;
  await event('TAKEN_BY_COURIER', 'received', { 'yandex.fulfillmentStatus': 'TAKEN_BY_COURIER' }); await worker.deliver(input);
  assert.equal((await read(input)).yandex.notification.pending, true);
  calls.length = 0; replyFails = false; await worker.deliver(input);
  assert.deepEqual(calls.map((c) => c.method), ['sendMessage', 'sendMessage']);
  assert.deepEqual(replies().map(([chat, id]) => [chat, id]), [['77', 78], ['88', 89]]);
  assert.match(replies()[0][2], /курьер забрал заказ/);
  calls.length = 0; await Order.updateOne({ _id: input._id }, { $set: { 'yandex.notification.pending': true }, $inc: { 'yandex.revision': 1 } });
  await worker.deliver(input); assert.deepEqual(replies(), []);
  calls.length = 0;
  await event('reject', 'requested', { 'yandex.fulfillmentStatus': 'CANCELLED', 'yandex.cancelRequested': { at } }); await worker.deliver(input);
  assert.equal(replies().length, 2); assert.match(replies()[0][2], /Yandex отменил заказ[^]*Причина: нет курьера/);
  assert.equal((await read(input)).yandex.notification.pending, false);
});
test('partial edit failure retries only failed recipient with latest status and no actions', async () => {
  const input = await row(); let fail = false; const calls = [];
  const worker = notifier({ send: async (method, payload) => {
    calls.push({ method, payload });
    return fail && payload.chat_id === '77' ? null : { message_id: Number(payload.chat_id) };
  } });
  await worker.deliver(input); calls.length = 0; fail = true;
  await Order.updateOne({ _id: input._id }, { $set: { status: 'sold', 'yandex.fulfillmentStatus': 'READY',
    'yandex.acceptedAt': at, 'yandex.readyAt': at, 'yandex.reconciliationRequired': true, 'yandex.notification.pending': true },
  $inc: { 'yandex.revision': 1 } });
  await worker.deliver(input); assert.equal((await read(input)).yandex.notification.pending, true);
  fail = false; await worker.deliver(input);
  assert.deepEqual(calls.map((c) => [c.method, c.payload.chat_id]), [['editMessageText', '77'], ['editMessageText', '88'], ['editMessageText', '77']]);
  assert.equal((await read(input)).yandex.notification.pending, false);
  for (const call of calls) {
    assert.match(call.payload.text, /Статус: 📦 Готов/); assert.match(call.payload.text, /Billz: продано/);
    assert.deepEqual(call.payload.reply_markup.inline_keyboard, []);
  }
});
test('role or botBlocked change between recipients prevents fresh sends and edits', async () => {
  for (const existing of [false, true]) {
    for (const patch of [{ role: 'user' }, { botBlocked: true }]) {
      await admins.updateOne({ telegramId: 88 }, { $set: { role: 'admin', botBlocked: false } });
      const input = await row();
      if (existing) await notifier({ send: async () => ({ message_id: 5 }) }).deliver(input);
      await Order.updateOne({ _id: input._id }, { $inc: { 'yandex.revision': 1 } });
      const calls = [];
      await notifier({ send: async (method, payload) => {
        calls.push({ method, payload });
        if (payload.chat_id === '77') await admins.updateOne({ telegramId: 88 }, { $set: patch });
        return { message_id: 5 };
      } }).deliver(input);
      const second = calls.find((call) => call.payload.chat_id === '88');
      if (existing) {
        assert.equal(second.method, 'editMessageReplyMarkup'); assert.equal(second.payload.text, undefined);
        assert.deepEqual(second.payload.reply_markup, { inline_keyboard: [] });
      } else assert.equal(second, undefined);
      assert.ok(calls.every((call) => ['77', '88'].includes(call.payload.chat_id)));
    }
  }
});
test('failed revoked keyboard removal stays tracked and retries without fresh content', async () => {
  const input = await row(); await notifier({ send: async () => ({ message_id: 5 }) }).deliver(input);
  await admins.updateMany({}, { $set: { role: 'user' } });
  const calls = []; let fail = true;
  const worker = notifier({ send: async (method, payload) => {
    calls.push({ method, payload });
    if (fail && payload.chat_id === '77') throw new Error('fake removal failure');
    return { message_id: 5 };
  } });
  await worker.deliver(input);
  assert.deepEqual((await read(input)).yandex.notification.messages.map((m) => m.chatId), ['77']);
  assert.equal((await read(input)).yandex.notification.pending, true);
  fail = false; await worker.deliver(input);
  assert.deepEqual((await read(input)).yandex.notification.messages, []);
  assert.deepEqual(calls.map((c) => c.payload.chat_id), ['77', '88', '77']);
  assert.ok(calls.every((c) => c.method === 'editMessageReplyMarkup' && c.payload.text === undefined));
});
test('lease loss after send prevents delivery acknowledgement and further sends', async () => {
  const input = await row(); let sends = 0;
  await notifier({ send: async () => {
    sends += 1;
    await Order.updateOne({ _id: input._id }, { $set: { 'yandex.notification.token': 'new-owner',
      'yandex.notification.leaseUntil': new Date(+at + 120000), 'yandex.notification.retryAt': new Date(+at + 9000) } });
    return { message_id: 5 };
  } }).deliver(input);
  const stored = await read(input);
  assert.equal(sends, 1); assert.deepEqual(stored.yandex.notification.messages, []);
  assert.equal(stored.yandex.notification.token, 'new-owner');
  assert.equal(+stored.yandex.notification.retryAt, +at + 9000);
  assert.equal(stored.yandex.notification.pending, true);
});
test('expired lease cannot be refreshed or acknowledged by old owner', async () => {
  const input = await row(); let time = +at; let sends = 0;
  await notifier({ now: () => new Date(time), send: async () => {
    sends += 1; time += 120001; return { message_id: 5 };
  } }).deliver(input);
  const stored = await read(input);
  assert.equal(sends, 1); assert.deepEqual(stored.yandex.notification.messages, []);
  assert.equal(stored.yandex.notification.pending, true);
  assert.ok(stored.yandex.notification.token);
});
test('lease is checked after slow current-role lookup before delivery', async () => {
  const input = await row(); let sends = 0;
  const actual = require('../src/models/AdminView')();
  const AdminModel = { find: actual.find, findOne: (...args) => ({ lean: async () => {
    const admin = await actual.findOne(...args).lean();
    await Order.updateOne({ _id: input._id }, { $set: { 'yandex.notification.token': 'new-owner' } });
    return admin;
  } }) };
  await notifier({ AdminModel, send: async () => { sends += 1; return { message_id: 5 }; } }).deliver(input);
  assert.equal(sends, 0); assert.equal((await read(input)).yandex.notification.token, 'new-owner');
});
test('concurrent order revision leaves newer pending work untouched', async () => {
  const input = await row(); let sends = 0;
  await notifier({ send: async () => {
    sends += 1;
    if (sends === 1) await Order.updateOne({ _id: input._id }, { $inc: { 'yandex.revision': 1 },
      $set: { 'yandex.notification.pending': true, 'yandex.notification.retryAt': null } });
    return { message_id: 5 };
  } }).deliver(input);
  const stored = await read(input);
  assert.equal(stored.yandex.revision, 2); assert.equal(stored.yandex.notification.pending, true);
  assert.equal(stored.yandex.notification.retryAt, null);
  assert.equal(stored.yandex.notification.token, '');
});
test('active lease excludes concurrent drains and expired claim can be reclaimed', async () => {
  const input = await row(); let sends = 0; let release; let entered;
  const gate = new Promise((resolve) => { release = resolve; });
  const started = new Promise((resolve) => { entered = resolve; });
  const worker = notifier({ send: async () => { sends += 1; entered(); await gate; return { message_id: 5 }; } });
  const first = worker.deliver(input); await started;
  await worker.deliver(input); assert.equal(sends, 1); release(); await first;
  await Order.updateOne({ _id: input._id }, { $set: { 'yandex.notification.token': 'expired',
    'yandex.notification.leaseUntil': new Date(+at - 1), 'yandex.notification.pending': true } });
  await worker.deliver(input); assert.equal((await read(input)).yandex.notification.token, '');
});
test('disabled notifier emits nothing and consumes no pending work for every configuration gate', async () => {
  const input = await row(); const before = await read(input);
  for (const [yandex, telegram, token] of [[false, true, 'fake'], [true, false, 'fake'], [true, true, '']]) {
    config.yandex.enabled = yandex; config.telegram.enabled = telegram; config.telegram.botToken = token;
    const worker = require('../src/yandex/notifications').createNotifier({ Model: Order,
      send: async () => assert.fail('disabled notifier sent') });
    await worker.deliver(input); await worker.drainOnce();
    assert.deepEqual(await read(input), before);
    assert.equal(require('../src/yandex/notifications').start(), null);
  }
});
test('operation presentation retries at stale threshold without revision change or financial calls', async (t) => {
  const core = require('../src/core/orders'); const life = require('../src/yandex/lifecycle');
  const effects = [];
  for (const method of ['acceptOrder', 'reserveOrder', 'completeOrder', 'cancelOrder']) {
    t.mock.method(core, method, async () => { effects.push(method); });
  }
  t.mock.method(life, 'drainCancellations', async () => { effects.push('drainCancellations'); });
  for (const kind of ['yandex', 'billz']) {
    const input = await row(kind === 'yandex' ? { operation: { token: 'op', startedAt: at } } : {});
    if (kind === 'billz') await Order.updateOne({ _id: input._id }, { $set: { 'billz.operationToken': 'op', 'billz.operationStartedAt': at } });
    let time = +at; const calls = [];
    const worker = notifier({ now: () => new Date(time), send: async (method, payload) => { calls.push({ method, payload }); return { message_id: 5 }; } });
    await worker.drainOnce(); let stored = await read(input);
    assert.equal(stored.yandex.notification.pending, false); assert.equal(+stored.yandex.notification.retryAt, +at + 300000);
    assert.match(calls.at(-1).payload.text, /обрабатывается/); assert.doesNotMatch(calls.at(-1).payload.text, /сверка/);
    const count = calls.length; time += 299999; await worker.drainOnce(); assert.equal(calls.length, count);
    time += 1; await worker.drainOnce(); stored = await read(input);
    assert.equal(calls.length, count + 2); assert.match(calls.at(-1).payload.text, /сверка/);
    assert.equal(stored.yandex.revision, 1); assert.equal(stored.billz.attempts, 0);
    assert.equal(stored.yandex.notification.retryAt, null);
    await Order.deleteOne({ _id: input._id });
  }
  assert.deepEqual(effects, []);
});
test('each recipient keyboard and text share one presentation timestamp', async (t) => {
  const input = await row(); const times = [];
  const life = require('../src/yandex/lifecycle'); const cleanOrder = life.cleanOrder;
  t.mock.method(life, 'cleanOrder', (item, timestamp, flags) => {
    times.push(+timestamp); return cleanOrder(item, timestamp, flags);
  });
  let time = +at;
  await notifier({ now: () => new Date(time++), send: async () => ({ message_id: 5 }) }).deliver(input);
  assert.equal(times.length, 4); assert.equal(times[0], times[1]); assert.equal(times[2], times[3]);
});
for (const recipients of [1, 2]) {
  test(`presentation crossing stale threshold retains follow-up for early cards (${recipients} recipients)`, async (t) => {
    if (recipients === 1) await admins.deleteOne({ telegramId: 88 });
    const effects = [];
    const core = require('../src/core/orders'); const life = require('../src/yandex/lifecycle');
    for (const method of ['acceptOrder', 'reserveOrder', 'completeOrder', 'cancelOrder']) {
      t.mock.method(core, method, async () => { effects.push(method); });
    }
    t.mock.method(life, 'drainCancellations', async () => { effects.push('cancellation'); });
    for (const kind of ['yandex', 'billz']) {
      const input = await row(kind === 'yandex' ? { operation: { token: 'op', startedAt: at } } : {});
      if (kind === 'billz') await Order.updateOne({ _id: input._id }, { $set: { 'billz.operationToken': 'op', 'billz.operationStartedAt': at } });
      let time = +at + 299995; const calls = [];
      const worker = notifier({ now: () => new Date(time), send: async (method, payload) => {
        calls.push({ method, payload }); time += 10; return { message_id: Number(payload.chat_id) };
      } });
      await worker.drainOnce();
      const early = await read(input);
      assert.doesNotMatch(calls[0].payload.text, /сверка/);
      if (recipients === 2) assert.match(calls[1].payload.text, /сверка/);
      assert.equal(+early.yandex.notification.retryAt, +at + 300000);
      await worker.drainOnce();
      assert.deepEqual(calls.map((call) => [call.method, call.payload.chat_id]), recipients === 1
        ? [['sendMessage', '77'], ['editMessageText', '77']]
        : [['sendMessage', '77'], ['sendMessage', '88'], ['editMessageText', '77']]);
      assert.match(calls.at(-1).payload.text, /сверка/);
      const current = await read(input);
      assert.equal(current.yandex.revision, 1); assert.equal(current.yandex.notification.pending, false);
      assert.equal(current.yandex.notification.retryAt, null);
      assert.deepEqual(current.yandex.notification.messages.find((message) => message.chatId === '88'),
        early.yandex.notification.messages.find((message) => message.chatId === '88'));
      await Order.deleteOne({ _id: input._id });
    }
    assert.deepEqual(effects, []);
  });
}
test('cards bound escaped HTML entities and Unicode while retaining status, totals and fixed panel link', async () => {
  const input = await row(); const { render, keyboard } = require('../src/yandex/notifications');
  input.externalId = '<>&😀\ud800'.repeat(1000);
  input.customer.name = '<script>&😀'.repeat(1000);
  input.items = Array.from({ length: 200 }, () => ({ name: '<>&😀'.repeat(1000), quantity: 2, unitPrice: 100 }));
  const text = render(input, at);
  assert.ok(text.length < 4000); assert.equal(text.isWellFormed(), true);
  assert.match(text, /&lt;&gt;&amp;😀/); assert.doesNotMatch(text, /<script>/);
  assert.match(text, /Заказ Yandex/); assert.match(text, /Статус: 🆕 Новый/); assert.match(text, /Billz: товар ещё не списан/);
  assert.match(text, /Итого: <b>200 UZS<\/b>/); assert.match(text, /— 2 шт × 100 UZS/); assert.match(text, /Полный состав — в панели/);
  assert.match(text, /<a href="https:\/\/admin\.fairhaven\.uz\/orders">[^<]+<\/a>/);
  const plain = text.replace(/<a href="https:\/\/admin\.fairhaven\.uz\/orders">[^<]+<\/a>/, '').replace(/<\/?b>/g, '').replace(/&amp;|&lt;|&gt;/g, '');
  assert.doesNotMatch(plain, /[<>&]/);
  const small = render({ ...(await row()), totalAmount: 1234567.5 }, at);
  assert.match(small, /Итого: <b>1 234 567,5 UZS<\/b>/); assert.match(small, /«✏️ Изменить состав»/);
  assert.ok(keyboard(input, at).inline_keyboard.some((r) => r[0].text.includes('Принять')));
  assert.deepEqual(keyboard(input, at).inline_keyboard[0].map(({ text }) => text), ['✏️ Изменить состав']);
  assert.match(keyboard(input, at).inline_keyboard[0][0].callback_data, /^ya:e:[a-f\d]{32}:[\da-z]+:[\da-z]+$/);
  assert.ok(!keyboard({ ...input, yandex: { ...input.yandex, itemsFrozen: true } }, at).inline_keyboard.some((r) => r[0].callback_data.startsWith('ya:e:')));
  config.billzWriteEnabled = false; assert.match(render(input, at), /отключ/);
  assert.ok(!keyboard(input, at).inline_keyboard.some((r) => r[0].callback_data?.startsWith('ya:a:')));
  input.yandex.cancellationPending = true; assert.match(render(input, at), /отмен/);
  assert.deepEqual(keyboard(input, at).inline_keyboard, []);
});
test('notifier scheduling runs only notification drain and stops with cleared timer', async (t) => {
  const module = require('../src/yandex/notifications');
  config.telegram.enabled = true; config.telegram.botToken = 'local-fake';
  t.mock.timers.enable({ apis: ['setInterval'] });
  let ticks = 0;
  const timer = module.start({ notifier: { drainOnce: async () => { ticks += 1; } } });
  await Promise.resolve(); assert.equal(ticks, 1);
  t.mock.timers.tick(5000); await Promise.resolve(); assert.equal(ticks, 2);
  clearInterval(timer); t.mock.timers.tick(10000); await Promise.resolve(); assert.equal(ticks, 2);
});
test('Telegram transport reaches real channel role and stale-revision fences without financial effects', async (t) => {
  const express = require('express'); const app = express(); app.use(express.json());
  app.use('/internal', require('../src/routes/internal'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const input = await row();
  const life = require('../src/yandex/lifecycle');
  const decisionSpy = t.mock.method(life, 'decide');
  const UserModel = { findOne: (query) => admins.findOne(query) };
  let demote = true; let requests = 0;
  const service = require('../../backend/services/yandexTelegramAction').createYandexTelegramAction({ UserModel,
    hub: { requestInternal: async (method, segments, { body }) => {
      requests += 1;
      if (demote) await admins.updateOne({ telegramId: 77 }, { $set: { role: 'user' } });
      const path = require('../../backend/utils/channelHub').buildPath(segments);
      const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { method,
        headers: { 'Content-Type': 'application/json', 'X-Internal-Token': 'local-internal-test-token' }, body: JSON.stringify(body) });
      return { ok: response.ok, status: response.status, body: await response.json() };
    } },
  });
  for (const action of ['accept', 'cooking', 'ready', 'reject']) {
    await admins.updateOne({ telegramId: 77 }, { $set: { role: 'admin' } });
    assert.equal((await service.respond({ telegramId: 77, orderId: input.internalOrderId, action,
      expectedRevision: 1, expectedItemsRevision: 1 })).code, 'yandex_forbidden');
  }
  assert.equal(decisionSpy.mock.callCount(), 0);
  demote = false; await admins.updateOne({ telegramId: 77 }, { $set: { role: 'admin' } });
  await Order.updateOne({ _id: input._id }, { $inc: { 'yandex.revision': 1 } });
  const stale = await service.respond({ telegramId: 77, orderId: input.internalOrderId, action: 'accept', expectedRevision: 1, expectedItemsRevision: 1 });
  assert.equal(stale.code, 'yandex_revision_conflict'); assert.equal(requests, 5);
  assert.equal(decisionSpy.mock.callCount(), 1);
  const stored = await read(input); assert.equal(stored.billz.attempts, 0); assert.equal(stored.yandex.operation, null);
});
function defaultTransport(t, fetcher) {
  config.telegram.enabled = true; config.telegram.botToken = 'local-synthetic';
  const calls = []; const logs = []; const waits = [];
  const timer = globalThis.setTimeout;
  // Accelerate the old shared helper's sleeps so its retry defect fails promptly.
  // The real network guard is never called or changed: every fetch is a fake.
  t.mock.method(globalThis, 'setTimeout', (callback, delay, ...args) => {
    if ([500, 1000, 30000].includes(delay)) { waits.push(delay); return timer(callback, 0, ...args); }
    return timer(callback, delay, ...args);
  });
  t.mock.method(require('../src/logger'), 'warn', (...args) => { logs.push(args); });
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const target = new URL(url);
    assert.equal(target.origin, 'https://api.telegram.org');
    const method = target.pathname.split('/').at(-1);
    const payload = JSON.parse(options.body);
    calls.push({ method, payload, redirect: options.redirect, signal: options.signal });
    return fetcher({ method, payload, options, count: calls.length });
  });
  return { calls, logs, waits };
}
const telegramResponse = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body });
test('actual default transport makes one 429 request and durable retry rechecks demoted admin after retry_after', async (t) => {
  const input = await row({ notification: { pending: true, messages: [{ chatId: '77', messageId: 7, key: 'old' }] } });
  let time = +at;
  const f = defaultTransport(t, async ({ payload, count }) => {
    if (count === 1) {
      await admins.updateOne({ telegramId: 77 }, { $set: { role: 'user' } });
      return telegramResponse(429, { ok: false, parameters: { retry_after: 60 } });
    }
    return telegramResponse(200, { ok: true, result: { message_id: payload.message_id || 8 } });
  });
  const worker = notifier({ now: () => new Date(time) });
  await worker.drainOnce();
  assert.equal(f.calls.length, 1); assert.deepEqual(f.waits, []);
  assert.equal(+((await read(input)).yandex.notification.retryAt), +at + 60000);
  time += 59999; await worker.drainOnce(); assert.equal(f.calls.length, 1);
  time += 1; await worker.drainOnce();
  assert.deepEqual(f.calls.map((c) => [c.method, c.payload.chat_id]),
    [['editMessageText', '77'], ['sendMessage', '88'], ['editMessageReplyMarkup', '77']]);
  assert.equal(f.calls.at(-1).payload.text, undefined); assert.deepEqual(f.logs, []);
  assert.ok(f.calls.every((call) => call.redirect === 'error'));
  const stored = await read(input); assert.equal(stored.yandex.notification.pending, false);
  assert.deepEqual(stored.yandex.notification.messages.map((message) => message.chatId), ['88']);
});
test('default transport validates retry_after and never persists unrepresentable or earlier retry timestamps', async (t) => {
  await admins.deleteOne({ telegramId: 88 });
  let retryAfter;
  const f = defaultTransport(t, async () => telegramResponse(429, { ok: false, parameters: { retry_after: retryAfter } }));
  const lastRepresentableSeconds = Math.floor((8640000000000000 - +at) / 1000);
  for (const [value, delay] of [[60, 60000], [1, 15000], [lastRepresentableSeconds, lastRepresentableSeconds * 1000],
    ...[undefined, null, 0, -1, 1.5, '60', [60], {}, Number.MAX_SAFE_INTEGER, lastRepresentableSeconds + 1].map((value) => [value, 15000])]) {
    retryAfter = value; const input = await row(); const before = f.calls.length;
    await notifier().deliver(input);
    assert.equal(f.calls.length - before, 1, 'exactly one fetch');
    const stored = await read(input);
    assert.equal(+stored.yandex.notification.retryAt, +at + delay);
    assert.equal(stored.yandex.notification.pending, true);
  }
  assert.deepEqual(f.waits, []); assert.deepEqual(f.logs, []);
});
for (const failure of ['429', 'timeout']) {
  test(`actual default ${failure} with lease loss cannot retry or persist stale work`, async (t) => {
    const input = await row(); let persisted;
    const f = defaultTransport(t, async ({ options }) => {
      await Order.updateOne({ _id: input._id }, { $set: { 'yandex.notification.token': 'new-owner',
        'yandex.notification.leaseUntil': new Date(+at + 120000), 'yandex.notification.retryAt': new Date(+at + 9000) } });
      persisted = (await read(input)).yandex.notification;
      if (failure === '429') return telegramResponse(429, { ok: false, parameters: { retry_after: 60 } });
      return new Promise((_resolve, reject) => {
        const abort = () => reject(new Error('synthetic timeout'));
        if (options.signal.aborted) abort(); else options.signal.addEventListener('abort', abort, { once: true });
      });
    });
    if (failure === 'timeout') {
      const timer = globalThis.setTimeout;
      t.mock.method(globalThis, 'setTimeout', (callback, delay, ...args) => timer(callback, delay === 8000 ? 0 : delay, ...args));
    }
    await notifier().deliver(input);
    assert.equal(f.calls.length, 1); assert.deepEqual(f.logs, []); assert.deepEqual(f.waits, []);
    if (failure === 'timeout') assert.equal(f.calls[0].signal.aborted, true);
    assert.deepEqual((await read(input)).yandex.notification, persisted);
  });
}
test('default 429 cooldown survives concurrent revision and blocks stale workers until exact boundary', async (t) => {
  const input = await row(); let time = +at;
  const f = defaultTransport(t, async ({ count }) => {
    if (count === 1) {
      await Order.updateOne({ _id: input._id }, { $inc: { 'yandex.revision': 1 },
        $set: { 'yandex.notification.pending': true, 'yandex.notification.retryAt': null } });
      return telegramResponse(429, { ok: false, parameters: { retry_after: 60 } });
    }
    return telegramResponse(200, { ok: true, result: { message_id: 5 } });
  });
  const worker = notifier({ now: () => new Date(time) });
  await worker.deliver(input);
  const stored = await read(input);
  assert.equal(f.calls.length, 1); assert.equal(stored.yandex.revision, 2);
  assert.equal(stored.yandex.notification.pending, true); assert.equal(stored.yandex.notification.retryAt, null);
  assert.equal(stored.yandex.notification.token, '');
  time += 5000; await worker.drainOnce(); assert.equal(f.calls.length, 1, 'revision must not bypass Telegram cooldown');
  const restarted = notifier({ now: () => new Date(time) });
  await Promise.all([worker.deliver(input), restarted.deliver(input)]);
  assert.equal(f.calls.length, 1, 'atomic claims must reject stale preselected rows');
  assert.deepEqual(await read(input), stored, 'blocked claims must preserve new revision work');
  time = +at + 59999; await restarted.drainOnce(); await restarted.deliver(input);
  assert.equal(f.calls.length, 1);
  assert.equal(+(await read(input)).yandex.notification.cooldownUntil, +at + 60000);
  time += 1; await restarted.drainOnce();
  assert.deepEqual(f.calls.map((call) => call.payload.chat_id), ['77', '77', '88']);
  const delivered = await read(input); assert.equal(delivered.yandex.revision, 2);
  assert.equal(delivered.yandex.notification.pending, false);
  assert.equal(+delivered.yandex.notification.cooldownUntil, +at + 60000, 'expired cooldown need not be cleared');
});
test('actual lifecycle revision reset keeps persisted cooldown across notifier restart', async (t) => {
  const input = await row(); let time = +at; const effects = [];
  const core = require('../src/core/orders');
  for (const method of ['acceptOrder', 'reserveOrder', 'completeOrder', 'cancelOrder']) {
    t.mock.method(core, method, async () => { effects.push(method); });
  }
  const f = defaultTransport(t, async ({ count }) => count === 1
    ? telegramResponse(429, { ok: false, parameters: { retry_after: 60 } })
    : telegramResponse(200, { ok: true, result: { message_id: 5 } }));
  await notifier({ now: () => new Date(time) }).drainOnce();
  assert.equal(f.calls.length, 1);
  assert.equal(+(await read(input)).yandex.notification.retryAt, +at + 60000);
  const life = require('../src/yandex/lifecycle').createLifecycle({ Model: Order, now: () => new Date(time) });
  await life.callback(input.internalOrderId, { status: 'TAKEN_BY_COURIER' });
  const changed = await read(input);
  assert.equal(changed.yandex.revision, 2); assert.equal(changed.yandex.notification.retryAt, null);
  assert.equal(changed.yandex.notification.pending, true);
  time += 5000;
  const restarted = notifier({ now: () => new Date(time) });
  await restarted.drainOnce(); await restarted.deliver(input);
  assert.equal(f.calls.length, 1, 'lifecycle pending reset must retain Telegram not-before');
  assert.deepEqual(await read(input), changed);
  time = +at + 60000; await restarted.drainOnce();
  assert.equal(f.calls.length, 3); assert.match(f.calls.at(-1).payload.text, /Статус: 🚚 У курьера/);
  assert.equal((await read(input)).yandex.revision, 2); assert.deepEqual(effects, []);
});
test('cooldown persistence is monotonic when longer deadline arrives during in-flight response', async (t) => {
  const input = await row(); let time = +at;
  const f = defaultTransport(t, async ({ count }) => {
    if (count !== 1) return telegramResponse(200, { ok: true, result: { message_id: 5 } });
    const owned = (await read(input)).yandex.notification.token;
    // Model an already recorded longer deadline while this same lease owns delivery.
    await Order.collection.updateOne({ _id: input._id, 'yandex.notification.token': owned },
      { $set: { 'yandex.notification.cooldownUntil': new Date(+at + 120000) } });
    return telegramResponse(429, { ok: false, parameters: { retry_after: 60 } });
  });
  await notifier({ now: () => new Date(time) }).deliver(input);
  assert.equal(+(await read(input)).yandex.notification.cooldownUntil, +at + 120000);
  const restarted = notifier({ now: () => new Date(time) });
  time += 60000; await restarted.drainOnce(); await restarted.deliver(input);
  assert.equal(f.calls.length, 1, 'shorter response must not replace longer cooldown');
  time = +at + 119999; await restarted.drainOnce(); assert.equal(f.calls.length, 1);
  time += 1; await restarted.drainOnce(); assert.equal(f.calls.length, 3);
});
test('drain excludes cooled orders before batch limit and accepts missing/null/expired cooldowns', async (t) => {
  await Promise.all(Array.from({ length: 50 }, () => row({ notification: {
    pending: true, retryAt: null, cooldownUntil: new Date(+at + 60000),
  } })));
  const missing = await row();
  await Order.collection.updateOne({ _id: missing._id }, { $unset: { 'yandex.notification.cooldownUntil': '' } });
  const noCooldown = await row({ notification: { pending: true, cooldownUntil: null } });
  const expired = await row({ notification: { pending: true, cooldownUntil: new Date(+at - 1) } });
  const f = defaultTransport(t, async () => telegramResponse(200, { ok: true, result: { message_id: 5 } }));
  await notifier().drainOnce();
  assert.equal(f.calls.length, 6, 'future cooldowns must not consume the 50-order selection limit');
  for (const input of [missing, noCooldown, expired]) {
    assert.equal((await read(input)).yandex.notification.pending, false);
    assert.equal(f.calls.filter((call) => call.payload.text.includes(input.externalId)).length, 2);
  }
});
test('actual default errors, redirects and malformed responses fail once without logging payloads', async (t) => {
  await admins.deleteOne({ telegramId: 88 });
  let scenario;
  const f = defaultTransport(t, async () => {
    if (scenario === 'network') throw new Error('synthetic private error');
    if (scenario === 'json') return { status: 200, ok: true, json: async () => { throw new Error('synthetic private body'); } };
    if (scenario === 'redirect') return telegramResponse(302, { ok: true, result: { message_id: 5 } });
    if (scenario === 'server') return telegramResponse(500, { ok: true, result: { message_id: 5 } });
    if (scenario === 'not-ok') return telegramResponse(200, { ok: false });
    return telegramResponse(200, { ok: true, result: { message_id: scenario } });
  });
  for (const kind of ['network', 'json', 'redirect', 'server', 'not-ok', 0, -1, 1.5, '5', Number.MAX_SAFE_INTEGER + 1]) {
    scenario = kind; const input = await row(); const before = f.calls.length;
    await notifier().deliver(input);
    assert.equal(f.calls.length - before, 1);
    assert.equal(f.calls.at(-1).redirect, 'error');
    const stored = await read(input);
    assert.equal(stored.yandex.notification.pending, true); assert.deepEqual(stored.yandex.notification.messages, []);
    assert.equal(+stored.yandex.notification.retryAt, +at + 15000);
  }
  assert.deepEqual(f.logs, []); assert.deepEqual(f.waits, []);
});
test('actual default unchanged text/keyboard edits succeed without retries; send is not an unchanged edit', async (t) => {
  await admins.deleteOne({ telegramId: 88 });
  const f = defaultTransport(t, async () => telegramResponse(400, { ok: false, description: 'Bad Request: message is not modified: unchanged' }));
  const input = await row({ notification: { pending: true, messages: [{ chatId: '77', messageId: 7, key: 'old' }] } });
  await notifier().deliver(input);
  let stored = await read(input); assert.equal(stored.yandex.notification.pending, false);
  assert.equal(stored.yandex.notification.messages[0].messageId, 7);
  await admins.updateOne({ telegramId: 77 }, { $set: { role: 'user' } });
  await notifier().deliver(input); stored = await read(input);
  assert.deepEqual(stored.yandex.notification.messages, []);
  assert.deepEqual(f.calls.map((call) => call.method), ['editMessageText', 'editMessageReplyMarkup']);
  await admins.updateOne({ telegramId: 77 }, { $set: { role: 'admin' } });
  const fresh = await row(); await notifier().deliver(fresh);
  assert.equal((await read(fresh)).yandex.notification.pending, true);
  assert.equal(f.calls.length, 3); assert.deepEqual(f.logs, []); assert.deepEqual(f.waits, []);
});
test('Yandex single-attempt transport allows only three fixed Telegram methods', async (t) => {
  const f = defaultTransport(t, async () => telegramResponse(200, { ok: true, result: { message_id: 5 } }));
  const { sendTelegram } = require('../src/yandex/notifications');
  assert.equal(typeof sendTelegram, 'function');
  for (const method of ['deleteMessage', '../sendMessage', 'sendMessage?x=1', ['sendMessage'], null]) {
    assert.equal(await sendTelegram(method, {}), null);
  }
  assert.equal(f.calls.length, 0);
  for (const method of ['sendMessage', 'editMessageText', 'editMessageReplyMarkup']) {
    assert.deepEqual(await sendTelegram(method, { chat_id: '77', message_id: 5 }), { message_id: 5 });
  }
  assert.equal(f.calls.length, 3); assert.ok(f.calls.every((call) => call.redirect === 'error'));
});
