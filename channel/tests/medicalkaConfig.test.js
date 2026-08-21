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
