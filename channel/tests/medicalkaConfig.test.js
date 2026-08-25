const assert = require('node:assert/strict');
const test = require('node:test');

process.env.MONGO_URI = 'mongodb://127.0.0.1:27017';
process.env.BILLZ_SECRET_TOKEN = 'test-secret';
process.env.BILLZ_SHOP_ID = 'shop-a';
process.env.MEDICALKA_USERNAME = 'legacy-user';
process.env.MEDICALKA_PASSWORD = 'legacy-password';
delete process.env.MEDICALKA_PARTNER_USERNAME;
delete process.env.MEDICALKA_PARTNER_PASSWORD;

test('partner login accepts existing Medicalka credential variable names', () => {
  const config = require('../src/config');
  assert.equal(config.medicalkaPartner.username, 'legacy-user');
  assert.equal(config.medicalkaPartner.password, 'legacy-password');
});

test('observe polling can run with Billz disabled and legacy callbacks still enabled', () => {
  const config = require('../src/config');
  const { checkMedicalkaPartnerConfig } = require('../src/medicalka/configGuard');
  Object.assign(config.medicalkaPartner, {
    enabled: true,
    subOrdersEnabled: true,
    legacyOrdersEnabled: true,
    username: 'user',
    password: 'password',
  });
  config.billzWriteEnabled = false;

  assert.doesNotThrow(() => checkMedicalkaPartnerConfig(config));
});

test('encrypted partner profiles can replace plaintext startup credentials', () => {
  const config = require('../src/config');
  const { checkMedicalkaPartnerConfig } = require('../src/medicalka/configGuard');
  Object.assign(config.medicalkaPartner, {
    enabled: true,
    username: '',
    password: '',
    credentialsEncryptionKey: '0123456789abcdef0123456789abcdef',
  });

  assert.doesNotThrow(() => checkMedicalkaPartnerConfig(config));
});

test('inbound startup still rejects missing plaintext credentials without encrypted profiles', () => {
  const config = require('../src/config');
  const { checkMedicalkaPartnerConfig } = require('../src/medicalka/configGuard');
  Object.assign(config.medicalkaPartner, {
    enabled: true,
    username: '',
    password: '',
    credentialsEncryptionKey: '',
  });

  assert.throws(
    () => checkMedicalkaPartnerConfig(config),
    /MEDICALKA_PARTNER_USERNAME, MEDICALKA_PARTNER_PASSWORD/,
  );
});
