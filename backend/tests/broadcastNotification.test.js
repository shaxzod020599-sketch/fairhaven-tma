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

/** Builds a bot with a stubbed User model and a fresh module cache. */
function withStubbedBot(recipients) {
  const calls = { updateMany: [], find: [] };
  const restore = [
    stubModule('../models/User', {
      find: (query) => {
        calls.find.push(query);
        return { select: () => ({ lean: async () => recipients }) };
      },
      updateMany: async (filter, update) => {
        calls.updateMany.push({ filter, update });
        return { modifiedCount: 1 };
      },
    }),
    stubModule('../models/Order', {}),
  ];
  const botPath = require.resolve('../bot/bot');
  delete require.cache[botPath];
  const { createBot } = require('../bot/bot');
  const bot = createBot('123456:test-token', 'https://mini.fairhaven.uz');
  return {
    bot,
    calls,
    cleanup: () => {
      delete require.cache[botPath];
      restore.reverse().forEach((fn) => fn());
    },
  };
}

const PRODUCT = {
  _id: '000000000000000000abcdef',
  name: 'Product',
  description: 'Description',
  price: 100,
  oldPrice: 200,
  category: 'vitamins',
  brand: 'Brand',
  imageUrl: '',
  images: [],
};

test('new product and discount broadcasts retry transient timeouts', async () => {
  const { bot, cleanup } = withStubbedBot([{ telegramId: 123456 }]);
  let attempts = 0;
  bot.telegram.sendMessage = async () => {
    attempts += 1;
    if (attempts === 1 || attempts === 3) {
      const error = new Error('request failed');
      error.code = 'ETIMEDOUT';
      throw error;
    }
    return { message_id: attempts };
  };

  try {
    const newResult = await bot.broadcastNewProduct(PRODUCT);
    const discountResult = await bot.broadcastDiscount(PRODUCT);

    assert.deepEqual(newResult, { sent: 1, failed: 0, blocked: 0, total: 1 });
    assert.deepEqual(discountResult, { sent: 1, failed: 0, blocked: 0, total: 1 });
    assert.equal(attempts, 4);
  } finally {
    cleanup();
  }
});

test('a user who blocked the bot is flagged and skipped next time', async () => {
  // Otherwise every future broadcast spends retries on a chat that can never
  // receive anything.
  const { bot, calls, cleanup } = withStubbedBot([
    { telegramId: 111 },
    { telegramId: 222 },
  ]);

  bot.telegram.sendMessage = async (chatId) => {
    if (chatId === 222) {
      const error = new Error('Forbidden: bot was blocked by the user');
      error.response = { error_code: 403, description: 'Forbidden: bot was blocked by the user' };
      throw error;
    }
    return { message_id: 1 };
  };

  try {
    const result = await bot.broadcastNewProduct(PRODUCT);

    assert.equal(result.sent, 1);
    assert.equal(result.failed, 1);
    assert.equal(result.blocked, 1);

    assert.equal(calls.updateMany.length, 1);
    assert.deepEqual(calls.updateMany[0].filter, { telegramId: { $in: [222] } });
    assert.deepEqual(calls.updateMany[0].update, { $set: { botBlocked: true } });

    // And the recipient query excludes them from the next run.
    assert.deepEqual(calls.find[0].botBlocked, { $ne: true });
  } finally {
    cleanup();
  }
});

test('a blocked chat is not retried', async () => {
  // 403 is permanent; retrying it helps nobody and slows the whole run.
  const { bot, cleanup } = withStubbedBot([{ telegramId: 999 }]);
  let attempts = 0;
  bot.telegram.sendMessage = async () => {
    attempts += 1;
    const error = new Error('Forbidden: user is deactivated');
    error.response = { error_code: 403, description: 'Forbidden: user is deactivated' };
    throw error;
  };

  try {
    await bot.broadcastNewProduct(PRODUCT);
    assert.equal(attempts, 1);
  } finally {
    cleanup();
  }
});

test('one slow recipient does not stall the others', async () => {
  // The old chunk-then-sleep shape made every send in a group of 25 wait for
  // the slowest, and a retrying send can take tens of seconds.
  const recipients = Array.from({ length: 12 }, (_, i) => ({ telegramId: 1000 + i }));
  const { bot, cleanup } = withStubbedBot(recipients);

  let inFlight = 0;
  let maxInFlight = 0;
  const finished = [];

  bot.telegram.sendMessage = async (chatId) => {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((r) => setTimeout(r, chatId === 1000 ? 150 : 1));
    inFlight -= 1;
    finished.push(chatId);
    return { message_id: 1 };
  };

  try {
    const result = await bot.broadcastNewProduct(PRODUCT);
    assert.equal(result.sent, 12);
    // Fast recipients overtook the slow one instead of queueing behind it.
    assert.notEqual(finished[0], 1000, 'slow recipient should not finish first');
    assert.ok(maxInFlight > 1, 'sends should overlap');
    assert.ok(maxInFlight <= 8, `concurrency cap exceeded: ${maxInFlight}`);
  } finally {
    cleanup();
  }
});

test('broadcast paces sends so Telegram limits are not tripped', async () => {
  const recipients = Array.from({ length: 6 }, (_, i) => ({ telegramId: 2000 + i }));
  const { bot, cleanup } = withStubbedBot(recipients);

  const startedAt = [];
  bot.telegram.sendMessage = async () => {
    startedAt.push(Date.now());
    return { message_id: 1 };
  };

  try {
    await bot.broadcastNewProduct(PRODUCT);
    const span = startedAt[startedAt.length - 1] - startedAt[0];
    // Six sends at a 40ms floor cannot all start inside 100ms.
    assert.ok(span >= 100, `sends were not paced: ${span}ms for 6 sends`);
  } finally {
    cleanup();
  }
});
