const {
  listFairhavenSales,
  summarizeFairhavenSales,
} = require('../services/salesAnalytics');
const { parseAnalyticsQuery } = require('../utils/analyticsQuery');
const channelHub = require('../utils/channelHub');

function periodShape(query) {
  return {
    preset: query.preset,
    from: query.from,
    to: query.to,
    bucket: query.bucket,
    currentBucketPartial: query.currentBucketPartial,
  };
}

function upstreamQuery(query, { history = false } = {}) {
  const range = query.preset === 'custom'
    ? { from: query.from, to: query.to }
    : { preset: query.preset };
  return history
    ? { ...range, status: query.status, search: query.search, page: query.page, limit: query.limit }
    : range;
}

function normalizeMetrics(summary = {}) {
  const grossRevenue = Number(summary.grossRevenue || 0);
  const returnedAmount = Number(summary.returnedAmount || 0);
  return {
    grossRevenue,
    returnedAmount,
    netRevenue: summary.netRevenue === undefined
      ? grossRevenue - returnedAmount
      : Number(summary.netRevenue || 0),
    completedCount: Number(summary.completedCount || 0),
    averageCheck: Number(summary.averageCheck || 0),
    unitsSold: Number(summary.unitsSold || 0),
    cancelledCount: Number(summary.cancelledCount || 0),
    failedCount: Number(summary.failedCount || 0),
    legacyFallbackCount: Number(summary.legacyFallbackCount || 0),
  };
}

function unavailableSource(source, query) {
  return {
    source,
    state: 'unavailable',
    freshness: 'unavailable',
    period: periodShape(query),
    metrics: null,
    generatedAt: new Date(),
  };
}

async function loadSourceSummary(source, query) {
  if (source === 'fairhaven.uz') {
    const summary = await summarizeFairhavenSales({ from: query.from, to: query.to });
    return {
      source,
      state: 'fresh',
      freshness: 'fresh',
      period: periodShape(query),
      metrics: normalizeMetrics(summary),
      generatedAt: new Date(),
    };
  }

  try {
    const result = await channelHub.requestInternal(
      'GET',
      ['internal', 'analytics', 'channels', source, 'summary'],
      { query: upstreamQuery(query) }
    );
    if (!result.ok || !result.body?.summary) return unavailableSource(source, query);
    return {
      source,
      state: 'fresh',
      freshness: 'fresh',
      period: result.body.period || periodShape(query),
      metrics: normalizeMetrics(result.body.summary),
      generatedAt: result.body.generatedAt || new Date(),
    };
  } catch (_) {
    return unavailableSource(source, query);
  }
}

async function loadSalesHistory(query) {
  if (query.source === 'fairhaven.uz') {
    const result = await listFairhavenSales({
      from: query.from,
      to: query.to,
      status: query.status,
      search: query.search,
      page: query.page,
      limit: query.limit,
    });
    return {
      source: query.source,
      state: 'fresh',
      freshness: 'fresh',
      period: periodShape(query),
      ...result,
      generatedAt: new Date(),
    };
  }

  try {
    const result = await channelHub.requestInternal(
      'GET',
      ['internal', 'analytics', 'channels', query.source, 'sales'],
      { query: upstreamQuery(query, { history: true }) }
    );
    if (!result.ok || !Array.isArray(result.body?.rows)) throw new Error('unavailable');
    return {
      source: query.source,
      state: 'fresh',
      freshness: 'fresh',
      period: result.body.period || periodShape(query),
      rows: result.body.rows,
      total: Number(result.body.total || 0),
      page: Number(result.body.page || query.page),
      limit: Number(result.body.limit || query.limit),
      generatedAt: result.body.generatedAt || new Date(),
    };
  } catch (_) {
    return {
      source: query.source,
      state: 'unavailable',
      freshness: 'unavailable',
      period: periodShape(query),
      rows: [],
      total: 0,
      page: query.page,
      limit: query.limit,
      generatedAt: new Date(),
    };
  }
}

async function hubRead(segments, query) {
  try {
    const result = await channelHub.requestInternal('GET', segments, { query });
    return result.ok ? result.body : null;
  } catch (_) {
    return null;
  }
}

async function loadBillzState({ force = false } = {}) {
  const [inventoryPayload, capabilityPayload] = await Promise.all([
    hubRead(['internal', 'analytics', 'billz', 'inventory']),
    hubRead(['internal', 'analytics', 'billz', 'capability'], force ? { force: true } : {}),
  ]);
  const capability = capabilityPayload || {
    state: 'unavailable', reason: 'channel_hub_unavailable', checkedAt: new Date(),
  };
  const salesState = capability.state === 'available'
    ? 'normalization_required'
    : capability.state;
  return {
    source: 'billz',
    state: inventoryPayload?.inventory ? inventoryPayload.inventory.freshness : 'unavailable',
    inventory: inventoryPayload?.inventory || null,
    capability,
    sales: {
      state: salesState,
      grossRevenue: null,
      returnedAmount: null,
      netRevenue: null,
      checks: null,
    },
    warning: salesState === 'report_access_required'
      ? 'Billz пока не разрешил читать отчёт о продажах. Попросите менеджера Billz открыть доступ к отчётам — после этого выручка появится здесь.'
      : salesState === 'normalization_required'
        ? 'Мы проверяем формат отчёта Billz. Пока проверка не закончена, выручку не показываем, чтобы не ввести вас в заблуждение.'
        : 'Отчёт о продажах Billz сейчас недоступен. Остатки товаров при этом продолжают обновляться.',
    generatedAt: inventoryPayload?.generatedAt || new Date(),
  };
}

function handleError(res, err) {
  if (err?.code === 'invalid_analytics_query') {
    return res.status(422).json({ success: false, error: err.code });
  }
  return res.status(500).json({ success: false, error: 'internal_error' });
}

exports.summary = async (req, res) => {
  try {
    const query = parseAnalyticsQuery(req.query);
    res.json({ success: true, data: await loadSourceSummary(query.source, query) });
  } catch (err) {
    handleError(res, err);
  }
};

exports.history = async (req, res) => {
  try {
    const query = parseAnalyticsQuery(req.query);
    res.json({ success: true, data: await loadSalesHistory(query) });
  } catch (err) {
    handleError(res, err);
  }
};

exports.billzSummary = async (_req, res) => {
  res.json({ success: true, data: await loadBillzState() });
};

exports.billzHistory = async (_req, res) => {
  const billz = await loadBillzState();
  res.json({
    success: true,
    data: {
      source: 'billz',
      state: billz.sales.state,
      rows: [],
      total: 0,
      page: 1,
      limit: 25,
      warning: billz.warning,
      generatedAt: billz.generatedAt,
    },
  });
};

exports.loadBillzState = loadBillzState;
exports.loadSalesHistory = loadSalesHistory;
exports.loadSourceSummary = loadSourceSummary;
exports.normalizeMetrics = normalizeMetrics;
