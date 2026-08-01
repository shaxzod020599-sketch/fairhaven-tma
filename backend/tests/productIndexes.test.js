const assert = require('node:assert/strict');
const test = require('node:test');
const mongoose = require('mongoose');

/**
 * Database-level invariants for the product catalogue.
 *
 * These run against a real MongoDB because the property under test is enforced
 * by the index, not by JavaScript — and the first attempt at it silently did
 * nothing: the field carried `index: true` as well as an explicit
 * `schema.index()`, both auto-named `billzProductId_1`, and Mongo rejected the
 * second definition. Everything still appeared to work; the constraint just
 * was not there.
 */

let mongod;
let Product;

test.before(async () => {
  const { MongoMemoryServer } = require('mongodb-memory-server');
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { dbName: 'indexes-test' });
  Product = require('../models/Product');
  await Product.init(); // builds indexes
});

test.after(async () => {
  await mongoose.disconnect();
  await mongod?.stop();
});

const base = { name: 'Product', price: 1000, category: 'vitamins' };

test('one Billz product cannot back two cards', async () => {
  // Two cards sharing a Billz product would each sell the same stock without
  // knowing about the other. The check in the linking endpoint is a race; this
  // is the guarantee.
  await Product.create({ ...base, name: 'First', billzProductId: 'uuid-shared' });

  await assert.rejects(
    Product.create({ ...base, name: 'Second', billzProductId: 'uuid-shared' }),
    (err) => err.code === 11000,
    'a duplicate Billz link must be rejected by the database'
  );
});

test('any number of products may be unlinked', async () => {
  // The field defaults to an empty string, so a plain unique index — or a
  // sparse one — would have let the first unlinked product block every other.
  await Product.create({ ...base, name: 'Unlinked A' });
  await Product.create({ ...base, name: 'Unlinked B' });
  await Product.create({ ...base, name: 'Unlinked C', billzProductId: '' });

  const unlinked = await Product.countDocuments({ billzProductId: '' });
  assert.ok(unlinked >= 3, `expected the unlinked products to coexist, found ${unlinked}`);
});

test('the uniqueness index actually exists', async () => {
  const indexes = await Product.collection.indexes();
  const unique = indexes.find((i) => i.name === 'billzProductId_unique');

  assert.ok(unique, 'billzProductId_unique was not created');
  assert.equal(unique.unique, true);
  assert.ok(unique.partialFilterExpression, 'must be partial, or empty strings collide');
});

test('new products default to approved and automatic', async () => {
  // Introducing these fields must not change anything for products already on
  // sale, so both default to the permissive value.
  const product = await Product.create({ ...base, name: 'Defaults' });
  assert.equal(product.approved, true);
  assert.equal(product.autoStock, true);
});
