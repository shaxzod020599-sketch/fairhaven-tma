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

test('new product and discount broadcasts retry transient timeouts', async () => {
  const restore = [
    stubModule('../models/User', {
      find: () => ({
        select: () => ({
          lean: async () => [{ telegramId: 123456 }],
        }),
      }),
    }),
    stubModule('../models/Order', {}),
  ];
  const botPath = require.resolve('../bot/bot');
  delete require.cache[botPath];
  const { createBot } = require('../bot/bot');
  const bot = createBot('123456:test-token', 'https://mini.fairhaven.uz');
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
  const product = {
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

  try {
    const newResult = await bot.broadcastNewProduct(product);
    const discountResult = await bot.broadcastDiscount(product);

    assert.deepEqual(newResult, { sent: 1, failed: 0, total: 1 });
    assert.deepEqual(discountResult, { sent: 1, failed: 0, total: 1 });
    assert.equal(attempts, 4);
  } finally {
    delete require.cache[botPath];
    restore.reverse().forEach((fn) => fn());
  }
});
