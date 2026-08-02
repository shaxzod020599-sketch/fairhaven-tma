const test = require('node:test');
const assert = require('node:assert/strict');

const { backfillSoldAt } = require('../scripts/backfill-channel-sold-at');

function fakeModel(eligible = 2) {
  const calls = [];
  return {
    calls,
    countDocuments: async (filter) => {
      calls.push({ method: 'countDocuments', filter });
      return eligible;
    },
    updateMany: async (filter, update) => {
      calls.push({ method: 'updateMany', filter, update });
      return { modifiedCount: eligible };
    },
  };
}

test('soldAt backfill is report-only unless apply is explicit', async () => {
  const Model = fakeModel(3);
  const report = await backfillSoldAt({ apply: false, Model });
  assert.deepEqual(report, { eligible: 3, applied: 0, dryRun: true });
  assert.equal(Model.calls.some((call) => call.method === 'updateMany'), false);
});

test('apply snapshots updatedAt only for sold rows missing soldAt', async () => {
  const Model = fakeModel(2);
  const report = await backfillSoldAt({ apply: true, Model });
  assert.deepEqual(report, { eligible: 2, applied: 2, dryRun: false });
  const call = Model.calls.find((entry) => entry.method === 'updateMany');
  assert.deepEqual(call.filter, { status: 'sold', soldAt: null });
  assert.deepEqual(call.update, [{
    $set: { soldAt: '$updatedAt', soldAtEstimated: true },
  }]);
});
