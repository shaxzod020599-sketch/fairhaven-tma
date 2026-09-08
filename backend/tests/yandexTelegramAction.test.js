const test = require('node:test');
const assert = require('node:assert/strict');
const id = 'abcdef12-3456-4789-abcd-0123456789ab';
const compact = 'abcdef1234564789abcd0123456789ab';
const serviceModule = () => require('../services/yandexTelegramAction');
test('channel encoder and backend parser roundtrip four actions and safe revision boundaries within 64 bytes', () => {
  const { encodeCallback } = require('../../channel/src/yandex/notifications');
  const { parseCallback } = serviceModule();
  for (const action of ['accept', 'cooking', 'ready', 'reject']) {
    for (const revision of [1, 35, 36, Number.MAX_SAFE_INTEGER]) {
      const encoded = encodeCallback(id, action, revision, Number.MAX_SAFE_INTEGER);
      assert.ok(Buffer.byteLength(encoded) <= 64);
      assert.deepEqual(parseCallback(encoded), { orderId: id, action, expectedRevision: revision, expectedItemsRevision: Number.MAX_SAFE_INTEGER });
    }
  }
  assert.equal(encodeCallback(id, 'accept', 36, 1), `ya:a:${compact}:10:1`);
  for (const revision of [0, -1, 1.5, '1', Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(encodeCallback(id, 'accept', revision, 1), null);
    assert.equal(encodeCallback(id, 'accept', 1, revision), null);
  }
  assert.equal(encodeCallback('../uzum', 'accept', 1, 1), null);
  assert.equal(encodeCallback(`${id}\n`, 'accept', 1, 1), null);
  assert.equal(encodeCallback(id, 'delivered', 1, 1), null);
  assert.equal(encodeCallback(id, ['accept'], 1, 1), null);
});
test('strict parser rejects old, foreign, noncanonical and unsafe callback values', () => {
  const { parseCallback } = serviceModule();
  for (const value of [null, [], {}, 1, `uz:a:${id}`, `ma:a:${compact}`, `ya:a:${id}:1:1`, `ya:accept:${compact}:1:1`,
    `ya:a:${compact}`, `ya:a:${compact}:1`, `ya:a:${compact.toUpperCase()}:1:1`, `ya:a:${compact}:01:1`,
    `ya:a:${compact}:0:1`, `ya:a:${compact}:-1:1`, `ya:a:${compact}:1:0`, `ya:a:${compact}:1:01`,
    `ya:a:${compact}:1:1\n`, `ya:a:${compact}:1:1:extra`, `ya:a:${compact}:2gosa7pa2gw:1`,
    `ya:a:${compact}:1:2gosa7pa2gw`, `ya:a:${compact}:A:1`, 'ya:' + 'x'.repeat(100)]) assert.equal(parseCallback(value), null, String(value));
});
test('Telegram action resolves current role and botBlocked for every mutation, never trusts supplied actor', async () => {
  const { createYandexTelegramAction } = serviceModule();
  let role = 'admin'; let blocked = false; const calls = [];
  const service = createYandexTelegramAction({ UserModel: { findOne: async () => ({ role, botBlocked: blocked, telegramId: 77, firstName: 'Ali' }) },
    hub: { requestInternal: async (...args) => { calls.push(args); return { ok: true, body: { order: { id }, idempotent: false } }; } } });
  const input = { telegramId: 77, orderId: id, action: 'accept', expectedRevision: 5, expectedItemsRevision: 3, actor: { telegramId: 999 }, role: 'admin' };
  assert.equal((await service.respond(input)).ok, true);
  assert.deepEqual(calls[0], ['POST', ['internal', 'yandex', 'orders', id, 'decision'], { body: {
    action: 'accept', reason: '', expectedRevision: 5, expectedItemsRevision: 3, actor: { type: 'telegram', telegramId: 77, name: 'Ali' },
  } }]);
  role = 'user'; assert.equal((await service.respond(input)).code, 'yandex_forbidden');
  role = 'admin'; blocked = true; assert.equal((await service.respond(input)).code, 'yandex_forbidden');
  for (const patch of [{ telegramId: -1 }, { telegramId: '77' }, { orderId: [] }, { action: 'delivered' },
    { expectedRevision: 0 }, { expectedRevision: '5' }, { expectedItemsRevision: undefined }, { reason: {} }, { reason: 'x'.repeat(301) }]) {
    assert.equal((await service.respond({ ...input, ...patch })).ok, false);
  }
  assert.equal(calls.length, 1);
});
test('callbacks acknowledge stale/disabled/pending/reconciliation errors once without mutation retries or card edits', async () => {
  const { registerYandexActions, createYandexTelegramAction } = serviceModule();
  let pattern; let handler; let code = 'yandex_revision_conflict'; let calls = 0;
  const service = createYandexTelegramAction({ UserModel: { findOne: async () => ({ role: 'admin', telegramId: 77 }) },
    hub: { requestInternal: async () => { calls += 1; return { ok: false, body: { error: code } }; } } });
  registerYandexActions({ action: (p, h) => { pattern = p; handler = h; } }, { actionService: service });
  const answers = [];
  const ctx = { from: { id: 77 }, chat: { type: 'private', id: 77 }, callbackQuery: { data: `ya:a:${compact}:5:3` },
    answerCbQuery: async (text) => { answers.push(text); },
    editMessageText: () => assert.fail('callback must not edit card'), editMessageReplyMarkup: () => assert.fail('callback must not edit keyboard') };
  for (const nextCode of ['yandex_revision_conflict', 'yandex_items_revision_conflict', 'yandex_disabled', 'yandex_operation_in_progress', 'yandex_reconciliation_required', 'yandex_accounting_disabled']) {
    code = nextCode; await handler(ctx);
  }
  assert.equal(calls, 6); assert.equal(answers.length, 6);
  assert.match(answers[0], /устарел|измен/); assert.match(answers[1], /состав|измен/);
  assert.match(answers[2], /отключ/); assert.match(answers[3], /обрабатывается/); assert.match(answers[4], /сверка/);
  assert.match(answers[5], /Учёт отключ/);
  assert.equal(pattern.test(`uz:a:${id}`), false); assert.equal(pattern.test(`ma:a:${compact}`), false);
  for (const data of [`ya:a:${compact}`, `ya:a:${compact}:0:1`, `uz:a:${id}`]) {
    ctx.callbackQuery.data = data; await handler(ctx);
  }
  ctx.callbackQuery.data = `ya:a:${compact}:5:3`; ctx.chat.type = 'group'; await handler(ctx);
  assert.equal(calls, 6);
});
test('reject callback uses explicit bounded Telegram-admin reason; success only acknowledges', async () => {
  const { registerYandexActions } = serviceModule(); let handler; let input; let answer;
  registerYandexActions({ action: (_p, h) => { handler = h; } }, { actionService: {
    respond: async (value) => { input = value; return { ok: true }; },
  } });
  await handler({ from: { id: 77 }, chat: { type: 'private', id: 77 }, callbackQuery: { data: `ya:x:${compact}:5:3` },
    answerCbQuery: async (text) => { answer = text; } });
  assert.equal(input.action, 'reject'); assert.match(input.reason, /Telegram/); assert.ok(input.reason.length <= 300);
  assert.equal(input.expectedRevision, 5); assert.equal(input.expectedItemsRevision, 3); assert.match(answer, /Отклон/);
});
