const test = require('node:test');
const assert = require('node:assert/strict');

const { buildPath } = require('../utils/channelHub');

test('internal path builder encodes segments and query values', () => {
  assert.equal(
    buildPath(['internal', 'analytics', 'channels', 'medicalka', 'summary'], {
      search: 'OvaBoost & FertilAid', page: 2,
    }),
    '/internal/analytics/channels/medicalka/summary?search=OvaBoost+%26+FertilAid&page=2'
  );
});

test('internal path builder rejects dot traversal segments', () => {
  assert.throws(
    () => buildPath(['internal', 'analytics', '..', 'keys']),
    /channel_hub_path_segment_invalid/
  );
  assert.throws(
    () => buildPath(['internal', '.']),
    /channel_hub_path_segment_invalid/
  );
});
