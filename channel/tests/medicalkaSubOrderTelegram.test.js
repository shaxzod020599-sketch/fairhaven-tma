const assert = require('node:assert/strict');
const test = require('node:test');

process.env.BILLZ_SECRET_TOKEN = 'test-secret';
process.env.BILLZ_SHOP_ID = 'shop-a';
process.env.MONGO_DB_NAME = 'medicalka-suborder-telegram-test';
process.env.CHANNEL_TELEGRAM_ENABLED = 'true';
process.env.TELEGRAM_BOT_TOKEN = '123:test';
process.env.ORDERS_CHANNEL_ID = '-100777';

let mongod;
let db;
let MedicalkaSubOrder;
let createMedicalkaSubOrderNotifier;

test.before(async () => {
  const { MongoMemoryServer } = require('../../backend/node_modules/mongodb-memory-server');
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();
  db = require('../src/db');
  await db.connect();
  MedicalkaSubOrder = require('../src/models/MedicalkaSubOrder');
  ({ createMedicalkaSubOrderNotifier } = require('../src/notify/telegram'));
});

test.beforeEach(async () => {
  await MedicalkaSubOrder().deleteMany({});
});

test.after(async () => {
  await db?.disconnect();
  await mongod?.stop();
});

async function seed() {
  return MedicalkaSubOrder().create({
    externalId: 'sub-tg-1',
    orderId: 'order-tg-1',
    orderNumber: 'ORD-101',
    subOrderNumber: 'SUB-101',
    pharmacyId: 'pharmacy-a',
    pharmacyName: 'FAIRHAVEN HEALTH',
    paymentStatus: 'paid',
    paymentMethod: 'card',
    status: 'processing',
    deliveryType: 'delivery',
    deliveryProvider: 'Yandex',
    courierStatus: 'searching',
    deliveryServiceStatus: 'searching_courier',
    subtotal: 42000,
    firstSeenAt: new Date('2026-08-25T08:00:00.000Z'),
    lastSeenAt: new Date('2026-08-25T08:00:00.000Z'),
    customer: { firstName: 'Ali', lastName: 'Valiyev', phone: '+998901234567' },
    items: [{ name: 'OvaBoost', quantity: 2, unitPrice: 21000, lineTotal: 42000 }],
    sale: { state: 'observed', lastError: '', reconciliationRequired: false },
  });
}

test('sub-order lifecycle uses one durable operations-channel card', async () => {
  const row = await seed();
  const calls = [];
  const notifier = createMedicalkaSubOrderNotifier({
    send: async (method, payload) => {
      calls.push({ method, payload });
      return method === 'sendMessage' ? { message_id: 501 } : {};
    },
    Model: MedicalkaSubOrder(),
    channelId: '-100777',
  });

  await notifier.announce(row);
  await notifier.announce(row);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'sendMessage');
  assert.equal(calls[0].payload.chat_id, '-100777');
  assert.match(calls[0].payload.text, /ORD-101/);
  assert.match(calls[0].payload.text, /OvaBoost/);
  assert.match(calls[0].payload.text, /42 000 UZS/);
  assert.match(calls[0].payload.text, /paid/);
  assert.match(calls[0].payload.text, /processing/);
  assert.match(calls[0].payload.text, /searching/);
  assert.match(calls[0].payload.text, /observed/);
  assert.doesNotMatch(calls[0].payload.text, /rawIn|password|credential/i);

  await MedicalkaSubOrder().updateOne({ _id: row._id }, {
    $set: {
      courierStatus: 'courier_assigned',
      deliveryServiceStatus: 'courier_found',
      'sale.state': 'sold',
    },
  });
  await notifier.announce(row);
  await notifier.announce(row);

  assert.equal(calls.length, 2);
  assert.equal(calls[1].method, 'editMessageText');
  assert.equal(calls[1].payload.message_id, 501);
  assert.match(calls[1].payload.text, /courier_assigned/);
  assert.match(calls[1].payload.text, /sold/);

  const stored = await MedicalkaSubOrder().findById(row._id).lean();
  assert.equal(stored.notification.chatId, '-100777');
  assert.equal(stored.notification.messageId, 501);
  assert.ok(stored.notification.fingerprint);
  assert.equal(stored.notification.lastError, '');
});

test('failed lifecycle delivery is persisted for retry without duplicate send', async () => {
  const row = await seed();
  let fail = true;
  let sends = 0;
  let current = new Date('2026-08-25T09:00:00.000Z');
  const notifier = createMedicalkaSubOrderNotifier({
    send: async () => {
      sends += 1;
      if (fail) return null;
      return { message_id: 601 };
    },
    Model: MedicalkaSubOrder(),
    channelId: '-100777',
    now: () => current,
  });

  await assert.rejects(() => notifier.announce(row), /medicalka_suborder_telegram_failed/);
  let stored = await MedicalkaSubOrder().findById(row._id).lean();
  assert.equal(stored.notification.attempts, 1);
  assert.equal(stored.notification.lastError, 'medicalka_suborder_telegram_failed');

  fail = false;
  current = new Date(current.getTime() + 30000);
  await notifier.drainOnce();
  await notifier.announce(row);

  stored = await MedicalkaSubOrder().findById(row._id).lean();
  assert.equal(sends, 2);
  assert.equal(stored.notification.messageId, 601);
  assert.equal(stored.notification.lastError, '');
});
