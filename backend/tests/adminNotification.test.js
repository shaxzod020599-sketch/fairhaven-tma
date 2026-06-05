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

test('notifies customer when status changes without a channel message', async () => {
  const order = {
    _id: { toString: () => '000000000000000000abcdef' },
    telegramId: 123456,
    channelMessageId: null,
  };
  const restore = [
    stubModule('../models/User', {}),
    stubModule('../models/Order', {
      findByIdAndUpdate: async () => order,
    }),
    stubModule('../models/Product', {}),
    stubModule('../models/Collection', {}),
    stubModule('../models/Setting', {}),
    stubModule('../models/PromoCode', {}),
    stubModule('../middleware/adminAuth', { resolveAdmin: async () => null }),
  ];

  const controllerPath = require.resolve('../controllers/adminController');
  delete require.cache[controllerPath];
  const controller = require('../controllers/adminController');
  const sent = [];
  const req = {
    params: { id: 'order-id' },
    body: { status: 'cancelled' },
    app: {
      locals: {
        bot: {
          telegram: {
            sendMessage: async (...args) => sent.push(args),
          },
        },
      },
    },
    admin: { firstName: 'Admin' },
  };
  const res = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json() {
      return this;
    },
  };

  try {
    await controller.updateOrderStatus(req, res);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(sent.length, 1);
    assert.equal(sent[0][0], order.telegramId);
    assert.match(sent[0][1], /Заказ отменён/);
  } finally {
    delete require.cache[controllerPath];
    restore.reverse().forEach((fn) => fn());
  }
});
