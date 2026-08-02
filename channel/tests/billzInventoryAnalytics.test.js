const test = require('node:test');
const assert = require('node:assert/strict');

process.env.BILLZ_SECRET_TOKEN = 'test-secret';
process.env.BILLZ_SHOP_ID = 'shop-a';
process.env.MONGO_DB_NAME = 'billz-inventory-analytics-test';

let mongod;
let db;
let BillzProduct;
let SyncLog;
let summarizeInventory;

test.before(async () => {
  const { MongoMemoryServer } = require(
    '/Users/tm/Projects/project vitamin delivery/backend/node_modules/mongodb-memory-server'
  );
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();
  db = require('../src/db');
  await db.connect();
  BillzProduct = require('../src/models/BillzProduct');
  SyncLog = require('../src/models/SyncLog');
  ({ summarizeInventory } = require('../src/analytics/billzInventory'));
});

test.after(async () => {
  await db?.disconnect();
  await mongod?.stop();
});

test.beforeEach(async () => {
  await Promise.all([BillzProduct().deleteMany({}), SyncLog().deleteMany({})]);
});

test('inventory uses non-negative sellable stock and excludes deleted products', async () => {
  const now = new Date('2026-08-02T12:00:00.000Z');
  await BillzProduct().create([
    { billzProductId: 'a', name: 'Alpha', stock: 10, reservedQty: 3, pendingQty: 2, retailPrice: 1000 },
    { billzProductId: 'b', name: 'Beta', stock: 2, reservedQty: 4, pendingQty: 1, retailPrice: 5000 },
    { billzProductId: 'c', name: 'Charlie', stock: 5, reservedQty: 0, pendingQty: 0, retailPrice: 2000 },
    { billzProductId: 'deleted', name: 'Gone', stock: 999, retailPrice: 999, deletedInBillz: true },
  ]);
  await SyncLog().create({
    kind: 'catalog', startedAt: now, finishedAt: now, ok: true, seen: 4,
  });

  const result = await summarizeInventory({
    ProductModel: BillzProduct(), SyncLogModel: SyncLog(), lowStockThreshold: 5,
    now, expectedIntervalMs: 5 * 60 * 1000,
  });

  assert.deepEqual(result, {
    physicalUnits: 17,
    reservedUnits: 7,
    pendingUnits: 3,
    sellableUnits: 10,
    estimatedRetailValue: 15_000,
    skuCount: 3,
    zeroStockSkuCount: 1,
    lowStockSkuCount: 3,
    lowStock: [
      { billzProductId: 'b', name: 'Beta', sellableUnits: 0 },
      { billzProductId: 'a', name: 'Alpha', sellableUnits: 5 },
      { billzProductId: 'c', name: 'Charlie', sellableUnits: 5 },
    ],
    syncedAt: now,
    freshness: 'fresh',
  });
});

test('inventory freshness is stale after a failed or old sync and unavailable without snapshot', async () => {
  const now = new Date('2026-08-02T12:00:00.000Z');
  const old = new Date('2026-08-02T10:00:00.000Z');
  await SyncLog().create({ kind: 'catalog', startedAt: old, finishedAt: old, ok: true });
  await SyncLog().create({ kind: 'catalog', startedAt: now, finishedAt: now, ok: false, error: 'timeout' });

  const stale = await summarizeInventory({
    ProductModel: BillzProduct(), SyncLogModel: SyncLog(), lowStockThreshold: 5,
    now, expectedIntervalMs: 5 * 60 * 1000,
  });
  assert.equal(stale.freshness, 'stale');
  assert.equal(stale.syncedAt.toISOString(), old.toISOString());

  await SyncLog().deleteMany({});
  const unavailable = await summarizeInventory({
    ProductModel: BillzProduct(), SyncLogModel: SyncLog(), lowStockThreshold: 5, now,
  });
  assert.equal(unavailable.freshness, 'unavailable');
  assert.equal(unavailable.syncedAt, null);
});
