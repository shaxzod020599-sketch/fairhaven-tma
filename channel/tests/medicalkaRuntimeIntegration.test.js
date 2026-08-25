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
