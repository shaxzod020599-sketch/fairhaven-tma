const test = require('node:test');
const assert = require('node:assert/strict');

const { periodForPreset, inHalfOpenRange } = require('../src/analytics/period');

const NOW = new Date('2026-08-02T12:34:56.000Z');

test('today starts at Tashkent midnight regardless of process timezone', () => {
  const period = periodForPreset('1d', NOW);
  assert.equal(period.from.toISOString(), '2026-08-01T19:00:00.000Z');
  assert.equal(period.to.toISOString(), NOW.toISOString());
  assert.equal(period.bucket, 'hour');
  assert.equal(period.currentBucketPartial, true);
});

test('7d and 30d are Tashkent calendar periods including today', () => {
  assert.equal(
    periodForPreset('7d', NOW).from.toISOString(),
    '2026-07-26T19:00:00.000Z'
  );
  assert.equal(
    periodForPreset('30d', NOW).from.toISOString(),
    '2026-07-03T19:00:00.000Z'
  );
  assert.equal(periodForPreset('7d', NOW).bucket, 'day');
});

test('range membership is half-open', () => {
  const { from, to } = periodForPreset('1d', NOW);
  assert.equal(inHalfOpenRange(from, from, to), true);
  assert.equal(inHalfOpenRange(new Date(to.getTime() - 1), from, to), true);
  assert.equal(inHalfOpenRange(to, from, to), false);
});

test('unknown preset is rejected', () => {
  assert.throws(() => periodForPreset('90d', NOW), /invalid analytics preset/);
});
