const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildSalesWorkbook,
  safeCell,
} = require('../services/salesWorkbook');

const summary = {
  grossRevenue: 300_000,
  returnedAmount: 50_000,
  netRevenue: 250_000,
  completedCount: 2,
  averageCheck: 150_000,
  unitsSold: 3,
  cancelledCount: 1,
  failedCount: 0,
};

const row = {
  id: 'sale-1', source: 'fairhaven.uz', externalId: 'ext-1', internalOrderId: 'int-1',
  billzOrderNumber: 'B-1', status: 'delivered', occurredAt: '2026-08-02T10:00:00Z',
  itemCount: 2, totalAmount: 300_000, billzState: 'posted', legacyTimeFallback: false,
  customer: { name: '=HYPERLINK("bad")', phoneMasked: '+998 ** *** ** 67' },
  items: [{ name: '@SUM(A1:A2)', quantity: 2, unitPrice: 150_000, amount: 300_000 }],
};

test('safeCell neutralizes every formula-leading text shape but keeps numbers numeric', () => {
  for (const value of ['=x', '+x', '-x', '@x', '\tx', '\rx']) {
    assert.equal(safeCell(value), `'${value}`);
  }
  assert.equal(safeCell(123), 123);
});

test('workbook contains Summary, Sales and Items with honest metadata and masked PII', () => {
  const workbook = buildSalesWorkbook({
    source: 'fairhaven.uz', summary, sales: { rows: [row], period: {
      from: '2026-08-01T00:00:00Z', to: '2026-08-03T00:00:00Z',
    } },
    generatedAt: '2026-08-02T12:00:00Z', freshness: 'fresh',
  });

  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ['Summary', 'Sales', 'Items']);
  const summarySheet = workbook.getWorksheet('Summary');
  const metadata = Object.fromEntries(
    [...Array(summarySheet.rowCount - 1)].map((_, index) => {
      const r = summarySheet.getRow(index + 2);
      return [r.getCell(1).value, r.getCell(2).value];
    })
  );
  assert.equal(metadata.Source, 'fairhaven.uz');
  assert.equal(metadata.Timezone, 'Asia/Tashkent (UTC+5)');
  assert.equal(metadata.Freshness, 'fresh');
  assert.equal(metadata['Gross revenue (UZS)'], 300_000);

  const sales = workbook.getWorksheet('Sales');
  assert.equal(sales.getRow(2).getCell('customerName').value.startsWith("'="), true);
  assert.equal(sales.getRow(2).getCell('phoneMasked').value, "'+998 ** *** ** 67");
  assert.equal(Number.isInteger(sales.getRow(2).getCell('totalAmount').value), true);
  assert.equal(JSON.stringify(sales.getRow(2).values).includes('private'), false);

  const items = workbook.getWorksheet('Items');
  assert.equal(items.getRow(2).getCell('name').value.startsWith("'@"), true);
  assert.equal(Number.isInteger(items.getRow(2).getCell('amount').value), true);
});

test('workbook refuses export caps instead of truncating silently', () => {
  assert.throws(
    () => buildSalesWorkbook({ source: 'medicalka', summary, sales: { rows: Array(5001).fill(row) } }),
    (err) => err.code === 'sales_export_row_limit'
  );
  assert.throws(
    () => buildSalesWorkbook({
      source: 'uzum', summary,
      sales: { rows: [{ ...row, items: Array(20001).fill(row.items[0]) }] },
    }),
    (err) => err.code === 'sales_export_item_limit'
  );
});
