const ExcelJS = require('exceljs');

const MAX_SALES_ROWS = 5000;
const MAX_ITEM_ROWS = 20000;

function safeCell(value) {
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(value)) return `'${value}`;
  return value;
}

function integer(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.round(number) : 0;
}

function capError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function styleSheet(sheet) {
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF681C2C' } };
  sheet.getRow(1).alignment = { vertical: 'middle' };
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columnCount } };
}

function buildSalesWorkbook({
  source,
  summary = {},
  sales = {},
  generatedAt = new Date(),
  freshness = 'unknown',
}) {
  const rows = Array.isArray(sales.rows) ? sales.rows : [];
  if (rows.length > MAX_SALES_ROWS) {
    throw capError('sales_export_row_limit', `sales export exceeds ${MAX_SALES_ROWS} rows`);
  }
  const itemCount = rows.reduce((sum, row) => sum + (Array.isArray(row.items) ? row.items.length : 0), 0);
  if (itemCount > MAX_ITEM_ROWS) {
    throw capError('sales_export_item_limit', `sales export exceeds ${MAX_ITEM_ROWS} item rows`);
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'FairHaven Admin';
  workbook.created = new Date(generatedAt);
  workbook.properties.date1904 = false;

  const summarySheet = workbook.addWorksheet('Summary');
  summarySheet.columns = [
    { header: 'Metric', key: 'metric', width: 30 },
    { header: 'Value', key: 'value', width: 34 },
  ];
  const metadata = [
    ['Source', source || ''],
    ['Period from', sales.period?.from ? new Date(sales.period.from).toISOString() : ''],
    ['Period to', sales.period?.to ? new Date(sales.period.to).toISOString() : ''],
    ['Timezone', 'Asia/Tashkent (UTC+5)'],
    ['Generated at', new Date(generatedAt).toISOString()],
    ['Freshness', freshness],
    ['Gross revenue (UZS)', integer(summary.grossRevenue)],
    ['Returned amount (UZS)', integer(summary.returnedAmount)],
    ['Net revenue (UZS)', integer(summary.netRevenue)],
    ['Completed sales', integer(summary.completedCount)],
    ['Average check (UZS)', integer(summary.averageCheck)],
    ['Units sold', integer(summary.unitsSold)],
    ['Cancelled', integer(summary.cancelledCount)],
    ['Failed', integer(summary.failedCount)],
    ['Legacy time fallbacks', integer(summary.legacyFallbackCount)],
  ];
  for (const [metric, value] of metadata) {
    summarySheet.addRow({ metric, value: safeCell(value) });
  }
  styleSheet(summarySheet);

  const salesSheet = workbook.addWorksheet('Sales');
  salesSheet.columns = [
    { header: 'Source', key: 'source', width: 18 },
    { header: 'Occurred at', key: 'occurredAt', width: 25 },
    { header: 'Status', key: 'status', width: 15 },
    { header: 'External ID', key: 'externalId', width: 28 },
    { header: 'Internal ID', key: 'internalOrderId', width: 28 },
    { header: 'Billz order', key: 'billzOrderNumber', width: 18 },
    { header: 'Customer', key: 'customerName', width: 28 },
    { header: 'Phone (masked)', key: 'phoneMasked', width: 21 },
    { header: 'Units', key: 'itemCount', width: 10 },
    { header: 'Total (UZS)', key: 'totalAmount', width: 16 },
    { header: 'Billz state', key: 'billzState', width: 16 },
    { header: 'Legacy time', key: 'legacyTimeFallback', width: 14 },
  ];
  for (const row of rows) {
    salesSheet.addRow({
      source: safeCell(row.source || source || ''),
      occurredAt: row.occurredAt ? new Date(row.occurredAt).toISOString() : '',
      status: safeCell(row.status || ''),
      externalId: safeCell(row.externalId || ''),
      internalOrderId: safeCell(row.internalOrderId || ''),
      billzOrderNumber: safeCell(row.billzOrderNumber || ''),
      customerName: safeCell(row.customer?.name || ''),
      phoneMasked: safeCell(row.customer?.phoneMasked || ''),
      itemCount: integer(row.itemCount),
      totalAmount: integer(row.totalAmount),
      billzState: safeCell(row.billzState || ''),
      legacyTimeFallback: Boolean(row.legacyTimeFallback),
    });
  }
  styleSheet(salesSheet);
  salesSheet.getColumn('totalAmount').numFmt = '#,##0';

  const itemsSheet = workbook.addWorksheet('Items');
  itemsSheet.columns = [
    { header: 'Source', key: 'source', width: 18 },
    { header: 'Sale ID', key: 'saleId', width: 28 },
    { header: 'Occurred at', key: 'occurredAt', width: 25 },
    { header: 'Status', key: 'status', width: 15 },
    { header: 'Item', key: 'name', width: 34 },
    { header: 'Quantity', key: 'quantity', width: 12 },
    { header: 'Unit price (UZS)', key: 'unitPrice', width: 18 },
    { header: 'Amount (UZS)', key: 'amount', width: 16 },
  ];
  for (const row of rows) {
    for (const item of row.items || []) {
      itemsSheet.addRow({
        source: safeCell(row.source || source || ''),
        saleId: safeCell(row.id || row.internalOrderId || ''),
        occurredAt: row.occurredAt ? new Date(row.occurredAt).toISOString() : '',
        status: safeCell(row.status || ''),
        name: safeCell(item.name || ''),
        quantity: integer(item.quantity),
        unitPrice: integer(item.unitPrice),
        amount: integer(item.amount),
      });
    }
  }
  styleSheet(itemsSheet);
  itemsSheet.getColumn('unitPrice').numFmt = '#,##0';
  itemsSheet.getColumn('amount').numFmt = '#,##0';

  return workbook;
}

module.exports = {
  MAX_ITEM_ROWS,
  MAX_SALES_ROWS,
  buildSalesWorkbook,
  safeCell,
};
