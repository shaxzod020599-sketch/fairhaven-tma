const assert = require('node:assert/strict');
const test = require('node:test');

process.env.BILLZ_SECRET_TOKEN = 'test-secret';
process.env.BILLZ_SHOP_ID = 'shop-a';
process.env.MONGO_DB_NAME = 'medicalka-telegram-test';
process.env.CHANNEL_TELEGRAM_ENABLED = 'true';
process.env.TELEGRAM_BOT_TOKEN = '123:test';
process.env.ORDERS_CHANNEL_ID = '-100777';

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

test('new approval is sent to current admins and operations channel only once', async () => {
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

  assert.deepEqual(
    calls.map((row) => String(row.payload.chat_id)).sort(),
    ['-100777', '11', '22']
  );
  assert.ok(calls.every((row) => row.method === 'sendMessage'));
  assert.ok(calls.every((row) => row.payload.reply_markup.inline_keyboard.length === 2));
  const callbackData = calls.flatMap((row) => row.payload.reply_markup.inline_keyboard.flat())
    .map((button) => button.callback_data);
  assert.ok(callbackData.every((value) => value.length <= 64));
  assert.doesNotMatch(callbackData.join(' '), /Ali|99890|checkout/);

  const stored = await MedicalkaApproval().findById(approval._id).lean();
  assert.equal(stored.notification.messages.length, 3);
  assert.deepEqual(
    stored.notification.messages.map((row) => row.recipientType).sort(),
    ['admin', 'admin', 'channel']
  );
});

test('a failed admin retries without duplicating successful delivery', async () => {
  const approval = await seed();
  const attempts = [];
  let fail22 = true;
  let nextMessageId = 200;
  const notifier = createMedicalkaNotifier({
    send: async (_method, payload) => {
      attempts.push(payload.chat_id);
      if (payload.chat_id === 22 && fail22) return null;
      nextMessageId += 1;
      return { message_id: nextMessageId };
    },
    AdminModel: AdminView(),
    ApprovalModel: MedicalkaApproval(),
  });

  await assert.rejects(() => notifier.announce(approval), /medicalka_telegram_partial_failure/);
  fail22 = false;
  await notifier.announce(approval);

  assert.deepEqual(attempts, [11, 22, '-100777', 22]);
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
      'notification.messages': { $each: [
        {
          recipientKey: 'admin:11', recipientType: 'admin', chatId: '11',
          telegramId: 11, messageId: 301, sentAt: new Date(),
        },
        {
          recipientKey: 'channel:-100777', recipientType: 'channel', chatId: '-100777',
          messageId: 302, sentAt: new Date(),
        },
      ] },
    },
  });
  const calls = [];
  const notifier = createMedicalkaNotifier({
    send: async (method, payload) => { calls.push({ method, payload }); return {}; },
    AdminModel: AdminView(),
    ApprovalModel: MedicalkaApproval(),
  });

  await notifier.finalize(String(approval._id));

  assert.equal(calls.length, 2);
  assert.ok(calls.every((row) => row.method === 'editMessageText'));
  assert.deepEqual(calls.map((row) => String(row.payload.chat_id)).sort(), ['-100777', '11']);
  assert.ok(calls.every((row) => (
    JSON.stringify(row.payload.reply_markup) === JSON.stringify({ inline_keyboard: [] })
  )));
  assert.ok(calls.every((row) => /Operator/.test(row.payload.text)));
  const stored = await MedicalkaApproval().findById(approval._id).lean();
  assert.ok(stored.notification.messages.every((row) => row.finalizedAt));
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

test('no recipients reports no delivery and can retry when an admin appears', async () => {
  const approval = await seed();
  await db.getConnection().collection('users').deleteMany({});
  const calls = [];
  const notifier = createMedicalkaNotifier({
    channelId: '',
    send: async (_method, payload) => { calls.push(payload); return { message_id: 1 }; },
  });
  assert.equal(await notifier.announce(approval), false);
  await db.getConnection().collection('users').insertOne({ telegramId: 11, role: 'admin' });
  assert.equal(await notifier.announce(approval), true);
  await notifier.announce(approval);
  assert.equal(calls.length, 1);
});

test('finalize leaves still-actionable cards untouched', async () => {
  const approval = await seed();
  const calls = [];
  const notifier = createMedicalkaNotifier({
    send: async (method) => { calls.push(method); return { message_id: calls.length }; },
  });
  await notifier.announce(approval);
  calls.length = 0;
  await notifier.finalize(approval._id);
  assert.deepEqual(calls, []);
  const stored = await MedicalkaApproval().findById(approval._id).lean();
  assert.ok(stored.notification.messages.every((row) => !row.finalizedAt));
});

test('identical message IDs in different chats finalize and retry independently', async () => {
  const approval = await seed();
  await MedicalkaApproval().updateOne({ _id: approval._id }, { $set: {
    status: 'rejected', requiresAction: false,
    'notification.messages': [
      { telegramId: 11, messageId: 7, sentAt: new Date() },
      { recipientKey: 'admin:22', chatId: '22', telegramId: 22, messageId: 7, sentAt: new Date() },
      { recipientKey: 'channel:-100777', chatId: '-100777', messageId: 7, sentAt: new Date() },
    ],
  } });
  const calls = [];
  let current = new Date();
  let fail = true;
  const notifier = createMedicalkaNotifier({
    now: () => current,
    send: async (_method, payload) => {
      calls.push(String(payload.chat_id));
      if (String(payload.chat_id) === '22' && fail) return null;
      return {};
    },
  });
  await assert.rejects(() => notifier.finalize(approval._id), /finalize_partial_failure/);
  let stored = await MedicalkaApproval().findById(approval._id).lean();
  assert.deepEqual(stored.notification.messages.map((row) => Boolean(row.finalizedAt)), [true, false, true]);
  assert.deepEqual(stored.notification.messages.map((row) => row.finalizeAttempts), [1, 1, 1]);
  fail = false;
  current = new Date(current.getTime() + 30000);
  await notifier.finalize(approval._id);
  await notifier.finalize(approval._id);
  assert.deepEqual(calls, ['11', '22', '-100777', '22']);
});

test('closure during send cleans the delivered card and stops further announcements', async () => {
  const approval = await seed();
  const calls = [];
  const notifier = createMedicalkaNotifier({
    send: async (method, payload) => {
      calls.push({ method, payload });
      if (method === 'sendMessage') {
        await MedicalkaApproval().updateOne({ _id: approval._id }, { $set: {
          status: 'rejected', requiresAction: false,
          comment: 'Auto-rejected: no response within the time limit',
        } });
        // A concurrent finalizer sees no stored message until send returns.
        await notifier.finalize(approval._id);
        return { message_id: 9 };
      }
      return {};
    },
  });
  await notifier.announce(approval);
  assert.deepEqual(calls.map((row) => row.method), ['sendMessage', 'editMessageText']);
  assert.deepEqual(calls[1].payload.reply_markup, { inline_keyboard: [] });
  assert.match(calls[1].payload.text, /Автоматически отклонено/);
  const stored = await MedicalkaApproval().findById(approval._id).lean();
  assert.ok(stored.notification.messages[0].finalizedAt);
});
