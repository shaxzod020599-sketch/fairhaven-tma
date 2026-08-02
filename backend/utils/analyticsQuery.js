const DAY_MS = 24 * 60 * 60 * 1000;
const OFFSET_MS = 5 * 60 * 60 * 1000;
const MAX_RANGE_MS = 90 * DAY_MS;
const SOURCES = new Set(['fairhaven.uz', 'medicalka', 'uzum']);
const STATUS_BY_SOURCE = Object.freeze({
  'fairhaven.uz': new Set(['pending', 'confirmed', 'preparing', 'delivering', 'delivered', 'cancelled', 'returned']),
  medicalka: new Set(['received', 'reserved', 'sold', 'cancelled', 'failed']),
  uzum: new Set(['received', 'reserved', 'sold', 'cancelled', 'failed']),
});

function invalid(message) {
  const err = new Error(message);
  err.code = 'invalid_analytics_query';
  return err;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function positiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function presetRange(preset, now) {
  const days = { '1d': 1, '7d': 7, '30d': 30 }[preset];
  if (!days) throw invalid('unsupported analytics preset');
  const to = new Date(now);
  const shifted = new Date(to.getTime() + OFFSET_MS);
  const midnight = Date.UTC(
    shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()
  ) - OFFSET_MS;
  return {
    preset,
    from: new Date(midnight - (days - 1) * DAY_MS),
    to,
    bucket: preset === '1d' ? 'hour' : 'day',
    currentBucketPartial: preset === '1d',
  };
}

function parseRange(query, now) {
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
  return presetRange(String(query.preset || '7d'), now);
}

function parseAnalyticsQuery(query = {}, { now = new Date() } = {}) {
  const source = String(query.source || 'fairhaven.uz').trim().toLowerCase();
  if (!SOURCES.has(source)) throw invalid('unsupported analytics source');
  const status = String(query.status || '').trim();
  if (status && !STATUS_BY_SOURCE[source].has(status)) throw invalid('unsupported source status');
  const search = String(query.search || '').trim();
  if (search.length > 100) throw invalid('search exceeds 100 characters');
  return {
    source,
    ...parseRange(query, now),
    status,
    search,
    page: positiveInt(query.page, 1),
    limit: Math.min(100, positiveInt(query.limit, 25)),
  };
}

module.exports = {
  MAX_RANGE_MS,
  SOURCES,
  STATUS_BY_SOURCE,
  escapeRegex,
  invalid,
  parseAnalyticsQuery,
};
