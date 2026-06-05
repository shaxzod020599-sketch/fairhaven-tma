const assert = require('node:assert/strict');
const test = require('node:test');

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

test('self authorization rejects access to another Telegram user', async () => {
  const { requireSelf } = require('../middleware/telegramAuth');
  const res = responseRecorder();
  let called = false;

  await requireSelf('telegramId')(
    { telegramUser: { id: 111 }, params: { telegramId: '222' } },
    res,
    () => { called = true; }
  );

  assert.equal(called, false);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.error, 'forbidden');
});

test('user update ignores role and identity mass assignment', async () => {
  let capturedUpdate;
  const restore = stubModule('../models/User', {
    findOneAndUpdate: async (_filter, update) => {
      capturedUpdate = update;
      return { telegramId: 111, notificationsEnabled: false };
    },
  });
  const controllerPath = require.resolve('../controllers/userController');
  delete require.cache[controllerPath];
  const controller = require('../controllers/userController');
  const res = responseRecorder();

  try {
    await controller.update({
      telegramUser: { id: 111 },
      params: { telegramId: '111' },
      body: {
        role: 'admin',
        telegramId: 999,
        registrationStep: 'done',
        consentAccepted: true,
        notificationsEnabled: false,
      },
    }, res);

    assert.deepEqual(capturedUpdate, { notificationsEnabled: false });
    assert.equal(res.statusCode, 200);
  } finally {
    delete require.cache[controllerPath];
    restore();
  }
});

test('order detail query is scoped to authenticated owner', async () => {
  let capturedFilter;
  const restore = [
    stubModule('../models/Order', {
      findOne(filter) {
        capturedFilter = filter;
        return {
          populate: async () => ({ _id: 'order-id', telegramId: 111 }),
        };
      },
    }),
    stubModule('../models/User', {}),
    stubModule('../models/PromoCode', {}),
  ];
  const controllerPath = require.resolve('../controllers/orderController');
  delete require.cache[controllerPath];
  const controller = require('../controllers/orderController');
  const res = responseRecorder();

  try {
    await controller.getById({
      telegramUser: { id: 111 },
      params: { id: 'order-id' },
    }, res);

    assert.deepEqual(capturedFilter, { _id: 'order-id', telegramId: 111 });
    assert.equal(res.statusCode, 200);
  } finally {
    delete require.cache[controllerPath];
    restore.reverse().forEach((fn) => fn());
  }
});

test('public settings query uses explicit public key whitelist', async () => {
  let capturedFilter;
  const restore = [
    stubModule('../models/Collection', {}),
    stubModule('../models/Setting', {
      find: async (filter) => {
        capturedFilter = filter;
        return [];
      },
    }),
  ];
  const controllerPath = require.resolve('../controllers/publicController');
  delete require.cache[controllerPath];
  const controller = require('../controllers/publicController');
  const res = responseRecorder();

  try {
    await controller.getSettings({}, res);
    assert.ok(Array.isArray(capturedFilter.key.$in));
    assert.ok(capturedFilter.key.$in.includes('support_phone'));
    assert.equal(capturedFilter.key.$in.includes('telegram_bot_token'), false);
  } finally {
    delete require.cache[controllerPath];
    restore.reverse().forEach((fn) => fn());
  }
});

test('product mutation routes require verified admin middleware', () => {
  const adminAuth = require('../middleware/adminAuth');
  const router = require('../routes/productRoutes');
  const protectedMethods = new Set(['post', 'put', 'delete', 'patch']);

  for (const layer of router.stack.filter((item) => item.route)) {
    const method = Object.keys(layer.route.methods)[0];
    if (!protectedMethods.has(method)) continue;
    assert.equal(layer.route.stack[0].handle, adminAuth, `${method} ${layer.route.path}`);
  }
});

test('private order routes require signed Telegram middleware', () => {
  const telegramAuth = require('../middleware/telegramAuth');
  const router = require('../routes/orderRoutes');
  const privateRoutes = new Set([
    'post /',
    'get /:id',
    'get /user/:telegramId',
    'post /:id/cancel',
  ]);

  for (const layer of router.stack.filter((item) => item.route)) {
    const method = Object.keys(layer.route.methods)[0];
    const route = `${method} ${layer.route.path}`;
    if (!privateRoutes.has(route)) continue;
    assert.equal(layer.route.stack[0].handle, telegramAuth, route);
  }
});
