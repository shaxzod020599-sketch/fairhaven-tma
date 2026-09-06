const assert = require('node:assert/strict');
const test = require('node:test');

process.env.BILLZ_SECRET_TOKEN = 'test-secret';
process.env.BILLZ_SHOP_ID = 'shop-a';
process.env.MONGO_DB_NAME = 'medicalka-runtime-profile-test';
process.env.MEDICALKA_INBOUND_ENABLED = 'false';
process.env.MEDICALKA_CREDENTIALS_ENCRYPTION_KEY = 'runtime-test-key-with-more-than-thirty-two-bytes';

let mongod;
let db;
let runtime;
let MedicalkaApproval;

test.before(async () => {
  const { MongoMemoryServer } = require('../../backend/node_modules/mongodb-memory-server');
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();
  db = require('../src/db');
  await db.connect();

  const { createCredentialCipher } = require('../src/medicalka/credentialCipher');
  const MedicalkaPartnerProfile = require('../src/models/MedicalkaPartnerProfile');
  const box = createCredentialCipher(process.env.MEDICALKA_CREDENTIALS_ENCRYPTION_KEY);
  await MedicalkaPartnerProfile().create({
    environment: 'staging',
    baseUrl: 'https://api.staging.medicalka.com/api/v1',
    usernameCipher: box.encrypt('staging-user', 'staging:username'),
    passwordCipher: box.encrypt('staging-password', 'staging:password'),
    processingMode: 'observe',
    active: true,
    pharmacies: [{ id: 'pharmacy-staging', name: 'Staging' }],
    lastValidatedAt: new Date('2026-08-25T12:00:00.000Z'),
  });

  MedicalkaApproval = require('../src/models/MedicalkaApproval');
  const common = {
    checkoutId: 'checkout-1', pharmacyId: 'pharmacy-1', status: 'pending',
    firstSeenAt: new Date(), lastSeenAt: new Date(),
  };
  await MedicalkaApproval('production').create({ ...common, externalId: 'production-only' });
  await MedicalkaApproval('staging').create({ ...common, externalId: 'staging-only' });

  runtime = require('../src/medicalka/runtime');
  await runtime.start();
});

test.after(async () => {
  runtime?.stop();
  await db?.disconnect();
  await mongod?.stop();
});

test('runtime loads active encrypted profile without exposing its credentials', async () => {
  const summary = await runtime.connectionSummary();
  assert.equal(summary.activeEnvironment, 'staging');
  const staging = summary.profiles.find((profile) => profile.environment === 'staging');
  assert.equal(staging.username, 'st••••••••er');
  assert.equal(JSON.stringify(summary).includes('staging-password'), false);
  assert.equal(JSON.stringify(summary).includes('passwordCipher'), false);
});

test('active staging runtime lists only staging approval records', async () => {
  const result = await runtime.listApprovals({ bucket: 'all' });
  assert.deepEqual(result.data.map((row) => row.externalId), ['staging-only']);
});

for (const environment of ['staging', 'production']) {
  test(`runtime finalizes only ${environment} cards and preserves undelivered announcements`, { timeout: 5000 }, async () => {
    const config = require('../src/config');
    const notify = require('../src/notify/telegram');
    const { MedicalkaPartnerClient } = require('../src/medicalka/partnerClient');
    const { normalizeApproval } = require('../src/medicalka/approvals');
    const savedConfig = { ...config.medicalkaPartner };
    const savedTelegram = { ...config.telegram };
    const savedPharmacies = MedicalkaPartnerClient.prototype.getPharmacies;
    const savedList = MedicalkaPartnerClient.prototype.listApprovals;
    const savedFinalize = notify.finalizeMedicalkaApproval;
    const savedAnnounce = notify.announceMedicalkaApproval;
    runtime.stop();
    const raw = {
      id: 'runtime-notify', checkout_id: 'checkout-notify', pharmacy_id: 'pharmacy-1',
      created_at: new Date().toISOString(), status: 'pending',
      requires_action: true, checkout_is_active: true,
    };
    const active = MedicalkaApproval(environment);
    const other = MedicalkaApproval(environment === 'staging' ? 'production' : 'staging');
    const calls = [];
    let finishAnnouncement;
    let finishFinalization;
    const announced = new Promise((resolve) => { finishAnnouncement = resolve; });
    const finalized = new Promise((resolve) => { finishFinalization = resolve; });
    try {
      await Promise.all([active.deleteMany({}), other.deleteMany({})]);
      const row = await active.create(normalizeApproval(raw));
      await other.create({ ...normalizeApproval(raw), _id: row._id, status: 'rejected', requiresAction: false,
        notification: { messages: [{ telegramId: 99, messageId: 7, sentAt: new Date() }] } });
      Object.assign(config.medicalkaPartner, { enabled: false, credentialsEncryptionKey: '',
        baseUrl: environment === 'staging' ? 'https://api.staging.medicalka.com/api/v1' : 'https://api.medicalka.com/api/v1' });
      Object.assign(config.telegram, { enabled: false, botToken: '123:test' });
      MedicalkaPartnerClient.prototype.getPharmacies = async () => [{ id: 'pharmacy-1' }];
      MedicalkaPartnerClient.prototype.listApprovals = async ({ status }) => ({
        items: status === raw.status ? [raw] : [], total: status === raw.status ? 1 : 0,
      });
      notify.announceMedicalkaApproval = async (...args) => {
        const result = await savedAnnounce(...args);
        finishAnnouncement();
        return result;
      };
      notify.finalizeMedicalkaApproval = async (id, options) => {
        try {
          return await savedFinalize(id, { ...options, send: async (_method, payload) => {
            calls.push(String(payload.chat_id)); return {};
          } });
        } finally { finishFinalization(); }
      };
      await runtime.start();
      await runtime.pollOnce();
      await announced;
      // Wait for the durable claim to be released by the asynchronous worker.
      for (let i = 0; i < 100; i += 1) {
        const stored = await active.findById(row._id).lean();
        if (!stored.notification.claimToken) break;
        await new Promise((resolve) => setImmediate(resolve));
      }
      assert.equal((await active.findById(row._id).lean()).notification.notifiedAt, null);
      await active.updateOne({ _id: row._id }, { $push: {
        'notification.messages': { telegramId: 11, messageId: 7, sentAt: new Date() },
      } });
      config.telegram.enabled = true;
      raw.status = 'rejected';
      raw.requires_action = false;
      await runtime.reconcileOnce();
      await finalized;
      assert.deepEqual(calls, ['11']);
      assert.ok((await active.findById(row._id).lean()).notification.messages[0].finalizedAt);
      assert.equal((await other.findById(row._id).lean()).notification.messages[0].finalizedAt, null);
    } finally {
      runtime.stop();
      Object.assign(config.medicalkaPartner, savedConfig);
      Object.assign(config.telegram, savedTelegram);
      MedicalkaPartnerClient.prototype.getPharmacies = savedPharmacies;
      MedicalkaPartnerClient.prototype.listApprovals = savedList;
      notify.finalizeMedicalkaApproval = savedFinalize;
      notify.announceMedicalkaApproval = savedAnnounce;
    }
  });
}
