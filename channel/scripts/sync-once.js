/**
 * One-shot catalogue sync. Useful for the first fill and for checking the
 * Billz key from the server without starting the service.
 *
 *   node scripts/sync-once.js            normal run, guard rail active
 *   node scripts/sync-once.js --force    skip the shrink guard (first fill)
 *   node scripts/sync-once.js --dry-run  fetch and report, write nothing
 */
const config = require('../src/config');
const logger = require('../src/logger');
const db = require('../src/db');
const { runCatalogSync, fetchAllProducts } = require('../src/sync/catalog');

async function main() {
  const force = process.argv.includes('--force');
  const dryRun = process.argv.includes('--dry-run');

  await db.connect();

  if (dryRun) {
    const products = await fetchAllProducts();
    const inStock = products.filter((p) =>
      (p.shop_measurement_values || []).some(
        (s) => s.shop_id === config.billz.shopId && s.active_measurement_value > 0
      )
    ).length;
    logger.info('dry run: nothing written', { fetched: products.length, inStock });
    await db.disconnect();
    return;
  }

  const result = await runCatalogSync({ force });
  await db.disconnect();
  if (!result.ok) process.exitCode = 1;
}

main().catch(async (err) => {
  logger.error('sync-once failed', { err });
  await db.disconnect().catch(() => {});
  process.exit(1);
});
