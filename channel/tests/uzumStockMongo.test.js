require('./helpers/isolatedChannelEnv');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const mongoose = require('mongoose');
const stock = require('../src/uzum/stock');

// This suite uses only an isolated local MongoDB and never downloads a binary.
process.env.MONGOMS_RUNTIME_DOWNLOAD = 'false';
const { MongoMemoryServer } = require('../../backend/node_modules/mongodb-memory-server');
let mongod;
let connection;
let Model;

function loadSource(relative, dependencies, globals = {}) {
  const filename = path.join(__dirname, relative);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, exports: module.exports,
    require: (name) => {
      if (!(name in dependencies)) throw new Error(`Unexpected dependency ${name}`);
      return dependencies[name];
    }, ...globals,
  }, { filename });
  return module.exports;
}

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  connection = await mongoose.createConnection(mongod.getUri(), { dbName: 'uzum-stock-regression' }).asPromise();
  // Keep the production schema and Mongoose intact, substituting only its
  // connection owner so no application configuration or live URI is loaded.
  const getModel = loadSource('../src/models/BillzProduct.js', {
    mongoose,
    '../db': { defineModel: (name, schema, collection) => connection.model(name, schema, collection) },
    '../uzum/stock': stock,
    '../yandex/stock': require('../src/yandex/stock'),
  });
  Model = getModel();
  await Model.init();
});
test.after(async () => {
  await connection?.close();
  await mongod?.stop();
});
test.beforeEach(async () => { await Model.deleteMany({}); });

test('Mongo pipeline upsert keeps product identity and initializes local counters', async () => {
  const at = new Date('2026-09-08T10:00:00Z');
  await Model.bulkWrite([{ updateOne: {
    filter: { billzProductId: 'new' },
    update: stock.snapshotUpdate({ name: 'New', stock: 4, deletedInBillz: false }, at, at),
    upsert: true,
  } }]);
  const row = await Model.findOne({ billzProductId: 'new' }).lean();
  assert.equal(row.billzProductId, 'new');
  assert.equal(row.stock, 4);
  assert.equal(row.reservedQty, 0);
  assert.equal(row.pendingQty, 0);
  assert.deepEqual(row.uzumSoldHolds, []);
  assert.equal(row.snapshotStartedAt.getTime(), at.getTime());
});

test('Mongo snapshot zeros only older sold holds and preserves local reservations and replay guards', async () => {
  const sale = new Date('2026-09-08T10:00:00Z');
  const fresh = new Date(sale.getTime() + 1);
  await Model.create({ billzProductId: 'held', stock: 8, reservedQty: 2, pendingQty: 1, uzumSoldHolds: [
    { orderId: 'settled', quantity: 2, soldAt: sale },
    { orderId: 'concurrent', quantity: 1, soldAt: fresh },
  ] });
  await Model.updateOne({ billzProductId: 'held' }, stock.snapshotUpdate({ stock: 6 }, fresh, fresh));
  await Model.updateOne({ billzProductId: 'held' }, stock.snapshotUpdate({ stock: 8 }, sale, new Date(fresh.getTime() + 1)));
  const row = await Model.findOne({ billzProductId: 'held' }).lean();
  assert.equal(row.stock, 6);
  assert.equal(row.reservedQty, 2);
  assert.equal(row.pendingQty, 1);
  assert.deepEqual(row.uzumSoldHolds.map((hold) => [hold.orderId, hold.quantity]), [['settled', 0], ['concurrent', 1]]);
  assert.equal(row.snapshotStartedAt.getTime(), fresh.getTime());
});

test('Mongo catalogue tombstones advance on repeated absence and resist delayed presence', async () => {
  await Model.create({ billzProductId: 'missing', stock: 2 });
  let timestamp = Date.parse('2026-09-08T10:00:00Z');
  let products = [];
  // Return real Dates: Mongoose clones Date subclasses through valueOf(),
  // turning their aggregation literals into numbers rather than BSON dates.
  function Clock(...args) { return new Date(...(args.length ? args : [timestamp])); }
  Clock.now = () => timestamp;
  const { runCatalogSync } = loadSource('../src/sync/catalog.js', {
    '../config': { billz: { pageSize: 10, shopId: 'shop' }, sync: { minCatalogRatio: 0.5 } },
    '../logger': { info() {}, error() {} },
    '../billz/client': { listProducts: async () => ({ total: products.length, products }) },
    '../models/BillzProduct': () => Model,
    '../models/SyncLog': () => ({ create: async () => ({}) }),
    '../uzum/stock': stock,
    '../yandex/stock': require('../src/yandex/stock'),
  }, { Date: Clock });
  const first = await runCatalogSync({ force: true });
  assert.equal(first.ok, true, first.error);
  assert.equal(first.markedDeleted, 1);
  const firstRow = await Model.findOne({ billzProductId: 'missing' }).lean();
  assert.equal(firstRow.deletedInBillz, true, 'first absence must persist its tombstone');
  assert.equal(firstRow.snapshotStartedAt?.getTime(), timestamp);
  timestamp += 2000;
  const newest = timestamp;
  const repeated = await runCatalogSync({ force: true });
  assert.equal(repeated.ok, true, repeated.error);
  assert.equal(repeated.markedDeleted, 0);
  timestamp -= 1000;
  products = [{ id: 'missing', name: 'Delayed', shop_measurement_values: [{ shop_id: 'shop', active_measurement_value: 10 }] }];
  const delayed = await runCatalogSync({ force: true });
  assert.equal(delayed.ok, true, delayed.error);
  const row = await Model.findOne({ billzProductId: 'missing' }).lean();
  assert.equal(row.deletedInBillz, true);
  assert.equal(row.stock, 2);
  assert.equal(row.snapshotStartedAt.getTime(), newest);
});
