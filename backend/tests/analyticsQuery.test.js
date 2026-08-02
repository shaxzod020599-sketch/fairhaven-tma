const test = require('node:test');
const assert = require('node:assert/strict');

const { parseAnalyticsQuery, escapeRegex } = require('../utils/analyticsQuery');

const NOW = new Date('2026-08-02T12:34:56.000Z');

test('admin query normalizes source, paging and search', () => {
  const parsed = parseAnalyticsQuery({
    source: 'fairhaven.uz', preset: '30d', status: 'delivered',
    search: '  +998 (90)  ', page: '-2', limit: '250',
  }, { now: NOW });
  assert.equal(parsed.source, 'fairhaven.uz');
  assert.equal(parsed.status, 'delivered');
  assert.equal(parsed.search, '+998 (90)');
  assert.equal(parsed.page, 1);
  assert.equal(parsed.limit, 100);
  assert.equal(escapeRegex('a+b(c)'), 'a\\+b\\(c\\)');
});

test('admin query rejects unknown source and source-specific status', () => {
  assert.throws(
    () => parseAnalyticsQuery({ source: 'shop', preset: '7d' }, { now: NOW }),
    (err) => err.code === 'invalid_analytics_query'
  );
  assert.throws(
    () => parseAnalyticsQuery({ source: 'medicalka', preset: '7d', status: 'delivered' }, { now: NOW }),
    (err) => err.code === 'invalid_analytics_query'
  );
});

test('admin direct range rejects invalid order and more than 90 days', () => {
  assert.throws(
    () => parseAnalyticsQuery({
      source: 'uzum', from: '2026-08-02T00:00:00Z', to: '2026-08-01T00:00:00Z',
    }, { now: NOW }),
    (err) => err.code === 'invalid_analytics_query'
  );
  assert.throws(
    () => parseAnalyticsQuery({
      source: 'uzum', from: '2026-01-01T00:00:00Z', to: '2026-08-01T00:00:00Z',
    }, { now: NOW }),
    (err) => err.code === 'invalid_analytics_query'
  );
});
