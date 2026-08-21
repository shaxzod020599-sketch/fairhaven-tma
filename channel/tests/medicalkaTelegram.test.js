const assert = require('node:assert/strict');
const test = require('node:test');

process.env.BILLZ_SECRET_TOKEN = 'test-secret';
process.env.BILLZ_SHOP_ID = 'shop-a';
process.env.MONGO_DB_NAME = 'medicalka-telegram-test';
process.env.CHANNEL_TELEGRAM_ENABLED = 'true';
process.env.TELEGRAM_BOT_TOKEN = '123:test';

let mongod;
let db;
let AdminView;
let MedicalkaApproval;
let createMedicalkaNotifier;
let normalizeApproval;

const pending = () => ({
  id: 'approval-tg', checkout_id: 'checkout-tg', pharmacy_id: 'pharmacy-a',
  pharmacy_name: 'FAIRHAVEN HEALTH', status: 'pending',
  created_at: '2026-08-22T03:00:00.000Z', checkout_is_active: true,
  requires_action: true, delivery_type: 'pickup',
  customer_first_name: 'Ali', customer_last_name: 'Valiyev',
  customer_phone: '+998901234567', pharmacy_items_subtotal: '15000',
  items: [{
    stock_id: 'stock-a', product_id: 501, product_name: 'OvaBoost',
    product_external_name: 'OvaBoost external', quantity: 1,
    unit_price: '15000', line_total: '15000',
  }],
});

test.before(async () => {
  const { MongoMemoryServer } = require('../../backend/node_modules/mongodb-memory-server');
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();
  db = require('../src/db');
  await db.connect();
  AdminView = require('../src/models/AdminView');
  MedicalkaApproval = require('../src/models/MedicalkaApproval');
  ({ createMedicalkaNotifier } = require('../src/notify/telegram'));
  ({ normalizeApproval } = require('../src/medicalka/approvals'));
});

test.beforeEach(async () => {
  await Promise.all([
    db.getConnection().collection('users').deleteMany({}),
    MedicalkaApproval().deleteMany({}),
  ]);
});

test.after(async () => {
  await db?.disconnect();
  await mongod?.stop();
});

async function seed() {
  await db.getConnection().collection('users').insertMany([
    { telegramId: 11, role: 'admin', firstName: 'One' },
    { telegramId: 22, role: 'admin', firstName: 'Two' },
    { telegramId: 33, role: 'user', firstName: 'Customer' },
  ]);
  const approval = await MedicalkaApproval().create(normalizeApproval(pending(), new Date()));
  return approval.toObject();
}

test('new approval is sent directly to current admins only and once', async () => {
  const approval = await seed();
  const calls = [];
  const notifier = createMedicalkaNotifier({
    send: async (method, payload) => {
      calls.push({ method, payload });
      return { message_id: 100 + calls.length };
    },
    AdminModel: AdminView(),
    ApprovalModel: MedicalkaApproval(),
  });

  await notifier.announce(approval);
  await notifier.announce(approval);

  assert.deepEqual(calls.map((row) => row.payload.chat_id).sort(), [11, 22]);
  assert.ok(calls.every((row) => row.method === 'sendMessage'));
  assert.ok(calls.every((row) => row.payload.reply_markup.inline_keyboard.length === 2));
  const callbackData = calls.flatMap((row) => row.payload.reply_markup.inline_keyboard.flat())
    .map((button) => button.callback_data);
  assert.ok(callbackData.every((value) => value.length <= 64));
  assert.doesNotMatch(callbackData.join(' '), /Ali|99890|checkout/);

  const stored = await MedicalkaApproval().findById(approval._id).lean();
  assert.equal(stored.notification.messages.length, 2);
});

test('a failed admin retries without duplicating successful delivery', async () => {
  const approval = await seed();
  const attempts = [];
  let fail22 = true;
  const notifier = createMedicalkaNotifier({
    send: async (_method, payload) => {
      attempts.push(payload.chat_id);
      if (payload.chat_id === 22 && fail22) return null;
      return { message_id: 200 + payload.chat_id };
    },
    AdminModel: AdminView(),
    ApprovalModel: MedicalkaApproval(),
  });

  await assert.rejects(() => notifier.announce(approval), /medicalka_telegram_partial_failure/);
  fail22 = false;
  await notifier.announce(approval);

  assert.deepEqual(attempts, [11, 22, 22]);
});

test('inactive checkout never receives live approval buttons', async () => {
  const approval = await seed();
  await MedicalkaApproval().updateOne({ _id: approval._id }, {
    $set: { checkoutActive: false },
  });
  let sends = 0;
  const notifier = createMedicalkaNotifier({
    send: async () => { sends += 1; return { message_id: 1 }; },
    AdminModel: AdminView(),
    ApprovalModel: MedicalkaApproval(),
  });

  await notifier.announce(approval);

  assert.equal(sends, 0);
});

test('final decision edits every delivered card and removes buttons', async () => {
  const approval = await seed();
  await MedicalkaApproval().updateOne({ _id: approval._id }, {
    $set: {
      status: 'accepted', requiresAction: false,
      'decision.actorName': 'Operator', 'decision.actorType': 'telegram',
    },
    $push: {
      'notification.messages': {
        telegramId: 11, messageId: 301, sentAt: new Date(),
      },
    },
  });
  const calls = [];
  const notifier = createMedicalkaNotifier({
    send: async (method, payload) => { calls.push({ method, payload }); return {}; },
    AdminModel: AdminView(),
    ApprovalModel: MedicalkaApproval(),
  });

  await notifier.finalize(String(approval._id));

  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'editMessageText');
  assert.equal(calls[0].payload.chat_id, 11);
  assert.deepEqual(calls[0].payload.reply_markup, { inline_keyboard: [] });
  assert.match(calls[0].payload.text, /Operator/);
  const stored = await MedicalkaApproval().findById(approval._id).lean();
  assert.ok(stored.notification.messages[0].finalizedAt);
});

test('failed final edit remains pending and only unfinished cards retry', async () => {
  const approval = await seed();
  await MedicalkaApproval().updateOne({ _id: approval._id }, {
    $set: { status: 'accepted', requiresAction: false },
    $push: {
      'notification.messages': {
        telegramId: 11, messageId: 301, sentAt: new Date(),
      },
    },
  });
  let fail = true;
  let attempts = 0;
  let current = new Date('2026-08-22T05:00:00.000Z');
  const notifier = createMedicalkaNotifier({
    send: async () => {
      attempts += 1;
      if (fail) return null;
      return {};
    },
    AdminModel: AdminView(),
    ApprovalModel: MedicalkaApproval(),
    now: () => current,
  });

  await assert.rejects(
    () => notifier.finalize(String(approval._id)),
    /medicalka_telegram_finalize_partial_failure/
  );
  let stored = await MedicalkaApproval().findById(approval._id).lean();
  assert.equal(stored.notification.messages[0].finalizedAt, null);
  assert.equal(stored.notification.messages[0].finalizeAttempts, 1);

  fail = false;
  current = new Date(current.getTime() + 30000);
  await notifier.finalize(String(approval._id));
  await notifier.finalize(String(approval._id));
  stored = await MedicalkaApproval().findById(approval._id).lean();
  assert.equal(attempts, 2);
  assert.ok(stored.notification.messages[0].finalizedAt);
});
