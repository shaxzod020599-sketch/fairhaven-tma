const analytics = require('./salesAnalyticsController');
const { buildSalesWorkbook } = require('../services/salesWorkbook');
const { parseAnalyticsQuery } = require('../utils/analyticsQuery');

const MAX_ROWS = 5000;
const PAGE_SIZE = 100;

function codedError(code) {
  const err = new Error(code);
  err.code = code;
  return err;
}

async function collectSalesRows(sourceAnalytics, query) {
  const first = await sourceAnalytics.loadSalesHistory({ ...query, page: 1, limit: PAGE_SIZE });
  if (first.state === 'unavailable') throw codedError('sales_source_unavailable');
  const total = Number(first.total || 0);
  if (total > MAX_ROWS) throw codedError('sales_export_row_limit');

  const rows = [...(first.rows || [])];
  const pageCount = Math.ceil(total / PAGE_SIZE);
  for (let page = 2; page <= pageCount; page += 1) {
    const next = await sourceAnalytics.loadSalesHistory({ ...query, page, limit: PAGE_SIZE });
    if (next.state === 'unavailable') throw codedError('sales_source_unavailable');
    rows.push(...(next.rows || []));
  }
  return { ...first, rows, total, page: 1, limit: total || PAGE_SIZE };
}

function exportError(res, err) {
  if (res.headersSent) {
    if (typeof res.destroy === 'function') res.destroy();
    return undefined;
  }
  if (typeof res.removeHeader === 'function') res.removeHeader('Content-Disposition');
  if (typeof res.setHeader === 'function') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
  }
  if (err?.code === 'invalid_analytics_query') {
    return res.status(422).json({ success: false, error: err.code });
  }
  if (err?.code === 'sales_export_row_limit' || err?.code === 'sales_export_item_limit') {
    return res.status(413).json({ success: false, error: err.code });
  }
  if (err?.code === 'sales_source_unavailable') {
    return res.status(503).json({ success: false, error: err.code });
  }
  return res.status(500).json({ success: false, error: 'export_failed' });
}

function createExportHandlers({
  analytics: sourceAnalytics = analytics,
  buildSalesWorkbook: workbookBuilder = buildSalesWorkbook,
  activeExports = new Set(),
} = {}) {
  async function exportSales(req, res) {
    let key = null;
    let locked = false;
    try {
      const query = parseAnalyticsQuery(req.query);
      key = String(req.admin?.telegramId || 'unknown');
      if (activeExports.has(key)) {
        return res.status(409).json({ success: false, error: 'export_in_progress' });
      }
      activeExports.add(key);
      locked = true;

      const [sourceSummary, sales] = await Promise.all([
        sourceAnalytics.loadSourceSummary(query.source, query),
        collectSalesRows(sourceAnalytics, query),
      ]);
      if (sourceSummary.state === 'unavailable' || !sourceSummary.metrics) {
        throw codedError('sales_source_unavailable');
      }

      const workbook = workbookBuilder({
        source: query.source,
        summary: sourceSummary.metrics,
        sales: { ...sales, period: sales.period || sourceSummary.period },
        generatedAt: sourceSummary.generatedAt || new Date(),
        freshness: sourceSummary.freshness || sourceSummary.state,
      });
      const slug = query.source.replace(/\./g, '-');
      const date = new Date().toISOString().slice(0, 10);
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader('Content-Disposition', `attachment; filename="${slug}-sales-${date}.xlsx"`);
      res.setHeader('Cache-Control', 'no-store');
      await workbook.xlsx.write(res);
      if (typeof res.end === 'function') res.end();
    } catch (err) {
      exportError(res, err);
    } finally {
      if (locked) activeExports.delete(key);
    }
  }

  async function exportBillz(_req, res) {
    const state = await sourceAnalytics.loadBillzState();
    const error = state.sales?.state === 'report_access_required'
      ? 'billz_report_access_required'
      : state.sales?.state === 'normalization_required'
        ? 'billz_report_not_verified'
        : 'billz_report_unavailable';
    res.status(409).json({ success: false, error });
  }

  return { activeExports, exportBillz, exportSales };
}

const handlers = createExportHandlers();

module.exports = {
  collectSalesRows,
  createExportHandlers,
  exportBillz: handlers.exportBillz,
  exportSales: handlers.exportSales,
};
