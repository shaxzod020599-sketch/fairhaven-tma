const assert = require('node:assert/strict');
const test = require('node:test');

const hub = require('../utils/channelHub');
const controller = require('../controllers/medicalkaController');

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test('list validates and bounds query before channel-hub call', async () => {
  const original = hub.requestInternal;
  const calls = [];
  hub.requestInternal = async (...args) => {
    calls.push(args);
    return {
      ok: true,
      body: { data: [], meta: { page: 2, limit: 100, total: 0 }, sync: { stale: false } },
    };
  };
  try {
    const res = response();
    await controller.list({
      query: { bucket: 'history', page: '2', limit: '999', search: ' Ali ' },
    }, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(calls[0], [
      'GET', ['internal', 'medicalka', 'approvals'],
      { query: { bucket: 'history', page: 2, limit: 100, search: 'Ali' } },
    ]);
    assert.deepEqual(res.body, {
      success: true, data: [], meta: { page: 2, limit: 100, total: 0 }, sync: { stale: false },
    });

    const invalid = response();
    await controller.list({ query: { bucket: 'wrong' } }, invalid);
    assert.equal(invalid.statusCode, 400);
    assert.equal(calls.length, 1);
  } finally {
    hub.requestInternal = original;
  }
});

test('detail forwards local id and preserves safe 404', async () => {
  const original = hub.requestInternal;
  hub.requestInternal = async () => ({
    ok: false, status: 404, body: { error: 'medicalka_approval_not_found' },
  });
  try {
    const res = response();
    await controller.detail({ params: { id: '507f1f77bcf86cd799439011' } }, res);
    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, { success: false, error: 'medicalka_approval_not_found' });
  } finally {
    hub.requestInternal = original;
  }
});

test('respond ignores client actor and forwards authenticated admin identity', async () => {
  const original = hub.requestInternal;
  let call;
  hub.requestInternal = async (...args) => {
    call = args;
    return { ok: true, body: { approval: { status: 'rejected' }, idempotent: false } };
  };
  try {
    const res = response();
    await controller.respond({
      params: { id: '507f1f77bcf86cd799439011' },
      admin: { telegramId: 77, firstName: 'Ali', lastName: 'Admin' },
      body: {
        action: 'rejected', comment: ' mavjud emas ',
        actor: { telegramId: 999, name: 'Spoofed' },
      },
    }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(call, [
      'POST', ['internal', 'medicalka', 'approvals', '507f1f77bcf86cd799439011', 'respond'],
      {
        body: {
          action: 'rejected', comment: 'mavjud emas',
          actor: { type: 'admin-panel', telegramId: 77, name: 'Ali Admin' },
        },
      },
    ]);
  } finally {
    hub.requestInternal = original;
  }
});

test('respond maps conflict and unavailable hub without leaking private errors', async () => {
  const original = hub.requestInternal;
  try {
    hub.requestInternal = async () => ({
      ok: false, status: 409,
      body: { error: 'medicalka_action_conflict', message: 'private upstream detail' },
    });
    const conflict = response();
    await controller.respond({
      params: { id: '507f1f77bcf86cd799439011' },
      admin: { telegramId: 77 }, body: { action: 'accepted' },
    }, conflict);
    assert.equal(conflict.statusCode, 409);
    assert.deepEqual(conflict.body, { success: false, error: 'medicalka_action_conflict' });

    hub.requestInternal = async () => {
      const err = new Error('private network data');
      err.notConfigured = true;
      throw err;
    };
    const unavailable = response();
    await controller.list({ query: {} }, unavailable);
    assert.equal(unavailable.statusCode, 503);
    assert.deepEqual(unavailable.body, { success: false, error: 'channel_hub_not_configured' });
  } finally {
    hub.requestInternal = original;
  }
});
