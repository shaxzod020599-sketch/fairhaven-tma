const path = require('path');

async function backfillSoldAt({ apply = false, Model }) {
  const filter = { status: 'sold', soldAt: null };
  const eligible = await Model.countDocuments(filter);

  if (!apply) return { eligible, applied: 0, dryRun: true };

  const result = await Model.updateMany(filter, [{
    $set: { soldAt: '$updatedAt', soldAtEstimated: true },
  }]);
  return {
    eligible,
    applied: result.modifiedCount || 0,
    dryRun: false,
  };
}

async function main() {
  require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
  const { connect, disconnect } = require('../src/db');
  const ChannelOrder = require('../src/models/ChannelOrder');

  await connect();
  try {
    const report = await backfillSoldAt({
      apply: process.argv.includes('--apply'),
      Model: ChannelOrder(),
    });
    process.stdout.write(`${JSON.stringify(report)}\n`);
  } finally {
    await disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(`${err.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = { backfillSoldAt };
