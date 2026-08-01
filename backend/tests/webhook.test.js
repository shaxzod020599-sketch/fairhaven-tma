const assert = require('node:assert/strict');
const test = require('node:test');

const webhook = require('../bot/webhook');

function withEnv(vars, fn) {
  const saved = {};
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return Promise.resolve(fn()).finally(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });
}

/** Minimal stand-in for the parts of Telegraf this module touches. */
function fakeBot({ createWebhookImpl } = {}) {
  const calls = { createWebhook: [], deleteWebhook: [] };
  return {
    calls,
    createWebhook: async (opts) => {
      calls.createWebhook.push(opts);
      if (createWebhookImpl) return createWebhookImpl(opts);
      return (_req, _res, _next) => {};
    },
    telegram: {
      deleteWebhook: async (opts) => { calls.deleteWebhook.push(opts); },
    },
  };
}

const GOOD_SECRET = 'a'.repeat(32);

test('the webhook path is unguessable and stable for a token', () => {
  const a = webhook.webhookPath('123456:AAErandomtoken');
  const b = webhook.webhookPath('123456:AAErandomtoken');

  assert.equal(a, b, 'must not change between restarts');
  assert.match(a, /^\/tg\/[a-f0-9]{32}$/);
  // The token itself must not be recoverable from the URL.
  assert.equal(a.includes('AAErandomtoken'), false);
  assert.notEqual(a, webhook.webhookPath('123456:AAEdifferent'));
});

test('a missing domain falls back to polling instead of failing', async () => {
  await withEnv(
    { TELEGRAM_USE_WEBHOOK: 'true', TELEGRAM_WEBHOOK_DOMAIN: '', TELEGRAM_WEBHOOK_SECRET: GOOD_SECRET },
    async () => {
      const bot = fakeBot();
      assert.equal(await webhook.useWebhook(bot, 'tok'), false);
      assert.equal(bot.calls.createWebhook.length, 0);
    }
  );
});

test('a weak secret is refused', async () => {
  // The secret-token header is what proves an update came from Telegram; a
  // short value makes the endpoint forgeable by anyone who finds the path.
  await withEnv(
    { TELEGRAM_USE_WEBHOOK: 'true', TELEGRAM_WEBHOOK_DOMAIN: 'mini.example.uz', TELEGRAM_WEBHOOK_SECRET: 'short' },
    async () => {
      const bot = fakeBot();
      assert.equal(await webhook.useWebhook(bot, 'tok'), false);
      assert.equal(bot.calls.createWebhook.length, 0);
    }
  );
});

test('disabled by default', async () => {
  await withEnv({ TELEGRAM_USE_WEBHOOK: undefined }, async () => {
    const bot = fakeBot();
    assert.equal(await webhook.useWebhook(bot, 'tok'), false);
  });
});

test('a successful setup passes the secret and drops queued updates', async () => {
  await withEnv(
    {
      TELEGRAM_USE_WEBHOOK: 'true',
      TELEGRAM_WEBHOOK_DOMAIN: 'https://mini.example.uz/',
      TELEGRAM_WEBHOOK_SECRET: GOOD_SECRET,
    },
    async () => {
      const bot = fakeBot();
      assert.equal(await webhook.useWebhook(bot, 'tok'), true);

      const opts = bot.calls.createWebhook[0];
      assert.equal(opts.secret_token, GOOD_SECRET);
      // Replaying an hour of queued updates after downtime sends stale replies.
      assert.equal(opts.drop_pending_updates, true);
      // The scheme and trailing slash must be stripped, or Telegram rejects it.
      assert.equal(opts.domain, 'mini.example.uz');
      assert.match(opts.path, /^\/tg\/[a-f0-9]{32}$/);
    }
  );
});

test('a failing setup degrades to polling rather than leaving the bot dead', async () => {
  await withEnv(
    {
      TELEGRAM_USE_WEBHOOK: 'true',
      TELEGRAM_WEBHOOK_DOMAIN: 'mini.example.uz',
      TELEGRAM_WEBHOOK_SECRET: GOOD_SECRET,
    },
    async () => {
      const bot = fakeBot({
        createWebhookImpl: () => { throw new Error('ETIMEDOUT'); },
      });
      assert.equal(await webhook.useWebhook(bot, 'tok'), false);
    }
  );
});

test('the route is inert until a handler exists', () => {
  // It is registered with the other routes at boot, long before the bot is up.
  let nextCalled = false;
  webhook.webhookRoute({ path: '/tg/anything' }, {}, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});

test('non-webhook paths always pass through', () => {
  let nextCalled = false;
  webhook.webhookRoute({ path: '/api/products' }, {}, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});

test('clearing the webhook also drops the queue', async () => {
  // Telegram refuses getUpdates while a webhook is set, so polling cannot
  // start until this runs.
  const bot = fakeBot();
  await webhook.clearWebhook(bot);
  assert.deepEqual(bot.calls.deleteWebhook[0], { drop_pending_updates: true });
});

test('clearing survives a Telegram error', async () => {
  const bot = {
    telegram: { deleteWebhook: async () => { throw new Error('network'); } },
  };
  await webhook.clearWebhook(bot); // must not reject
});
