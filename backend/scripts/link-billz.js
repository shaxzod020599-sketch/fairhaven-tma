/**
 * Links Fairhaven product cards to Billz catalogue entries.
 *
 *   node scripts/link-billz.js              report only, writes nothing
 *   node scripts/link-billz.js --apply      write the confident matches
 *
 * Only confident matches are written. Ambiguous ones — where two Billz entries
 * score within a hair of each other, usually two pack sizes of the same product
 * — are listed for a human, because linking the wrong one sells the wrong
 * stock. Products already linked are left alone.
 *
 * Requires the Billz mirror to be populated (channel-hub sync).
 */
require('./loadEnv').loadEnv();
const mongoose = require('mongoose');
const Product = require('../models/Product');
const BillzProductView = require('../models/BillzProductView');
const { matchCatalogue, similarity } = require('../utils/billzMatch');

const APPLY = process.argv.includes('--apply');

function pad(text, width) {
  const value = String(text ?? '');
  return value.length > width ? `${value.slice(0, width - 1)}…` : value.padEnd(width);
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI, { dbName: 'fairhaven' });

  const [products, mirrors] = await Promise.all([
    Product.find({}).select('name sku barcode billzProductId').lean(),
    BillzProductView.find({ deletedInBillz: false }).lean(),
  ]);

  if (!mirrors.length) {
    console.log('The Billz mirror is empty — run channel-hub sync first.');
    await mongoose.disconnect();
    process.exitCode = 1;
    return;
  }

  const alreadyLinked = products.filter((p) => p.billzProductId).length;
  const { matched, ambiguous, unmatched } = matchCatalogue(products, mirrors);

  console.log(`\nProducts ${products.length} · already linked ${alreadyLinked} · Billz ${mirrors.length}`);
  console.log(`Confident ${matched.length} · ambiguous ${ambiguous.length} · no match ${unmatched.length}\n`);

  if (matched.length) {
    console.log('CONFIDENT — will be linked:');
    for (const m of matched) {
      console.log(`  ${pad(m.method, 8)}${pad(m.score, 7)}${pad(m.product.name, 34)} → ${m.candidate.name}`);
    }
    console.log('');
  }

  if (ambiguous.length) {
    console.log('AMBIGUOUS — link by hand in the Channels page:');
    for (const a of ambiguous) {
      console.log(`  ${pad(a.score, 7)}${pad(a.product.name, 34)} → ${a.candidate.name}`);
      if (a.rival) console.log(`  ${' '.repeat(41)}or ${a.rival.name}`);
    }
    console.log('');
  }

  if (unmatched.length) {
    console.log('NO MATCH — nothing in Billz resembles these:');
    for (const u of unmatched) {
      const best = mirrors.reduce(
        (top, m) => {
          const score = similarity(u.name, m.name);
          return score > top.score ? { score, name: m.name } : top;
        },
        { score: 0, name: '—' }
      );
      console.log(`  ${pad(u.name, 34)} closest ${best.score.toFixed(2)}  ${best.name}`);
    }
    console.log('');
  }

  if (!APPLY) {
    console.log('Report only. Re-run with --apply to write the confident matches.\n');
    await mongoose.disconnect();
    return;
  }

  if (!matched.length) {
    console.log('Nothing confident to write.\n');
    await mongoose.disconnect();
    return;
  }

  const result = await Product.bulkWrite(
    matched.map((m) => ({
      updateOne: {
        filter: { _id: m.product._id },
        update: { $set: { billzProductId: m.billzProductId } },
      },
    })),
    { ordered: false }
  );
  console.log(`Linked ${result.modifiedCount} product(s).\n`);

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('link-billz failed:', err?.message || err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
