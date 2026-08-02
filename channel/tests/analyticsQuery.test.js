const test = require('node:test');
const assert = require('node:assert/strict');

const { parseChannelAnalyticsQuery } = require('../src/analytics/query');

const NOW = new Date('2026-08-02T12:34:56.000Z');

test('channel query accepts bounded presets and channel statuses', () => {
  const parsed = parseChannelAnalyticsQuery({
    preset: '7d', status: 'sold', search: '  OvaBoost  ', page: '2', limit: '500',
  }, { now: NOW });
  assert.equal(parsed.preset, '7d');
  assert.equal(parsed.status, 'sold');
  assert.equal(parsed.search, 'OvaBoost');
  assert.equal(parsed.page, 2);
  assert.equal(parsed.limit, 100);
});

test('channel query rejects unsupported status and oversized search', () => {
  assert.throws(
    () => parseChannelAnalyticsQuery({ preset: '7d', status: 'delivered' }, { now: NOW }),
    (err) => err.code === 'invalid_analytics_query'
  );
  assert.throws(
    () => parseChannelAnalyticsQuery({ preset: '7d', search: 'x'.repeat(101) }, { now: NOW }),
    (err) => err.code === 'invalid_analytics_query'
  );
});

test('direct range is accepted up to 90 days and remains half-open', () => {
  const parsed = parseChannelAnalyticsQuery({
    from: '2026-07-01T00:00:00.000Z',
    to: '2026-08-01T00:00:00.000Z',
  }, { now: NOW });
  assert.equal(parsed.from.toISOString(), '2026-07-01T00:00:00.000Z');
  assert.equal(parsed.to.toISOString(), '2026-08-01T00:00:00.000Z');
});

test('direct range over 90 days is rejected', () => {
  assert.throws(
    () => parseChannelAnalyticsQuery({
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-08-01T00:00:00.000Z',
    }, { now: NOW }),
    (err) => err.code === 'invalid_analytics_query'
  );
});
