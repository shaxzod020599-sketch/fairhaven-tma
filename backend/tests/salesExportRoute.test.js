const test = require('node:test');
const assert = require('node:assert/strict');

const { createExportHandlers } = require('../controllers/salesExportController');

function request(query = {}, telegramId = 10001) {
  return { query, admin: { telegramId } };
}

function response() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    headersSent: false,
    destroyed: false,
    ended: false,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    setHeader(key, value) { this.headers[key.toLowerCase()] = value; },
    removeHeader(key) { delete this.headers[key.toLowerCase()]; },
    end() { this.ended = true; },
    destroy() { this.destroyed = true; },
  };
}

function dependencies(overrides = {}) {
  const calls = [];
  const analytics = {
    loadSourceSummary: async (source, query) => ({
      source, state: 'fresh', freshness: 'fresh', period: query,
      metrics: { grossRevenue: 100_000, returnedAmount: 0, netRevenue: 100_000 },
      generatedAt: new Date('2026-08-02T12:00:00Z'),
    }),
    loadSalesHistory: async (query) => ({
      state: 'fresh', rows: [], total: 0, page: query.page, limit: query.limit,
      period: query,
    }),
    loadBillzState: async () => ({ sales: { state: 'report_access_required' } }),
    ...overrides.analytics,
  };
  const buildSalesWorkbook = (args) => {
    calls.push(args);
    return { xlsx: { write: async () => {} } };
  };
  return { ...overrides, analytics, buildSalesWorkbook, calls };
}

test('authenticated export builds bounded workbook and download headers', async () => {
  const deps = dependencies();
  const handlers = createExportHandlers(deps);
  const res = response();
  await handlers.exportSales(request({ source: 'fairhaven.uz', preset: '7d' }), res);
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['content-type'], /spreadsheetml/);
  assert.match(res.headers['content-disposition'], /fairhaven-uz-sales/);
  assert.equal(deps.calls.length, 1);
  assert.equal(deps.calls[0].source, 'fairhaven.uz');
  assert.equal(res.ended, true);
});

test('export query preserves 90-day cap', async () => {
  const handlers = createExportHandlers(dependencies());
  const res = response();
  await handlers.exportSales(request({
    source: 'fairhaven.uz', from: '2026-01-01', to: '2026-08-01',
  }), res);
  assert.equal(res.statusCode, 422);
  assert.equal(res.body.error, 'invalid_analytics_query');
});

test('one active export per admin returns conflict and releases mutex in finally', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const deps = dependencies({
    analytics: {
      loadSalesHistory: async (query) => {
        await gate;
        return { state: 'fresh', rows: [], total: 0, page: 1, limit: query.limit, period: query };
      },
    },
  });
  const handlers = createExportHandlers(deps);
  const firstRes = response();
  const first = handlers.exportSales(request({ source: 'medicalka', preset: '7d' }), firstRes);
  await new Promise((resolve) => setImmediate(resolve));

  const secondRes = response();
  await handlers.exportSales(request({ source: 'uzum', preset: '7d' }), secondRes);
  assert.equal(secondRes.statusCode, 409);
  assert.equal(secondRes.body.error, 'export_in_progress');
  assert.equal(handlers.activeExports.size, 1);

  release();
  await first;
  const thirdRes = response();
  await handlers.exportSales(request({ source: 'uzum', preset: '7d' }), thirdRes);
  assert.equal(thirdRes.statusCode, 200);
});

test('export refuses more than 5000 rows before workbook allocation', async () => {
  const deps = dependencies({
    analytics: {
      loadSalesHistory: async (query) => ({
        state: 'fresh', rows: [], total: 5001, page: 1, limit: query.limit, period: query,
      }),
    },
  });
  const handlers = createExportHandlers(deps);
  const res = response();
  await handlers.exportSales(request({ source: 'fairhaven.uz', preset: '7d' }), res);
  assert.equal(res.statusCode, 413);
  assert.equal(res.body.error, 'sales_export_row_limit');
  assert.equal(deps.calls.length, 0);
});

test('Billz export remains closed until report normalization is verified', async () => {
  const handlers = createExportHandlers(dependencies());
  const res = response();
  await handlers.exportBillz(request({ preset: '7d' }), res);
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.error, 'billz_report_access_required');
});

test('aborted workbook stream is destroyed without writing JSON over sent headers', async () => {
  const deps = dependencies();
  deps.buildSalesWorkbook = () => ({
    xlsx: {
      write: async (res) => {
        res.headersSent = true;
        throw new Error('client aborted');
      },
    },
  });
  const handlers = createExportHandlers(deps);
  const res = response();

  await handlers.exportSales(request({ source: 'fairhaven.uz', preset: '7d' }), res);

  assert.equal(res.destroyed, true);
  assert.equal(res.body, null);
  assert.equal(handlers.activeExports.size, 0);
});

test('workbook failure before flush returns JSON without attachment headers', async () => {
  const deps = dependencies();
  deps.buildSalesWorkbook = () => ({
    xlsx: {
      write: async () => { throw new Error('write failed'); },
    },
  });
  const handlers = createExportHandlers(deps);
  const res = response();

  await handlers.exportSales(request({ source: 'fairhaven.uz', preset: '7d' }), res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { success: false, error: 'export_failed' });
  assert.equal(res.headers['content-type'], 'application/json; charset=utf-8');
  assert.equal(res.headers['content-disposition'], undefined);
});
