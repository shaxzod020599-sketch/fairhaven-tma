/**
 * Shows — and optionally applies — what the stock reconciler would change.
 *
 *   node scripts/reconcile-stock.js           report only
 *   node scripts/reconcile-stock.js --apply   write the changes
 *
 * Run the report before enabling the scheduler on a live shop: the image rule
 * hides every product with no photo, and it is worth seeing that list before it
 * takes effect rather than after.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const { planReconcile, reconcileStock } = require('../services/stockReconciler');

const REASON_LABEL = {
  awaiting_approval: 'not approved yet',
  no_image: 'no image',
  gone_from_billz: 'gone from Billz',
  out_of_stock: 'no free stock in Billz',
  in_stock: 'in stock in Billz',
  not_linked: 'not linked to Billz (untouched)',
  manual_override: 'manual override (untouched)',
};

async function main() {
  await mongoose.connect(process.env.MONGO_URI, { dbName: 'fairhaven' });
  const plan = await planReconcile();

  console.log(`\nProducts: ${plan.total}`);
  console.log('\nHow each product is decided:');
  for (const [reason, count] of Object.entries(plan.reasons).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(count).padStart(4)}  ${REASON_LABEL[reason] || reason}`);
  }

  const hiding = plan.changes.filter((c) => !c.to);
  const showing = plan.changes.filter((c) => c.to);

  console.log(`\nWould hide ${hiding.length}, would show ${showing.length}\n`);

  for (const change of hiding) {
    console.log(`  hide  ${change.name.slice(0, 44).padEnd(46)}${REASON_LABEL[change.reason] || change.reason}`);
  }
  for (const change of showing) {
    console.log(`  show  ${change.name.slice(0, 44).padEnd(46)}${REASON_LABEL[change.reason] || change.reason}`);
  }

  if (!process.argv.includes('--apply')) {
    console.log('\nReport only. Re-run with --apply to write.\n');
    await mongoose.disconnect();
    return;
  }

  // The plan printed above, not a freshly computed one: a sync landing between
  // the report and the confirmation would otherwise apply a different list.
  const result = await reconcileStock({ plan });
  console.log(`\nApplied ${result.applied} change(s).\n`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('reconcile-stock failed:', err?.message || err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
