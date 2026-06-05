const assert = require('node:assert/strict');
const test = require('node:test');

process.env.ORDERS_CHANNEL_ID = '-1000000000000';

const { forwardOrderToChannel } = require('../bot/bot');

test('retries transient timeout when forwarding order to channel', async () => {
  let attempts = 0;
  const bot = {
    telegram: {
      sendMessage: async () => {
        attempts += 1;
        if (attempts < 3) {
          const error = new Error('request failed');
          error.code = 'ETIMEDOUT';
          throw error;
        }
        return { message_id: 77 };
      },
    },
  };
  const order = {
    _id: { toString: () => '000000000000000000abcdef' },
    items: [{ name: 'Product', quantity: 1, price: 100 }],
    location: { lat: 41.3, lng: 69.2, addressString: 'Address' },
    customerName: 'Customer',
    customerPhone: '+998000000000',
    telegramId: 123456,
    subtotal: 100,
    discount: 0,
    deliveryFee: 0,
    totalAmount: 100,
    isFirstOrder: false,
    paymentMethod: 'cash',
    notes: '',
    createdAt: new Date('2026-01-01T00:00:00Z'),
  };

  const messageId = await forwardOrderToChannel(bot, order);

  assert.equal(messageId, 77);
  assert.equal(attempts, 3);
});
