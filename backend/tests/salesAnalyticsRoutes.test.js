const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');
const ExcelJS = require('exceljs');

process.env.NODE_ENV = 'test';
process.env.ADMIN_ORIGIN = 'https://admin.fairhaven.uz';
process.env.ADMIN_CSRF_SECRET = 'route-test-admin-csrf-secret-123456789';
process.env.DISABLE_RATE_LIMIT = 'true';
process.env.CHANNEL_INTERNAL_TOKEN = 'route-test-internal-token-123456789';

let mongod;
let appServer;
let hubServer;
let base;
let hubCalls;
let Order;
let User;
let AdminSession;
let sessionCookie;

function hubApp() {
  const app = express();
  app.use((req, res, next) => {
    hubCalls.push({ path: req.path, query: req.query, token: req.get('x-internal-token') });
    next();
  });
  app.get('/internal/analytics/channels/:channel/summary', (req, res) => res.json({
    channel: req.params.channel,
    period: { preset: req.query.preset, from: req.query.from, to: req.query.to },
    summary: {
      grossRevenue: 300_000, returnedAmount: 0, completedCount: 2,
      averageCheck: 150_000, unitsSold: 3, cancelledCount: 1, failedCount: 0,
    },
    generatedAt: '2026-08-02T12:00:00.000Z',
  }));
  app.get('/internal/analytics/channels/:channel/sales', (req, res) => res.json({
    channel: req.params.channel, rows: [], total: 0,
    page: Number(req.query.page), limit: Number(req.query.limit),
    period: { preset: req.query.preset }, generatedAt: '2026-08-02T12:00:00.000Z',
  }));
  app.get('/internal/analytics/billz/inventory', (_req, res) => res.json({
    inventory: { sellableUnits: 42, freshness: 'fresh', syncedAt: '2026-08-02T11:59:00Z' },
    generatedAt: '2026-08-02T12:00:00Z',
  }));
  app.get('/internal/analytics/billz/capability', (_req, res) => res.json({
    state: 'report_access_required', checkedAt: '2026-08-02T12:00:00Z',
    reason: 'billz_report_permission_denied',
  }));
  return app;
}

test.before(async () => {
  const { MongoMemoryServer } = require('mongodb-memory-server');
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { dbName: 'sales-routes-test' });

  hubCalls = [];
  hubServer = hubApp().listen(0, '127.0.0.1');
  await new Promise((resolve) => hubServer.once('listening', resolve));
  process.env.CHANNEL_HUB_URL = `http://127.0.0.1:${hubServer.address().port}`;

  Order = require('../models/Order');
  User = require('../models/User');
  AdminSession = require('../models/AdminSession');

  const app = express();
  app.set('trust proxy', 'loopback');
  app.use(cookieParser());
  app.use(express.json());
  app.use('/api/admin', require('../routes/adminRoutes'));
  appServer = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => appServer.once('listening', resolve));
  base = `http://127.0.0.1:${appServer.address().port}`;
});

test.after(async () => {
  appServer?.close();
  hubServer?.close();
  await mongoose.disconnect();
  await mongod.stop();
});

test.beforeEach(async () => {
  hubCalls.length = 0;
  await Promise.all([Order.deleteMany({}), User.deleteMany({}), AdminSession.deleteMany({})]);
  await User.create({ telegramId: 10001, firstName: 'Admin', role: 'admin' });
  const raw = crypto.randomBytes(32).toString('base64url');
  await AdminSession.create({
    tokenHash: crypto.createHash('sha256').update(raw).digest('hex'),
    adminTelegramId: 10001,
    host: 'admin.fairhaven.uz',
    lastSeenAt: new Date(),
    expiresAt: new Date(Date.now() + 3_600_000),
  });
  sessionCookie = `fh_admin_session_dev=${raw}`;
});

async function call(path, { cookie = sessionCookie, host = 'admin.fairhaven.uz' } = {}) {
  const res = await fetch(`${base}${path}`, {
    headers: { 'X-Forwarded-Host': host, ...(cookie ? { Cookie: cookie } : {}) },
  });
  return { status: res.status, body: await res.json() };
}

test('sales routes stay behind exact admin host and session middleware', async () => {
  const wrongHost = await call('/api/admin/sales/summary?source=fairhaven.uz&preset=7d', { host: 'fairhaven.uz' });
  assert.equal(wrongHost.status, 421);
  const noSession = await call('/api/admin/sales/summary?source=fairhaven.uz&preset=7d', { cookie: '' });
  assert.equal(noSession.status, 401);
});

test('fairhaven.uz summary uses local delivery history and source allowlist', async () => {
  await Order.create({
    items: [{ productId: new mongoose.Types.ObjectId(), name: 'OvaBoost', price: 100_000, quantity: 1 }],
    totalAmount: 100_000, status: 'delivered',
    statusHistory: [{ status: 'delivered', at: new Date() }],
  });
  const valid = await call('/api/admin/sales/summary?source=fairhaven.uz&preset=7d');
  assert.equal(valid.status, 200);
  assert.equal(valid.body.data.source, 'fairhaven.uz');
  assert.equal(valid.body.data.metrics.grossRevenue, 100_000);

  const invalid = await call('/api/admin/sales/summary?source=magazine&preset=7d');
  assert.equal(invalid.status, 422);
  assert.equal(invalid.body.error, 'invalid_analytics_query');
});

test('Medicalka response is normalized and query is built from validated fields', async () => {
  const result = await call('/api/admin/sales/summary?source=medicalka&preset=7d');
  assert.equal(result.status, 200);
  assert.equal(result.body.data.source, 'medicalka');
  assert.equal(result.body.data.metrics.netRevenue, 300_000);
  assert.equal(result.body.data.state, 'fresh');
  const upstream = hubCalls.find((entry) => entry.path.endsWith('/medicalka/summary'));
  assert.equal(upstream.query.preset, '7d');
  assert.equal(upstream.token, process.env.CHANNEL_INTERNAL_TOKEN);
});

test('Billz endpoints expose inventory and honest report-access state', async () => {
  const summary = await call('/api/admin/billz/summary?preset=7d');
  assert.equal(summary.status, 200);
  assert.equal(summary.body.data.inventory.sellableUnits, 42);
  assert.equal(summary.body.data.sales.state, 'report_access_required');

  const history = await call('/api/admin/billz/history?preset=7d');
  assert.equal(history.status, 200);
  assert.equal(history.body.data.state, 'report_access_required');
  assert.deepEqual(history.body.data.rows, []);
});

test('authenticated Excel download contains masked customer data only', async () => {
  await Order.create({
    items: [{ productId: new mongoose.Types.ObjectId(), name: '=Danger', price: 100_000, quantity: 1 }],
    totalAmount: 100_000, status: 'delivered',
    statusHistory: [{ status: 'delivered', at: new Date() }],
    customerName: '=Formula', customerPhone: '+998901234567',
    location: { lat: 1, lng: 1, addressString: 'raw private address' },
  });
  const response = await fetch(`${base}/api/admin/sales/export?source=fairhaven.uz&preset=7d`, {
    headers: { 'X-Forwarded-Host': 'admin.fairhaven.uz', Cookie: sessionCookie },
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /spreadsheetml/);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(await response.arrayBuffer()));
  const sales = workbook.getWorksheet('Sales');
  assert.equal(sales.getRow(2).getCell(7).value, "'=Formula");
  assert.equal(sales.getRow(2).getCell(8).value, "'+998 ** *** ** 67");
  assert.equal(JSON.stringify(sales.getRow(2).values).includes('raw private'), false);
});
