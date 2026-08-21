const assert = require('node:assert/strict');
const test = require('node:test');

process.env.BILLZ_SECRET_TOKEN = 'test-secret';
process.env.BILLZ_SHOP_ID = 'shop-a';
process.env.MONGO_DB_NAME = 'medicalka-approvals-test';

let mongod;
let db;
let MedicalkaApproval;
let createApprovalService;
let normalizeApproval;

const pending = (over = {}) => ({
  id: 'approval-a',
  checkout_id: 'checkout-a',
  pharmacy_id: 'pharmacy-a',
  pharmacy_name: 'FAIRHAVEN HEALTH',
  status: 'pending',
  comment: null,
  created_at: '2026-08-22T03:00:00.000Z',
  checkout_status: 'pending_pharmacy_approval',
  checkout_is_active: true,
  delivery_type: 'pickup',
  checkout_delivery_data: null,
  order_id: null,
  customer_first_name: 'Ali',
  customer_last_name: 'Valiyev',
  customer_phone: '+998901234567',
  items: [{
    stock_id: 'stock-a',
    product_id: 501,
    product_name: 'OvaBoost',
    product_external_name: 'OvaBoost external',
    quantity: 2,
    unit_price: '15000.00',
    line_total: '30000.00',
  }],
  pharmacy_items_subtotal: '30000.00',
  requires_action: true,
  checkout_pharmacy_approvals: [{
    pharmacy_id: 'pharmacy-a', pharmacy_name: 'FAIRHAVEN HEALTH', status: 'pending',
  }],
  ...over,
});

const deferred = () => {
  let resolve;
  const promise = new Promise((yes) => { resolve = yes; });
  return { promise, resolve };
};

test.before(async () => {
  const { MongoMemoryServer } = require('../../backend/node_modules/mongodb-memory-server');
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();
  db = require('../src/db');
  await db.connect();
  MedicalkaApproval = require('../src/models/MedicalkaApproval');
  ({ createApprovalService, normalizeApproval } = require('../src/medicalka/approvals'));
  await MedicalkaApproval().init();
});

test.beforeEach(async () => {
  await MedicalkaApproval().deleteMany({});
});

test.after(async () => {
  await db?.disconnect();
  await mongod?.stop();
});

test('normalises the complete documented approval fixture', () => {
  const row = normalizeApproval(pending(), new Date('2026-08-22T03:00:10.000Z'));

  assert.deepEqual({
    externalId: row.externalId,
    checkoutId: row.checkoutId,
    pharmacyId: row.pharmacyId,
    status: row.status,
    requiresAction: row.requiresAction,
    checkoutActive: row.checkoutActive,
    deliveryType: row.deliveryType,
    customer: row.customer,
    subtotal: row.subtotal,
    deadlineAt: row.deadlineAt.toISOString(),
    item: row.items[0],
  }, {
    externalId: 'approval-a',
    checkoutId: 'checkout-a',
    pharmacyId: 'pharmacy-a',
    status: 'pending',
    requiresAction: true,
    checkoutActive: true,
    deliveryType: 'pickup',
    customer: { firstName: 'Ali', lastName: 'Valiyev', phone: '+998901234567' },
    subtotal: 30000,
    deadlineAt: '2026-08-22T03:03:00.000Z',
    item: {
      stockId: 'stock-a', productId: '501', name: 'OvaBoost',
      externalName: 'OvaBoost external', quantity: 2, unitPrice: 15000, lineTotal: 30000,
    },
  });
});

test('poll upserts duplicates and announces a new approval once across restarts', async () => {
  const announced = [];
  const client = {
    getPharmacies: async () => ({ items: [{ id: 'pharmacy-a' }] }),
    listApprovals: async () => ({ items: [pending()], total: 1, limit: 100, offset: 0 }),
  };

  const first = createApprovalService({ client, onNew: async (row) => announced.push(row.externalId) });
  await first.pollOnce();
  const restarted = createApprovalService({ client, onNew: async (row) => announced.push(row.externalId) });
  await restarted.pollOnce();

  assert.equal(await MedicalkaApproval().countDocuments({ externalId: 'approval-a' }), 1);
  assert.deepEqual(announced, ['approval-a']);
});

test('overlapping polls never issue a second Medicalka request', async () => {
  const entered = deferred();
  const release = deferred();
  let calls = 0;
  const client = {
    getPharmacies: async () => ({ items: [{ id: 'pharmacy-a' }] }),
    listApprovals: async () => {
      calls += 1;
      entered.resolve();
      await release.promise;
      return { items: [], total: 0, limit: 100, offset: 0 };
    },
  };
  const service = createApprovalService({ client });
  const first = service.pollOnce();
  await entered.promise;
  const second = await service.pollOnce();
  release.resolve();
  await first;

  assert.deepEqual(second, { skipped: true });
  assert.equal(calls, 1);
});

test('one atomic decision wins and the same completed action is idempotent', async () => {
  await MedicalkaApproval().create(normalizeApproval(pending(), new Date()));
  const entered = deferred();
  const release = deferred();
  let writes = 0;
  const client = {
    respondToApproval: async () => {
      writes += 1;
      entered.resolve();
      await release.promise;
      return {};
    },
  };
  const service = createApprovalService({ client });
  const actor = { type: 'telegram', telegramId: 77, name: 'Operator' };

  const first = service.respond('approval-a', { action: 'accepted', actor });
  await entered.promise;
  await assert.rejects(
    () => service.respond('approval-a', { action: 'rejected', actor }),
    (err) => err.code === 'medicalka_action_in_progress' && err.status === 409
  );
  release.resolve();
  const decided = await first;
  const repeated = await service.respond('approval-a', { action: 'accepted', actor });

  assert.equal(writes, 1);
  assert.equal(decided.approval.status, 'accepted');
  assert.equal(decided.approval.decision.actorTelegramId, 77);
  assert.equal(repeated.idempotent, true);
});

test('opposite final action conflicts and long reject comments are refused', async () => {
  await MedicalkaApproval().create(normalizeApproval(pending({
    status: 'accepted', requires_action: false,
  }), new Date()));
  const service = createApprovalService({ client: { respondToApproval: async () => ({}) } });
  const actor = { type: 'admin-panel', telegramId: 88, name: 'Admin' };

  await assert.rejects(
    () => service.respond('approval-a', { action: 'rejected', actor }),
    (err) => err.code === 'medicalka_action_conflict' && err.status === 409
  );
  await assert.rejects(
    () => service.respond('approval-a', {
      action: 'rejected', actor, comment: 'x'.repeat(501),
    }),
    (err) => err.code === 'medicalka_comment_too_long' && err.status === 422
  );
});

test('transient failure releases the decision lease for a safe retry', async () => {
  await MedicalkaApproval().create(normalizeApproval(pending(), new Date()));
  const failure = Object.assign(new Error('upstream private text'), {
    code: 'medicalka_timeout', retrySafe: true,
  });
  const service = createApprovalService({
    client: { respondToApproval: async () => { throw failure; } },
  });

  await assert.rejects(
    () => service.respond('approval-a', {
      action: 'accepted', actor: { type: 'admin-panel', telegramId: 1, name: 'A' },
    }),
    (err) => err.code === 'medicalka_timeout'
  );
  const stored = await MedicalkaApproval().findOne({ externalId: 'approval-a' }).lean();
  assert.equal(stored.operation.token, '');
  assert.equal(stored.status, 'pending');
  assert.equal(stored.sync.lastError, 'medicalka_timeout');
  assert.doesNotMatch(JSON.stringify(stored), /upstream private text/);
});

test('notification edit failure cannot turn a completed Medicalka action into failure', async () => {
  await MedicalkaApproval().create(normalizeApproval(pending(), new Date()));
  let edits = 0;
  const service = createApprovalService({
    client: { respondToApproval: async () => ({}) },
    onDecision: async () => { edits += 1; throw new Error('telegram unavailable'); },
  });

  const result = await service.respond('approval-a', {
    action: 'accepted', actor: { type: 'admin-panel', telegramId: 1, name: 'A' },
  });

  assert.equal(result.approval.status, 'accepted');
  assert.equal(edits, 1);
});
