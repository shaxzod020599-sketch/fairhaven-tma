const assert = require('node:assert/strict');
const test = require('node:test');
const http = require('node:http');
const express = require('express');
const { Telegraf } = require('telegraf');

/**
 * The webhook mounts behind the same express.json() the rest of the app uses,
 * so the body is already consumed by the time Telegraf sees the request. If
 * Telegraf were to re-read the stream it would hang, and the failure mode is
 * silent: Telegram retries, gives up, and the bot simply stops responding.
 *
 * webhookCallback is used here rather than createWebhook because createWebhook
 * calls setWebhook against the real API; the parsing behaviour under test is
 * identical.
 */

/**
 * Telegraf calls getMe lazily on the first update unless botInfo is set. In
 * production that would put a network round-trip in front of the very first
 * message — see server.js, which fetches it at startup for exactly this reason.
 */
const BOT_INFO = {
  id: 123456, is_bot: true, first_name: 'Test', username: 'test_bot',
  can_join_groups: true, can_read_all_group_messages: false, supports_inline_queries: false,
};

function listen(app) {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

async function post(port, path, body, headers = {}) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(4000),
  });
  return { status: res.status, text: await res.text() };
}

const SECRET = 'z'.repeat(32);
const UPDATE = {
  update_id: 1,
  message: {
    message_id: 10,
    date: Math.floor(Date.now() / 1000),
    chat: { id: 555, type: 'private' },
    from: { id: 555, is_bot: false, first_name: 'Test' },
    text: '/ping',
  },
};

test('an update is handled even though express.json already read the body', async () => {
  const bot = new Telegraf('123456:test-token');
  bot.botInfo = BOT_INFO;
  let seen = null;
  bot.on('message', (ctx) => { seen = ctx.message.text; });

  const app = express();
  app.use(express.json({ limit: '100kb' }));
  app.use(bot.webhookCallback('/tg/abc', { secretToken: SECRET }));

  const { server, port } = await listen(app);
  try {
    const res = await post(port, '/tg/abc', UPDATE, {
      'X-Telegram-Bot-Api-Secret-Token': SECRET,
    });
    assert.equal(res.status, 200);
    assert.equal(seen, '/ping', 'handler did not receive the update');
  } finally {
    server.close();
  }
});

test('an update without the secret header is rejected', async () => {
  // The path is unguessable, but the header is what actually authenticates.
  const bot = new Telegraf('123456:test-token');
  bot.botInfo = BOT_INFO;
  let seen = false;
  bot.on('message', () => { seen = true; });

  const app = express();
  app.use(express.json());
  app.use(bot.webhookCallback('/tg/abc', { secretToken: SECRET }));

  const { server, port } = await listen(app);
  try {
    const res = await post(port, '/tg/abc', UPDATE);
    assert.notEqual(res.status, 200);
    assert.equal(seen, false, 'a forged update reached the bot');
  } finally {
    server.close();
  }
});

test('a wrong secret is rejected', async () => {
  const bot = new Telegraf('123456:test-token');
  bot.botInfo = BOT_INFO;
  let seen = false;
  bot.on('message', () => { seen = true; });

  const app = express();
  app.use(express.json());
  app.use(bot.webhookCallback('/tg/abc', { secretToken: SECRET }));

  const { server, port } = await listen(app);
  try {
    const res = await post(port, '/tg/abc', UPDATE, {
      'X-Telegram-Bot-Api-Secret-Token': 'wrong',
    });
    assert.notEqual(res.status, 200);
    assert.equal(seen, false);
  } finally {
    server.close();
  }
});

test('other routes still work alongside the webhook', async () => {
  const bot = new Telegraf('123456:test-token');
  bot.botInfo = BOT_INFO;
  const app = express();
  app.use(express.json());
  app.use(bot.webhookCallback('/tg/abc', { secretToken: SECRET }));
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

  const { server, port } = await listen(app);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, {
      signal: AbortSignal.timeout(4000),
    });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { status: 'ok' });
  } finally {
    server.close();
  }
});
