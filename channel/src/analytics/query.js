const { DAY_MS, periodForPreset } = require('./period');

const STATUSES = new Set(['received', 'reserved', 'sold', 'cancelled', 'failed']);
const MAX_RANGE_MS = 90 * DAY_MS;
const MAX_SEARCH = 100;

function invalid(message) {
  const err = new Error(message);
  err.code = 'invalid_analytics_query';
  return err;
}

function positiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function rangeFrom(query, now) {
  if (query.from || query.to) {
    if (!query.from || !query.to) throw invalid('from and to are required together');
    const from = new Date(query.from);
    const to = new Date(query.to);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
      throw invalid('invalid analytics range');
    }
    if (to - from > MAX_RANGE_MS) throw invalid('analytics range exceeds 90 days');
    return { preset: 'custom', from, to, bucket: 'day', currentBucketPartial: false };
  }
  try {
    return periodForPreset(query.preset || '7d', now);
  } catch (err) {
    throw invalid(err.message);
  }
}

function parseChannelAnalyticsQuery(query = {}, { now = new Date() } = {}) {
  const range = rangeFrom(query, now);
  const status = String(query.status || '').trim();
  if (status && !STATUSES.has(status)) throw invalid('unsupported channel status');
  const search = String(query.search || '').trim();
  if (search.length > MAX_SEARCH) throw invalid('search exceeds 100 characters');
  return {
    ...range,
    status,
    search,
    page: positiveInt(query.page, 1),
    limit: Math.min(100, positiveInt(query.limit, 25)),
  };
}

module.exports = { MAX_RANGE_MS, STATUSES, invalid, parseChannelAnalyticsQuery };
