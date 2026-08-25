const assert = require('node:assert/strict');
const test = require('node:test');
const mongoose = require('mongoose');

process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017';
process.env.BILLZ_SECRET_TOKEN = process.env.BILLZ_SECRET_TOKEN || 'test-secret';
process.env.BILLZ_SHOP_ID = process.env.BILLZ_SHOP_ID || 'shop-a';

const db = require('../src/db');

test('refuses to define a model on a collection the bot backend owns', () => {
  // The collections that hold live customer and catalogue data.
  for (const collection of ['products', 'orders', 'users', 'settings', 'sitecontents']) {
    assert.throws(
      () => db.defineModel('Whatever', new mongoose.Schema({}), collection),
      /owned by the bot backend/,
      `expected "${collection}" to be refused`
    );
  }
});

test('the writable-collection list stays limited to this service', () => {
  // Growing this list is a deliberate act. If this assertion fails, check that
  // the new collection is genuinely owned here and not by the bot backend.
  assert.deepEqual(
    [...db.OWNED_COLLECTIONS].sort(),
    [
      'billzproducts', 'billztokens', 'channelcounters', 'channelkeys', 'channelorders',
      'medicalkaapprovals', 'medicalkapartnerprofiles', 'medicalkasuborders', 'synclogs',
    ]
  );
});

test('bot-owned collections are readable but never writable', () => {
  assert.deepEqual([...db.READABLE_COLLECTIONS].sort(), ['products', 'settings', 'users']);

  // Read access must not become a back door to writing.
  for (const collection of db.READABLE_COLLECTIONS) {
    assert.equal(db.OWNED_COLLECTIONS.has(collection), false,
      `"${collection}" must not be writable`);
  }
  for (const method of db.READ_METHODS) {
    assert.equal(/^(update|delete|remove|insert|save|replace|bulk|create)/i.test(method), false,
      `"${method}" is not a read method`);
  }
});

test('a collection with no declared access is refused for reads too', () => {
  assert.throws(
    () => db.defineReadModel('Orders', new mongoose.Schema({}), 'orders'),
    /no read access/
  );
});

test('billz client refuses write verbs while BILLZ_WRITE_ENABLED is off', async () => {
  process.env.BILLZ_WRITE_ENABLED = 'false';
  const billz = require('../src/billz/client');

  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    await assert.rejects(
      billz.request(method, '/v2/order', { body: {} }),
      /BILLZ_WRITE_ENABLED is off/,
      `expected ${method} to be refused`
    );
  }
});

test('logger masks anything that looks like a credential', () => {
  const logger = require('../src/logger');

  const redacted = logger.redact({
    secret_token: 'dda6bb3d45736e77453efd35ac95c255b257a79e',
    accessToken: 'eyJhbGciOiJIUzI1NiJ9.payload.signature',
    authorization: 'Bearer abcdefghijklmnop',
    shopId: 'd25689cf-cefa-470e-9a54-6b2f9ea0fb0f',
    nested: { apiKey: 'super-secret-value-here', name: 'FAIRHAVEN' },
  });

  assert.equal(redacted.secret_token.includes('45736e77'), false);
  assert.equal(redacted.accessToken.includes('payload'), false);
  assert.equal(redacted.authorization.includes('abcdefgh'), false);
  assert.equal(redacted.nested.apiKey.includes('secret-value'), false);
  // Non-secret fields stay readable, otherwise logs are useless.
  assert.equal(redacted.shopId, 'd25689cf-cefa-470e-9a54-6b2f9ea0fb0f');
  assert.equal(redacted.nested.name, 'FAIRHAVEN');
});
