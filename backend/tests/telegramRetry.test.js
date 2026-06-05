const assert = require('node:assert/strict');
const test = require('node:test');

const { launchBotWithRetry, withTelegramRetry } = require('../utils/telegramRetry');

test('retries transient Telegram timeouts and returns successful result', async () => {
  let attempts = 0;
  const result = await withTelegramRetry(
    async () => {
      attempts += 1;
      if (attempts < 3) {
        const error = new Error('request failed');
        error.code = 'ETIMEDOUT';
        throw error;
      }
      return { message_id: 42 };
    },
    { delays: [0, 0] }
  );

  assert.deepEqual(result, { message_id: 42 });
  assert.equal(attempts, 3);
});

test('does not retry permanent Telegram errors', async () => {
  let attempts = 0;

  await assert.rejects(
    withTelegramRetry(
      async () => {
        attempts += 1;
        const error = new Error('Forbidden: bot was blocked by the user');
        error.response = { error_code: 403 };
        throw error;
      },
      { delays: [0, 0] }
    ),
    /Forbidden/
  );

  assert.equal(attempts, 1);
});

test('relaunches bot polling after transient launch failure', async () => {
  let attempts = 0;
  const bot = {
    launch: async () => {
      attempts += 1;
      if (attempts < 3) {
        const error = new Error('getMe failed');
        error.code = 'ETIMEDOUT';
        throw error;
      }
    },
  };

  await launchBotWithRetry(bot, {
    delays: [0, 0],
    isStopping: () => attempts >= 3,
  });

  assert.equal(attempts, 3);
});

test('relaunches bot polling after getUpdates conflict', async () => {
  let attempts = 0;
  const bot = {
    launch: async () => {
      attempts += 1;
      if (attempts === 1) {
        const error = new Error('Conflict: terminated by other getUpdates request');
        error.response = { error_code: 409 };
        throw error;
      }
    },
  };

  await launchBotWithRetry(bot, {
    delays: [0],
    isStopping: () => attempts >= 2,
  });

  assert.equal(attempts, 2);
});
