const assert = require('node:assert/strict');
const test = require('node:test');

const { createMedicalkaTelegramAction } = require('../services/medicalkaTelegramAction');

const ID = '507f1f77bcf86cd799439011';

test('non-admin and demoted user cannot call channel hub', async () => {
  let calls = 0;
  const hub = { request: async () => { calls += 1; return { ok: true, body: {} }; } };
  const missing = createMedicalkaTelegramAction({
    UserModel: { findOne: async () => null }, hub,
  });
  const demoted = createMedicalkaTelegramAction({
    UserModel: { findOne: async () => ({ telegramId: 7, role: 'user' }) }, hub,
  });

  assert.equal(await missing.canAct(7), false);
  assert.equal(await demoted.canAct(7), false);
  const result = await demoted.respond({ telegramId: 7, approvalId: ID, action: 'accepted' });
  assert.deepEqual(result, { ok: false, code: 'forbidden' });
  assert.equal(calls, 0);
});

test('current admin action forwards exact audited actor once', async () => {
  const calls = [];
  const action = createMedicalkaTelegramAction({
    UserModel: {
      findOne: async (query) => (query.role === 'admin'
        ? { telegramId: 77, role: 'admin', firstName: 'Ali', lastName: 'Admin' }
        : null),
    },
    hub: {
      request: async (method, path, options) => {
        calls.push({ method, path, options });
        return { ok: true, status: 200, body: { approval: { id: ID, status: 'accepted' } } };
      },
    },
  });

  const result = await action.respond({ telegramId: 77, approvalId: ID, action: 'accepted' });

  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    method: 'POST',
    path: `/internal/medicalka/approvals/${ID}/respond`,
    options: {
      body: {
        action: 'accepted', comment: '',
        actor: { type: 'telegram', telegramId: 77, name: 'Ali Admin' },
      },
    },
  });
});

test('stale conflict reads final source state without retrying decision', async () => {
  const calls = [];
  const action = createMedicalkaTelegramAction({
    UserModel: { findOne: async () => ({ telegramId: 77, role: 'admin', username: 'operator' }) },
    hub: {
      request: async (method, path) => {
        calls.push({ method, path });
        if (method === 'POST') {
          return { ok: false, status: 409, body: { error: 'medicalka_action_conflict' } };
        }
        return { ok: true, status: 200, body: { data: { id: ID, status: 'rejected' } } };
      },
    },
  });

  const result = await action.respond({ telegramId: 77, approvalId: ID, action: 'accepted' });

  assert.deepEqual(result, {
    ok: false, code: 'medicalka_action_conflict',
    approval: { id: ID, status: 'rejected' },
  });
  assert.equal(calls.filter((row) => row.method === 'POST').length, 1);
  assert.equal(calls.filter((row) => row.method === 'GET').length, 1);
});

test('invalid callback id and action fail before database or network', async () => {
  let reads = 0;
  const action = createMedicalkaTelegramAction({
    UserModel: { findOne: async () => { reads += 1; return {}; } },
    hub: { request: async () => { throw new Error('must not call'); } },
  });

  assert.deepEqual(
    await action.respond({ telegramId: 1, approvalId: '../x', action: 'accepted' }),
    { ok: false, code: 'invalid_action' }
  );
  assert.deepEqual(
    await action.respond({ telegramId: 1, approvalId: ID, action: 'delete' }),
    { ok: false, code: 'invalid_action' }
  );
  assert.equal(reads, 0);
});
