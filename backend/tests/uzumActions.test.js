const test = require('node:test');
const assert = require('node:assert/strict');
const hub = require('../utils/channelHub');
const controller = require('../controllers/uzumController');
const { createUzumTelegramAction, registerUzumActions } = require('../services/uzumTelegramAction');
const id = '11111111-1111-4111-8111-111111111111';
const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
test('panel decisions forward only authenticated actor, validate id and bounded reason', async () => {
  const original = hub.requestInternal; const calls = [];
  hub.requestInternal = async (...args) => { calls.push(args); return { ok: true, body: { order: { id, status: 'NEW' } } }; };
  try {
    await controller.decide({ params: { id }, admin: { role: 'admin', telegramId: 77, firstName: 'Ali' }, body: { action: 'accept', actor: { telegramId: 99, role: 'admin' } } }, response());
    assert.deepEqual(calls[0][2].body.actor, { type: 'admin-panel', telegramId: 77, name: 'Ali' });
    const bad = response(); await controller.decide({ params: { id: '../medicalka' }, admin: { role: 'admin', telegramId: 77 }, body: { action: 'accept' } }, bad);
    assert.equal(bad.statusCode, 422);
    const denied = response(); await controller.decide({ params: { id }, admin: { role: 'user', telegramId: 77 }, body: { action: 'ready', role: 'admin' } }, denied);
    assert.equal(denied.statusCode, 403);
    assert.equal(calls.length, 1);
  } finally { hub.requestInternal = original; }
});
test('Telegram resolves current admin before every action and shares lifecycle path', async () => {
  let role = 'admin'; const calls = [];
  const service = createUzumTelegramAction({ UserModel: { findOne: async () => ({ role, telegramId: 77, firstName: 'Ali' }) }, hub: { requestInternal: async (...args) => { calls.push(args); return { ok: true, body: { order: { id, status: 'READY' } } }; } } });
  assert.equal((await service.respond({ telegramId: 77, orderId: id, action: 'ready' })).ok, true);
  assert.deepEqual(calls[0][1], ['internal', 'uzum', 'orders', id, 'decision']);
  assert.equal(calls[0][2].body.actor.type, 'telegram');
  role = 'user';
  assert.equal((await service.respond({ telegramId: 77, orderId: id, action: 'ready' })).code, 'forbidden');
  assert.equal(calls.length, 1);
});
test('Telegram reject uses shared decision; callbacks never overwrite notifier keyboard', async () => {
  let handler; const decisions = []; const edits = [];
  registerUzumActions({ action: (_pattern, fn) => { handler = fn; } }, { actionService: {
    canAct: async () => true,
    respond: async (input) => { decisions.push(input); return { ok: true, order: { status: 'ACCEPTED_BY_RESTAURANT' } }; },
  } });
  const ctx = { from: { id: 77 }, match: ['', 'r', id], editMessageReplyMarkup: async (value) => edits.push(value), answerCbQuery: async () => {} };
  await handler(ctx); assert.equal(decisions.length, 1); assert.equal(decisions[0].action, 'reject');
  ctx.match = ['', 'a', id]; await handler(ctx);
  assert.equal(decisions[1].action, 'accept');
  assert.equal(edits.length, 0, 'durable notifier owns final card/keyboard, callback does not overwrite it');
});
