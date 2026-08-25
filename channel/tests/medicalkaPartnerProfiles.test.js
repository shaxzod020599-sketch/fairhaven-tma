const assert = require('node:assert/strict');
const test = require('node:test');

process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017';
process.env.BILLZ_SECRET_TOKEN = process.env.BILLZ_SECRET_TOKEN || 'test-secret';
process.env.BILLZ_SHOP_ID = process.env.BILLZ_SHOP_ID || 'shop-a';

const { createCredentialCipher } = require('../src/medicalka/credentialCipher');
const {
  ENVIRONMENTS,
  createPartnerProfileService,
} = require('../src/medicalka/partnerProfiles');

function fakeModel(initial = []) {
  const rows = new Map(initial.map((row) => [row.environment, structuredClone(row)]));
  return {
    rows,
    findOne(query) {
      return { lean: async () => structuredClone(rows.get(query.environment) || null) };
    },
    find(query = {}) {
      const result = [...rows.values()].filter((row) => (
        !query.environment || row.environment === query.environment
      ));
      return { sort: () => ({ lean: async () => structuredClone(result) }) };
    },
    findOneAndUpdate(query, update) {
      const previous = rows.get(query.environment) || {};
      const next = { ...previous, ...structuredClone(update.$set || {}) };
      rows.set(query.environment, next);
      return { lean: async () => structuredClone(next) };
    },
  };
}

function cipher() {
  return createCredentialCipher('test-key-with-at-least-thirty-two-bytes-long');
}

test('credential encryption uses a random IV and rejects tampering', () => {
  const box = cipher();
  const first = box.encrypt('partner-password', 'production');
  const second = box.encrypt('partner-password', 'production');

  assert.notEqual(first, second);
  assert.equal(box.decrypt(first, 'production'), 'partner-password');
  assert.throws(
    () => box.decrypt(`${first.slice(0, -1)}${first.endsWith('A') ? 'B' : 'A'}`, 'production'),
    /medicalka_credentials_invalid/
  );
  assert.throws(() => box.decrypt(first, 'staging'), /medicalka_credentials_invalid/);
});

test('profile validation ignores arbitrary hosts and permanently forces staging observe mode', async () => {
  const Model = fakeModel();
  const clientInputs = [];
  const service = createPartnerProfileService({
    Model,
    cipher: cipher(),
    clientFactory: (input) => {
      clientInputs.push(input);
      return { getPharmacies: async () => [{ id: 'pharmacy-1', name: 'Fairhaven' }] };
    },
    now: () => new Date('2026-08-25T12:00:00.000Z'),
  });

  const summary = await service.validateAndSave({
    environment: 'staging',
    baseUrl: 'https://attacker.invalid/api/v1',
    username: 'fairhaven-staging',
    password: 'private-password',
    processingMode: 'live',
  });

  assert.equal(clientInputs[0].baseUrl, ENVIRONMENTS.staging.baseUrl);
  assert.equal(summary.baseUrl, ENVIRONMENTS.staging.baseUrl);
  assert.equal(summary.processingMode, 'observe');
  assert.equal(summary.username, 'fa•••••••••••••ng');
  assert.equal(summary.passwordConfigured, true);
  assert.equal(summary.pharmacyCount, 1);
  assert.equal(summary.lastValidatedAt.toISOString(), '2026-08-25T12:00:00.000Z');
  assert.equal('usernameCipher' in summary, false);
  assert.equal('passwordCipher' in summary, false);
  assert.equal(JSON.stringify(summary).includes('private-password'), false);
  assert.equal(Model.rows.get('staging').baseUrl, ENVIRONMENTS.staging.baseUrl);
});

test('failed validation preserves the previously working profile', async () => {
  const box = cipher();
  const previous = {
    environment: 'production',
    baseUrl: ENVIRONMENTS.production.baseUrl,
    usernameCipher: box.encrypt('working-user', 'production:username'),
    passwordCipher: box.encrypt('working-password', 'production:password'),
    processingMode: 'observe',
    active: true,
    pharmacies: [{ id: 'pharmacy-old', name: 'Old' }],
  };
  const Model = fakeModel([previous]);
  const service = createPartnerProfileService({
    Model,
    cipher: box,
    clientFactory: () => ({
      getPharmacies: async () => {
        const err = new Error('bad credentials');
        err.code = 'medicalka_unauthorized';
        throw err;
      },
    }),
  });

  await assert.rejects(
    () => service.validateAndSave({
      environment: 'production',
      username: 'broken-user',
      password: 'broken-password',
      processingMode: 'live',
    }),
    (err) => err.code === 'medicalka_profile_validation_failed'
  );

  assert.deepEqual(Model.rows.get('production'), previous);
});

test('blank password keeps stored credential and unknown environments fail closed', async () => {
  const box = cipher();
  const Model = fakeModel([{
    environment: 'production',
    baseUrl: ENVIRONMENTS.production.baseUrl,
    usernameCipher: box.encrypt('working-user', 'production:username'),
    passwordCipher: box.encrypt('working-password', 'production:password'),
    processingMode: 'observe',
    active: false,
    pharmacies: [],
  }]);
  const seen = [];
  const service = createPartnerProfileService({
    Model,
    cipher: box,
    clientFactory: (input) => {
      seen.push(input);
      return { getPharmacies: async () => [] };
    },
  });

  await service.validateAndSave({
    environment: 'production', username: '', password: '', processingMode: 'observe',
  });
  assert.equal(seen[0].username, 'working-user');
  assert.equal(seen[0].password, 'working-password');

  await assert.rejects(
    () => service.validateAndSave({
      environment: 'local', username: 'x', password: 'y', processingMode: 'observe',
    }),
    (err) => err.code === 'medicalka_invalid_environment'
  );
});
