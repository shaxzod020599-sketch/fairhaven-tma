const assert = require('node:assert/strict');
const test = require('node:test');

process.env.BILLZ_SECRET_TOKEN = 'test-secret';
process.env.BILLZ_SHOP_ID = 'shop-a';
process.env.MONGO_DB_NAME = 'internal-medicalka-test';
process.env.SYNC_ON_BOOT = 'false';
process.env.CHANNEL_TELEGRAM_ENABLED = 'false';
process.env.DISABLE_RATE_LIMIT = 'true';
process.env.CHANNEL_INTERNAL_TOKEN = 'internal-token-0123456789abcdef';

let mongod;
let db;
let server;
let base;
let runtime;

test.before(async () => {
  const { MongoMemoryServer } = require('../../backend/node_modules/mongodb-memory-server');
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();
  db = require('../src/db');
  await db.connect();
  runtime = require('../src/medicalka/runtime');
  const { app } = require('../src/server');
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  server?.close();
  await db?.disconnect();
  await mongod?.stop();
});

async function call(method, path, { body, token = process.env.CHANNEL_INTERNAL_TOKEN } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(token === null ? {} : { 'X-Internal-Token': token }),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, body: await response.json() };
}

test('Medicalka approval list stays behind internal authentication', async () => {
  const result = await call('GET', '/internal/medicalka/approvals', { token: null });
  assert.equal(result.status, 401);
});

test('list passes only bounded validated filters to runtime', async () => {
  const original = runtime.listApprovals;
  let received;
  runtime.listApprovals = async (query) => {
    received = query;
    return { data: [], meta: { page: 2, limit: 100, total: 0 }, sync: { stale: false } };
  };
  try {
    const result = await call(
      'GET',
      '/internal/medicalka/approvals?bucket=history&page=2&limit=999&search=%20Ali%20'
    );
    assert.equal(result.status, 200);
    assert.deepEqual(received, { bucket: 'history', page: 2, limit: 100, search: 'Ali' });
  } finally {
    runtime.listApprovals = original;
  }
});

test('invalid list filters fail closed', async () => {
  const result = await call('GET', '/internal/medicalka/approvals?bucket=everything&page=no');
  assert.equal(result.status, 422);
  assert.equal(result.body.error, 'medicalka_invalid_query');
});

test('detail returns runtime result and missing approval status', async () => {
  const original = runtime.getApproval;
  runtime.getApproval = async (id) => (id === '507f1f77bcf86cd799439011'
    ? { id, status: 'pending' } : null);
  try {
    const found = await call('GET', '/internal/medicalka/approvals/507f1f77bcf86cd799439011');
    const missing = await call('GET', '/internal/medicalka/approvals/507f1f77bcf86cd799439012');
    assert.equal(found.status, 200);
    assert.equal(found.body.data.status, 'pending');
    assert.equal(missing.status, 404);
  } finally {
    runtime.getApproval = original;
  }
});

test('respond validates actor and forwards one bounded decision', async () => {
  const original = runtime.respondToApproval;
  let received;
  runtime.respondToApproval = async (id, decision) => {
    received = { id, decision };
    return { approval: { id, status: decision.action }, idempotent: false };
  };
  try {
    const invalid = await call(
      'POST',
      '/internal/medicalka/approvals/507f1f77bcf86cd799439011/respond',
      { body: { action: 'accepted', actor: { type: 'browser', telegramId: 7 } } }
    );
    assert.equal(invalid.status, 422);

    const result = await call(
      'POST',
      '/internal/medicalka/approvals/507f1f77bcf86cd799439011/respond',
      {
        body: {
          action: 'rejected', comment: '  mavjud emas  ',
          actor: { type: 'admin-panel', telegramId: 77, name: ' Operator ' },
        },
      }
    );
    assert.equal(result.status, 200);
    assert.deepEqual(received, {
      id: '507f1f77bcf86cd799439011',
      decision: {
        action: 'rejected', comment: 'mavjud emas',
        actor: { type: 'admin-panel', telegramId: 77, name: 'Operator' },
      },
    });
  } finally {
    runtime.respondToApproval = original;
  }
});

test('known decision errors keep their safe status and code', async () => {
  const original = runtime.respondToApproval;
  runtime.respondToApproval = async () => {
    const err = new Error('private upstream detail');
    err.code = 'medicalka_action_conflict';
    err.status = 409;
    throw err;
  };
  try {
    const result = await call(
      'POST',
      '/internal/medicalka/approvals/507f1f77bcf86cd799439011/respond',
      {
        body: {
          action: 'accepted',
          actor: { type: 'telegram', telegramId: 77, name: 'Operator' },
        },
      }
    );
    assert.equal(result.status, 409);
    assert.deepEqual(result.body, { error: 'medicalka_action_conflict' });
    assert.doesNotMatch(JSON.stringify(result.body), /private upstream/);
  } finally {
    runtime.respondToApproval = original;
  }
});

test('partner connection summary stays authenticated and contains no credential fields', async () => {
  const original = runtime.connectionSummary;
  runtime.connectionSummary = async () => ({
    activeEnvironment: 'staging',
    profiles: [{
      environment: 'staging', username: 'fa••••ng', passwordConfigured: true,
    }],
  });
  try {
    const unauthorized = await call('GET', '/internal/medicalka/partner', { token: null });
    assert.equal(unauthorized.status, 401);

    const result = await call('GET', '/internal/medicalka/partner');
    assert.equal(result.status, 200);
    assert.equal(result.body.activeEnvironment, 'staging');
    assert.equal(JSON.stringify(result.body).includes('passwordCipher'), false);
    assert.equal(JSON.stringify(result.body).includes('usernameCipher'), false);
  } finally {
    runtime.connectionSummary = original;
  }
});

test('partner profile update accepts bounded credential fields and rejects host injection', async () => {
  const original = runtime.updatePartnerProfile;
  let received;
  runtime.updatePartnerProfile = async (input) => {
    received = input;
    return { environment: input.environment, username: 'fa••••ng' };
  };
  try {
    const invalid = await call('PUT', '/internal/medicalka/partner/profiles/staging', {
      body: {
        username: 'staging-user', password: 'staging-password', processingMode: 'observe',
        baseUrl: 'https://attacker.invalid',
      },
    });
    assert.equal(invalid.status, 422);

    const result = await call('PUT', '/internal/medicalka/partner/profiles/production', {
      body: {
        username: ' production-user ', password: 'production-password',
        processingMode: 'observe',
      },
    });
    assert.equal(result.status, 200);
    assert.deepEqual(received, {
      environment: 'production', username: 'production-user',
      password: 'production-password', processingMode: 'observe',
    });
  } finally {
    runtime.updatePartnerProfile = original;
  }
});

test('partner activation and mode routes accept only fixed enums', async () => {
  const activate = runtime.activatePartnerProfile;
  const setMode = runtime.setPartnerProcessingMode;
  const received = [];
  runtime.activatePartnerProfile = async (environment) => {
    received.push(['activate', environment]);
    return { activeEnvironment: environment };
  };
  runtime.setPartnerProcessingMode = async (environment, mode) => {
    received.push(['mode', environment, mode]);
    return { environment, processingMode: mode };
  };
  try {
    assert.equal((await call('POST', '/internal/medicalka/partner/activate', {
      body: { environment: 'local' },
    })).status, 422);
    assert.equal((await call('POST', '/internal/medicalka/partner/mode', {
      body: { environment: 'production', processingMode: 'unsafe' },
    })).status, 422);

    assert.equal((await call('POST', '/internal/medicalka/partner/activate', {
      body: { environment: 'staging' },
    })).status, 200);
    assert.equal((await call('POST', '/internal/medicalka/partner/mode', {
      body: { environment: 'production', processingMode: 'live' },
    })).status, 200);
    assert.deepEqual(received, [
      ['activate', 'staging'], ['mode', 'production', 'live'],
    ]);
  } finally {
    runtime.activatePartnerProfile = activate;
    runtime.setPartnerProcessingMode = setMode;
  }
});
