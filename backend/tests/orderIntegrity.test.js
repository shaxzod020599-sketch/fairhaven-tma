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

test('order creation uses database product name and price', async () => {
  let createdOrder;
  const productId = '507f1f77bcf86cd799439011';
  const restore = [
    stubModule('../models/Order', {
      countDocuments: async () => 0,
      create: async (data) => {
        createdOrder = data;
        return { ...data, _id: 'order-id' };
      },
    }),
    stubModule('../models/User', {
      findOne: async () => ({
        _id: 'user-id',
        registrationStep: 'done',
        consentAccepted: true,
        firstName: 'Real',
        phone: '+998901234567',
        promoCodesUsed: [],
      }),
    }),
    stubModule('../models/Product', {
      find: async () => [{
        _id: { toString: () => productId },
        name: 'Database Product',
        price: 100000,
        isAvailable: true,
      }],
    }),
    stubModule('../models/PromoCode', {}),
  ];
  const controllerPath = require.resolve('../controllers/orderController');
  delete require.cache[controllerPath];
  const controller = require('../controllers/orderController');
  const res = responseRecorder();

  try {
    await controller.create({
      telegramUser: { id: 111 },
      body: {
        telegramId: 999,
        items: [{
          productId,
          name: 'Fake Product',
          price: 1,
          quantity: 2,
        }],
        location: { lat: 41.3, lng: 69.2, addressString: 'Address' },
        customerPhone: '+998901234567',
        paymentMethod: 'cash',
      },
      app: { locals: {} },
    }, res);

    assert.equal(res.statusCode, 201);
    assert.equal(createdOrder.telegramId, 111);
    assert.equal(createdOrder.items[0].name, 'Database Product');
    assert.equal(createdOrder.items[0].price, 100000);
    assert.equal(createdOrder.subtotal, 200000);
    assert.equal(createdOrder.totalAmount, 225000);
  } finally {
    delete require.cache[controllerPath];
    restore.reverse().forEach((fn) => fn());
  }
});

test('order creation rejects excessive quantity before database write', async () => {
  let createCalled = false;
  const restore = [
    stubModule('../models/Order', {
      create: async () => {
        createCalled = true;
      },
    }),
    stubModule('../models/User', {}),
    stubModule('../models/Product', {}),
    stubModule('../models/PromoCode', {}),
  ];
  const controllerPath = require.resolve('../controllers/orderController');
  delete require.cache[controllerPath];
  const controller = require('../controllers/orderController');
  const res = responseRecorder();

  try {
    await controller.create({
      telegramUser: { id: 111 },
      body: {
        items: [{
          productId: '507f1f77bcf86cd799439011',
          quantity: 10000,
          price: 1,
        }],
        location: { lat: 41.3, lng: 69.2, addressString: 'Address' },
      },
      app: { locals: {} },
    }, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, 'invalid_items');
    assert.equal(createCalled, false);
  } finally {
    delete require.cache[controllerPath];
    restore.reverse().forEach((fn) => fn());
  }
});

test('upload validation rejects content that does not match declared image type', () => {
  const { isValidImageSignature } = require('../controllers/uploadController');

  assert.equal(isValidImageSignature(Buffer.from('not an image'), 'image/png'), false);
  assert.equal(
    isValidImageSignature(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'image/png'),
    true
  );
});
