const assert = require('node:assert/strict');
const test = require('node:test');

const { createPartnerTelegramAction } = require('../services/partnerTelegramAction');

const ID = '507f1f77bcf86cd799439011';

test('partner order buttons: a non-admin never reaches the channel hub', async () => {
  let calls = 0;
  const hub = { requestInternal: async () => { calls += 1; return { ok: true, body: {} }; } };
  const action = createPartnerTelegramAction({
    UserModel: { findOne: async () => ({ telegramId: 7, role: 'user' }) }, hub,
  });

  assert.equal(await action.canAct(7), false);
  assert.deepEqual(await action.respond({ telegramId: 7, orderId: ID, action: 'accept' }), { ok: false, code: 'forbidden' });
  assert.equal(calls, 0);
});

test('partner order buttons: an admin decision is forwarded once with who decided', async () => {
  const calls = [];
  const action = createPartnerTelegramAction({
    UserModel: {
      findOne: async (query) => (query.role === 'admin' ? { telegramId: 77, role: 'admin', firstName: 'Ali' } : null),
    },
    hub: {
      requestInternal: async (method, segments, options) => {
        calls.push({ method, segments, options });
        return { ok: false, status: 409, body: { error: 'invalid_status' } };
      },
    },
  });

  const result = await action.respond({ telegramId: 77, orderId: ID, action: 'reject' });
  assert.deepEqual(result, { ok: false, code: 'invalid_status' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'POST');
  assert.deepEqual(calls[0].segments, ['internal', 'partners', 'orders', ID, 'decision']);
  assert.deepEqual(calls[0].options.body, { action: 'reject', actor: { type: 'telegram', telegramId: 77, name: 'Ali' } });

  assert.deepEqual(await action.respond({ telegramId: 77, orderId: 'nope', action: 'accept' }), { ok: false, code: 'invalid_action' });
  assert.equal(calls.length, 1);
});
