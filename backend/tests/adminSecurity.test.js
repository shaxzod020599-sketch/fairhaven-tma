const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function loadHostGate(origin = 'https://admin.fairhaven.uz') {
  process.env.ADMIN_ORIGIN = origin;
  const target = require.resolve('../middleware/adminHostGate');
  delete require.cache[target];
  return require('../middleware/adminHostGate');
}

function stubModule(request, exports) {
  const resolved = require.resolve(request);
  const previous = require.cache[resolved];
  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    exports,
  };
  return () => {
    if (previous) require.cache[resolved] = previous;
    else delete require.cache[resolved];
  };
}

function signedInitData(user, token = '123456:test-token') {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: 'AAEAAAE',
    user: JSON.stringify(user),
  });
  const check = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  params.set('hash', crypto.createHmac('sha256', secret).update(check).digest('hex'));
  return params.toString();
}

test('admin host gate accepts only configured admin hostname', () => {
  const gate = loadHostGate();
  const res = responseRecorder();
  let called = false;

  gate({ hostname: 'admin.fairhaven.uz' }, res, () => { called = true; });

  assert.equal(called, true);
  assert.equal(res.statusCode, 200);
});

for (const hostname of ['fairhaven.uz', 'mini.fairhaven.uz', 'evil.example']) {
  test(`admin host gate rejects ${hostname}`, () => {
    const gate = loadHostGate();
    const res = responseRecorder();
    let called = false;

    gate({ hostname }, res, () => { called = true; });

    assert.equal(called, false);
    assert.equal(res.statusCode, 421);
    assert.deepEqual(res.body, { success: false, error: 'admin_host_required' });
  });
}

test('configured admin host is derived from URL without port', () => {
  const gate = loadHostGate('http://admin.localhost:5173');

  assert.equal(gate.configuredAdminHost(), 'admin.localhost');
});

test('invalid production admin origin fails closed', () => {
  const oldNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    assert.throws(() => loadHostGate('not-a-url'), /ADMIN_ORIGIN/);
  } finally {
    process.env.NODE_ENV = oldNodeEnv;
  }
});

function loadSessionService({ sessionModel, userModel } = {}) {
  process.env.NODE_ENV = 'production';
  process.env.ADMIN_ORIGIN = 'https://admin.fairhaven.uz';
  process.env.ADMIN_CSRF_SECRET = 'test-csrf-secret-with-enough-entropy-123';
  const restores = [];
  if (sessionModel) restores.push(stubModule('../models/AdminSession', sessionModel));
  if (userModel) restores.push(stubModule('../models/User', userModel));
  const target = require.resolve('../services/adminSession');
  delete require.cache[target];
  const service = require('../services/adminSession');
  return {
    service,
    restore() {
      delete require.cache[target];
      restores.reverse().forEach((fn) => fn());
    },
  };
}

test('admin session stores only token hash and emits hardened host-only cookie', async () => {
  let stored;
  let cookie;
  const loaded = loadSessionService({
    sessionModel: {
      create: async (doc) => { stored = doc; return doc; },
    },
  });
  const res = {
    cookie(name, value, options) { cookie = { name, value, options }; },
  };

  try {
    const issued = await loaded.service.issueSession({
      admin: { telegramId: 10001 },
      req: { hostname: 'admin.fairhaven.uz', ip: '127.0.0.1', get: () => 'Test Browser' },
      res,
    });

    assert.match(cookie.value, /^[A-Za-z0-9_-]{43}$/);
    assert.notEqual(stored.tokenHash, cookie.value);
    assert.equal(stored.tokenHash, crypto.createHash('sha256').update(cookie.value).digest('hex'));
    assert.equal(stored.adminTelegramId, 10001);
    assert.equal(stored.host, 'admin.fairhaven.uz');
    assert.equal(cookie.name, '__Host-fh_admin_session');
    assert.deepEqual(cookie.options, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/',
      maxAge: 8 * 60 * 60 * 1000,
    });
    assert.equal(issued.csrfToken, loaded.service.csrfForToken(cookie.value));
  } finally {
    loaded.restore();
  }
});

test('session validity rejects revoked, expired, idle, and cross-host sessions', () => {
  const loaded = loadSessionService({ sessionModel: {} });
  const now = new Date('2026-08-02T12:00:00.000Z');
  const base = {
    host: 'admin.fairhaven.uz',
    revokedAt: null,
    expiresAt: new Date('2026-08-02T13:00:00.000Z'),
    lastSeenAt: new Date('2026-08-02T11:45:00.000Z'),
  };

  try {
    assert.equal(loaded.service.sessionUsable(base, 'admin.fairhaven.uz', now), true);
    assert.equal(loaded.service.sessionUsable({ ...base, revokedAt: now }, 'admin.fairhaven.uz', now), false);
    assert.equal(loaded.service.sessionUsable({ ...base, expiresAt: now }, 'admin.fairhaven.uz', now), false);
    assert.equal(loaded.service.sessionUsable({ ...base, lastSeenAt: new Date('2026-08-02T11:29:59.000Z') }, 'admin.fairhaven.uz', now), false);
    assert.equal(loaded.service.sessionUsable(base, 'mini.fairhaven.uz', now), false);
  } finally {
    loaded.restore();
  }
});

test('admin middleware ignores valid Telegram initData on protected routes', async () => {
  process.env.TELEGRAM_BOT_TOKEN = '123456:test-token';
  process.env.ADMIN_DEV_BYPASS = '';
  const restoreUser = stubModule('../models/User', {
    findOne: async () => ({ telegramId: 10001, role: 'admin' }),
  });
  const target = require.resolve('../middleware/adminAuthUnified');
  delete require.cache[target];
  const middleware = require('../middleware/adminAuthUnified');
  const res = responseRecorder();
  let called = false;

  try {
    await middleware({
      hostname: 'admin.fairhaven.uz',
      headers: { 'x-telegram-init-data': signedInitData({ id: 10001 }) },
      cookies: {},
    }, res, () => { called = true; });

    assert.equal(called, false);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error, 'admin_session_required');
  } finally {
    delete require.cache[target];
    restoreUser();
  }
});

function requestWithHeaders(method, headers = {}) {
  const normalized = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])
  );
  return {
    method,
    get(name) { return normalized[String(name).toLowerCase()]; },
  };
}

test('CSRF middleware exempts read-only methods', () => {
  process.env.NODE_ENV = 'production';
  process.env.ADMIN_ORIGIN = 'https://admin.fairhaven.uz';
  const target = require.resolve('../middleware/adminCsrf');
  delete require.cache[target];
  const csrf = require('../middleware/adminCsrf');
  const res = responseRecorder();
  let called = false;

  csrf(requestWithHeaders('GET'), res, () => { called = true; });

  assert.equal(called, true);
  assert.equal(res.statusCode, 200);
});

for (const [name, headers] of [
  ['missing Origin', { 'x-fh-csrf': 'valid-token' }],
  ['wrong Origin', { origin: 'https://fairhaven.uz', 'x-fh-csrf': 'valid-token' }],
  ['missing CSRF', { origin: 'https://admin.fairhaven.uz' }],
  ['cross-site fetch metadata', { origin: 'https://admin.fairhaven.uz', 'x-fh-csrf': 'valid-token', 'sec-fetch-site': 'cross-site' }],
]) {
  test(`CSRF middleware rejects mutation with ${name}`, () => {
    process.env.NODE_ENV = 'production';
    process.env.ADMIN_ORIGIN = 'https://admin.fairhaven.uz';
    const target = require.resolve('../middleware/adminCsrf');
    delete require.cache[target];
    const csrf = require('../middleware/adminCsrf');
    const req = requestWithHeaders('POST', headers);
    req.adminCsrfToken = 'valid-token';
    const res = responseRecorder();
    let called = false;

    csrf(req, res, () => { called = true; });

    assert.equal(called, false);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.error, 'csrf_rejected');
  });
}

test('CSRF middleware accepts exact origin and session-bound token', () => {
  process.env.NODE_ENV = 'production';
  process.env.ADMIN_ORIGIN = 'https://admin.fairhaven.uz';
  const target = require.resolve('../middleware/adminCsrf');
  delete require.cache[target];
  const csrf = require('../middleware/adminCsrf');
  const req = requestWithHeaders('PATCH', {
    origin: 'https://admin.fairhaven.uz',
    'x-fh-csrf': 'valid-token',
    'sec-fetch-site': 'same-origin',
  });
  req.adminCsrfToken = 'valid-token';
  const res = responseRecorder();
  let called = false;

  csrf(req, res, () => { called = true; });

  assert.equal(called, true);
  assert.equal(res.statusCode, 200);
});

function loadAdminLoginService({ attemptModel, consumedModel, userModel, sessionService, telegramAuth } = {}) {
  const restores = [];
  if (attemptModel) restores.push(stubModule('../models/AdminLoginAttempt', attemptModel));
  if (consumedModel) restores.push(stubModule('../models/ConsumedTelegramInitData', consumedModel));
  if (userModel) restores.push(stubModule('../models/User', userModel));
  if (sessionService) restores.push(stubModule('../services/adminSession', sessionService));
  if (telegramAuth) restores.push(stubModule('../middleware/telegramAuth', telegramAuth));
  const target = require.resolve('../services/adminLogin');
  delete require.cache[target];
  const service = require('../services/adminLogin');
  return {
    service,
    restore() {
      delete require.cache[target];
      restores.reverse().forEach((fn) => fn());
    },
  };
}

test('browser admin login attempt stores hashed poll token and comparison code', async () => {
  let stored;
  const loaded = loadAdminLoginService({
    attemptModel: {
      create: async (doc) => { stored = doc; return { _id: 'attempt-id', ...doc }; },
    },
  });
  const before = Date.now();

  try {
    const result = await loaded.service.createAttempt({
      ip: '127.0.0.1',
      userAgent: 'Test Browser',
    });

    assert.match(result.pollToken, /^[A-Za-z0-9_-]{43}$/);
    assert.match(result.userCode, /^\d{6}$/);
    assert.equal(stored.pollTokenHash, crypto.createHash('sha256').update(result.pollToken).digest('hex'));
    assert.notEqual(stored.pollTokenHash, result.pollToken);
    assert.equal(stored.userCode, result.userCode);
    assert.equal(stored.status, 'pending');
    assert.ok(stored.expiresAt.getTime() >= before + 179_000);
    assert.ok(stored.expiresAt.getTime() <= before + 181_000);
  } finally {
    loaded.restore();
  }
});

test('approved browser login is atomically consumed once', async () => {
  let calls = 0;
  let capturedFilter;
  const approved = {
    _id: 'attempt-id',
    adminTelegramId: 10001,
    status: 'consumed',
    expiresAt: new Date(Date.now() + 60_000),
  };
  const loaded = loadAdminLoginService({
    attemptModel: {
      findOneAndUpdate: async (filter) => {
        capturedFilter = filter;
        calls += 1;
        return calls === 1 ? approved : null;
      },
      findOne: async () => null,
    },
  });

  try {
    const first = await loaded.service.consumeApproved('A'.repeat(43));
    const second = await loaded.service.consumeApproved('A'.repeat(43));

    assert.equal(first, approved);
    assert.equal(second, null);
    assert.equal(capturedFilter.status, 'approved');
    assert.equal(capturedFilter.pollTokenHash, crypto.createHash('sha256').update('A'.repeat(43)).digest('hex'));
  } finally {
    loaded.restore();
  }
});

test('Telegram login prompt binds to first admin and only that admin can decide', async () => {
  const filters = [];
  const loaded = loadAdminLoginService({
    attemptModel: {
      findOneAndUpdate: async (filter, update) => {
        filters.push({ filter, update });
        return { _id: 'attempt-id', userCode: '042731', presentedToTelegramId: 10001 };
      },
    },
  });

  try {
    await loaded.service.presentAttempt('A'.repeat(43), 10001);
    await loaded.service.decideAttempt({
      attemptId: '507f1f77bcf86cd799439011',
      adminTelegramId: 10001,
      decision: 'approved',
    });

    assert.deepEqual(filters[0].filter.presentedToTelegramId.$in, [null, 10001]);
    assert.equal(filters[0].update.$set.presentedToTelegramId, 10001);
    assert.equal(filters[1].filter.presentedToTelegramId, 10001);
    assert.equal(filters[1].update.$set.status, 'approved');
  } finally {
    loaded.restore();
  }
});

test('Telegram exchange enforces five-minute signature age and consumes replay hash', async () => {
  let validationOptions;
  let replayDoc;
  let issuedAdmin;
  const loaded = loadAdminLoginService({
    attemptModel: {},
    consumedModel: {
      create: async (doc) => { replayDoc = doc; return doc; },
    },
    userModel: {
      findOne: async (filter) => filter.telegramId === 10001
        ? { telegramId: 10001, role: 'admin' }
        : null,
    },
    sessionService: {
      hashToken: (value) => crypto.createHash('sha256').update(value).digest('hex'),
      issueSession: async ({ admin }) => { issuedAdmin = admin; return { csrfToken: 'csrf' }; },
    },
    telegramAuth: {
      validateTelegramInitData: (_raw, _token, options) => {
        validationOptions = options;
        return { id: 10001 };
      },
    },
  });

  try {
    const result = await loaded.service.exchangeTelegram({
      initData: 'signed-init-data',
      req: {},
      res: {},
    });

    assert.equal(validationOptions.maxAgeSeconds, 300);
    assert.equal(replayDoc.initDataHash, crypto.createHash('sha256').update('signed-init-data').digest('hex'));
    assert.ok(replayDoc.expiresAt.getTime() > Date.now());
    assert.equal(issuedAdmin.telegramId, 10001);
    assert.equal(result.csrfToken, 'csrf');
  } finally {
    loaded.restore();
  }
});

test('Telegram exchange rejects replay before issuing second session', async () => {
  let issueCount = 0;
  const loaded = loadAdminLoginService({
    attemptModel: {},
    consumedModel: {
      create: async () => { const err = new Error('duplicate'); err.code = 11000; throw err; },
    },
    userModel: {
      findOne: async () => ({ telegramId: 10001, role: 'admin' }),
    },
    sessionService: {
      hashToken: (value) => crypto.createHash('sha256').update(value).digest('hex'),
      issueSession: async () => { issueCount += 1; },
    },
    telegramAuth: {
      validateTelegramInitData: () => ({ id: 10001 }),
    },
  });

  try {
    await assert.rejects(
      loaded.service.exchangeTelegram({ initData: 'same-init-data', req: {}, res: {} }),
      (err) => err.code === 'telegram_init_data_replayed'
    );
    assert.equal(issueCount, 0);
  } finally {
    loaded.restore();
  }
});

function loadAdminAuthController({ loginService, sessionService, userModel, auditService } = {}) {
  const restores = [];
  if (loginService) restores.push(stubModule('../services/adminLogin', loginService));
  if (sessionService) restores.push(stubModule('../services/adminSession', sessionService));
  if (userModel) restores.push(stubModule('../models/User', userModel));
  if (auditService) restores.push(stubModule('../services/adminAudit', auditService));
  const target = require.resolve('../controllers/adminAuthController');
  delete require.cache[target];
  const controller = require('../controllers/adminAuthController');
  return {
    controller,
    restore() {
      delete require.cache[target];
      restores.reverse().forEach((fn) => fn());
    },
  };
}

test('admin browser login start returns code and admin-specific bot link', async () => {
  const loaded = loadAdminAuthController({
    loginService: {
      createAttempt: async () => ({
        pollToken: 'A'.repeat(43),
        userCode: '042731',
        expiresAt: new Date('2026-08-02T12:03:00.000Z'),
      }),
    },
    sessionService: {},
    userModel: {},
    auditService: { record: async () => {} },
  });
  const res = responseRecorder();

  try {
    await loaded.controller.startLogin({
      ip: '127.0.0.1',
      get: () => 'Test Browser',
      app: { locals: { botUsername: 'fairhaven_bot' } },
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.userCode, '042731');
    assert.equal(res.body.data.botUrl, `https://t.me/fairhaven_bot?start=admin_${'A'.repeat(43)}`);
    assert.equal(res.body.data.expiresInSeconds, 180);
  } finally {
    loaded.restore();
  }
});

test('approved browser poll issues session exactly once for active admin', async () => {
  let issued = 0;
  const loaded = loadAdminAuthController({
    loginService: {
      consumeApproved: async () => ({ adminTelegramId: 10001 }),
      loginState: async () => 'approved',
    },
    sessionService: {
      issueSession: async () => { issued += 1; return { csrfToken: 'csrf-token' }; },
    },
    userModel: {
      findOne: async () => ({ telegramId: 10001, role: 'admin', firstName: 'Admin' }),
    },
    auditService: { record: async () => {} },
  });
  const res = responseRecorder();

  try {
    await loaded.controller.pollLogin({
      body: { pollToken: 'A'.repeat(43) },
    }, res);

    assert.equal(issued, 1);
    assert.equal(res.body.data.status, 'ready');
    assert.equal(res.body.data.csrfToken, 'csrf-token');
  } finally {
    loaded.restore();
  }
});

test('whoami returns CSRF only for a valid server-side session', async () => {
  const loaded = loadAdminAuthController({
    loginService: {},
    sessionService: {
      resolveSession: async () => ({
        admin: { telegramId: 10001, firstName: 'Admin', lastName: 'One', username: 'admin1' },
        csrfToken: 'csrf-token',
      }),
    },
    userModel: {},
    auditService: { record: async () => {} },
  });
  const res = responseRecorder();

  try {
    await loaded.controller.whoami({}, res);

    assert.equal(res.body.data.isAdmin, true);
    assert.equal(res.body.data.csrfToken, 'csrf-token');
    assert.equal(res.body.data.telegramId, 10001);
  } finally {
    loaded.restore();
  }
});

test('development login endpoint is inert in production', async () => {
  const oldNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  const loaded = loadAdminAuthController({
    loginService: {},
    sessionService: {},
    userModel: {},
    auditService: { record: async () => {} },
  });
  const res = responseRecorder();

  try {
    await loaded.controller.devLogin({}, res);
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.error, 'route_not_found');
  } finally {
    process.env.NODE_ENV = oldNodeEnv;
    loaded.restore();
  }
});

test('public admin auth endpoints require exact admin Origin without CSRF', () => {
  process.env.NODE_ENV = 'production';
  process.env.ADMIN_ORIGIN = 'https://admin.fairhaven.uz';
  const target = require.resolve('../middleware/adminCsrf');
  delete require.cache[target];
  const { requireAdminOrigin } = require('../middleware/adminCsrf');

  const denied = responseRecorder();
  let deniedNext = false;
  requireAdminOrigin(
    requestWithHeaders('POST', { origin: 'https://fairhaven.uz' }),
    denied,
    () => { deniedNext = true; }
  );
  assert.equal(deniedNext, false);
  assert.equal(denied.statusCode, 403);

  const allowed = responseRecorder();
  let allowedNext = false;
  requireAdminOrigin(
    requestWithHeaders('POST', { origin: 'https://admin.fairhaven.uz' }),
    allowed,
    () => { allowedNext = true; }
  );
  assert.equal(allowedNext, true);
});

test('admin router exposes isolated session auth contract', () => {
  process.env.NODE_ENV = 'development';
  process.env.ADMIN_ORIGIN = 'http://admin.localhost:5173';
  const target = require.resolve('../routes/adminRoutes');
  delete require.cache[target];
  const router = require('../routes/adminRoutes');
  const routes = router.stack
    .filter((layer) => layer.route)
    .map((layer) => `${Object.keys(layer.route.methods)[0]} ${layer.route.path}`);

  assert.ok(routes.includes('post /auth/login/start'));
  assert.ok(routes.includes('post /auth/login/poll'));
  assert.ok(routes.includes('post /auth/telegram'));
  assert.ok(routes.includes('get /auth/whoami'));
  assert.ok(routes.includes('post /auth/logout'));
  assert.ok(routes.includes('post /auth/sessions/revoke-all'));
});

test('demoting an admin revokes every live session and records audit', async () => {
  let revokedTelegramId;
  let audited;
  const restores = [
    stubModule('../models/User', {
      countDocuments: async () => 2,
      findOneAndUpdate: async () => ({ telegramId: 20002, role: 'user' }),
    }),
    stubModule('../services/adminSession', {
      revokeAllForAdmin: async (telegramId) => { revokedTelegramId = telegramId; },
    }),
    stubModule('../services/adminAudit', {
      record: async (entry) => { audited = entry; },
    }),
  ];
  const target = require.resolve('../controllers/adminController');
  delete require.cache[target];
  const controller = require('../controllers/adminController');
  const res = responseRecorder();

  try {
    await controller.demoteAdmin({
      admin: { telegramId: 10001, firstName: 'Owner' },
      params: { telegramId: '20002' },
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(revokedTelegramId, 20002);
    assert.equal(audited.action, 'admin.demote');
    assert.equal(audited.entityId, '20002');
  } finally {
    delete require.cache[target];
    restores.reverse().forEach((fn) => fn());
  }
});

test('surface routing maps each exact hostname to one build and rejects unknown hosts', () => {
  process.env.NODE_ENV = 'production';
  process.env.PUBLIC_ORIGIN = 'https://fairhaven.uz';
  process.env.ADMIN_ORIGIN = 'https://admin.fairhaven.uz';
  process.env.TMA_ORIGIN = 'https://mini.fairhaven.uz';
  const target = require.resolve('../utils/surfaces');
  delete require.cache[target];
  const { surfaceForHost } = require('../utils/surfaces');

  assert.equal(surfaceForHost('fairhaven.uz').key, 'public');
  assert.equal(surfaceForHost('admin.fairhaven.uz').key, 'admin');
  assert.equal(surfaceForHost('mini.fairhaven.uz').key, 'tma');
  assert.equal(surfaceForHost('FAIRHAVEN.UZ').key, 'public');
  assert.equal(surfaceForHost('evil.example'), null);
});

test('public admin path redirects to isolated admin origin only on public host', () => {
  process.env.NODE_ENV = 'production';
  process.env.PUBLIC_ORIGIN = 'https://fairhaven.uz';
  process.env.ADMIN_ORIGIN = 'https://admin.fairhaven.uz';
  process.env.TMA_ORIGIN = 'https://mini.fairhaven.uz';
  const target = require.resolve('../utils/surfaces');
  delete require.cache[target];
  const { publicAdminRedirect } = require('../utils/surfaces');

  assert.equal(publicAdminRedirect('fairhaven.uz', '/admin'), 'https://admin.fairhaven.uz/');
  assert.equal(publicAdminRedirect('fairhaven.uz', '/admin/orders'), 'https://admin.fairhaven.uz/orders');
  assert.equal(publicAdminRedirect('mini.fairhaven.uz', '/admin'), '');
});
