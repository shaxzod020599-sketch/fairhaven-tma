const config = require('../config');
const logger = require('../logger');
const billz = require('../billz/client');
const BillzProduct = require('../models/BillzProduct');
const SyncLog = require('../models/SyncLog');

/**
 * Pulls the Billz catalogue into the local mirror.
 *
 * The mirror drives what channels see, so a bad sync is worse than no sync: if
 * a partial response were written through, products would silently go out of
 * stock on Medicalka and Uzum. Two rules protect against that:
 *
 *  1. Nothing is written until the whole catalogue has been fetched. A failure
 *     mid-way leaves the previous mirror intact.
 *  2. A run that returns far fewer products than the mirror already holds is
 *     rejected rather than applied (see SYNC_MIN_CATALOG_RATIO).
 *
 * `reservedQty` and `pendingQty` are locally owned and never touched here.
 */

function pickShopValue(list, shopId, key) {
  if (!Array.isArray(list)) return undefined;
  const row = list.find((r) => r?.shop_id === shopId);
  return row ? row[key] : undefined;
}

function toMirrorFields(product, shopId) {
  const category = Array.isArray(product.categories) ? product.categories[0] : null;
  return {
    name: product.name || '',
    sku: product.sku || '',
    barcode: product.barcode || '',
    brandName: product.brand_name || '',
    billzCategoryId: category?.id || '',
    categoryName: category?.name || '',
    measurementUnit: product.measurement_unit?.short_name || '',
    retailPrice: Number(pickShopValue(product.shop_prices, shopId, 'retail_price')) || 0,
    promoPrice: Number(pickShopValue(product.shop_prices, shopId, 'promo_price')) || 0,
    stock: Number(pickShopValue(product.shop_measurement_values, shopId, 'active_measurement_value')) || 0,
    sourceImageUrl: product.main_image_url || '',
    deletedInBillz: false,
  };
}

// A catalogue this large means something is wrong with the paging, not that
// the shop grew. Bailing out beats looping forever against a rate-limited API.
const MAX_PAGES = 500;

/**
 * Walks every page of /v2/products. Returns the complete list or throws.
 *
 * `count` is treated as a hint, not as the loop bound. When Billz omitted it —
 * or returned 0 while still sending products — deriving the page count from it
 * gave zero extra pages, and the completeness check was skipped for the same
 * reason. Page one was then accepted as the entire catalogue and everything
 * beyond it got flagged as deleted. Paging now continues until a short page
 * arrives, and `count` is only used to verify the result afterwards.
 */
async function fetchAllProducts() {
  const { pageSize } = config.billz;
  const all = [];
  let reportedTotal = 0;

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const response = await billz.listProducts({ page, limit: pageSize });
    if (page === 1) reportedTotal = response.total;
    all.push(...response.products);

    // A page shorter than the limit is the last one. An empty page ends it too,
    // which also covers a genuinely empty catalogue.
    if (response.products.length < pageSize) break;

    if (page === MAX_PAGES) {
      throw new Error(`catalogue paging exceeded ${MAX_PAGES} pages — aborting`);
    }
  }

  if (reportedTotal && all.length < reportedTotal) {
    throw new Error(`incomplete catalogue: fetched ${all.length} of ${reportedTotal}`);
  }
  return all;
}

async function applyToMirror(products, shopId) {
  const Model = BillzProduct();
  const seenIds = products.map((p) => p.id).filter(Boolean);

  const existing = await Model.find({ billzProductId: { $in: seenIds } })
    .select('billzProductId')
    .lean();
  const knownIds = new Set(existing.map((d) => d.billzProductId));

  const now = new Date();
  const operations = products
    .filter((p) => p.id)
    .map((p) => ({
      updateOne: {
        filter: { billzProductId: p.id },
        // $set only. reservedQty and pendingQty keep their stored values, and
        // $setOnInsert seeds them for genuinely new products.
        update: {
          $set: { ...toMirrorFields(p, shopId), syncedAt: now },
          $setOnInsert: { billzProductId: p.id, reservedQty: 0, pendingQty: 0 },
        },
        upsert: true,
      },
    }));

  if (operations.length) await Model.bulkWrite(operations, { ordered: false });

  // Products the mirror knows but Billz no longer returns are flagged, never
  // removed: order history and product links must survive.
  const gone = await Model.updateMany(
    { billzProductId: { $nin: seenIds }, deletedInBillz: false },
    { $set: { deletedInBillz: true, syncedAt: now } }
  );

  return {
    created: operations.length - knownIds.size,
    updated: knownIds.size,
    markedDeleted: gone.modifiedCount || 0,
  };
}

async function runCatalogSync({ force = false } = {}) {
  const startedAt = new Date();
  const shopId = config.billz.shopId;
  const Model = BillzProduct();

  try {
    const products = await fetchAllProducts();

    const mirrorCount = await Model.countDocuments({ deletedInBillz: false });
    const ratio = mirrorCount === 0 ? 1 : products.length / mirrorCount;
    if (!force && ratio < config.sync.minCatalogRatio) {
      const reason =
        `billz returned ${products.length} products but the mirror holds ${mirrorCount}; ` +
        `below the ${config.sync.minCatalogRatio} ratio guard`;
      logger.error('catalog sync rejected', { reason });
      await SyncLog().create({
        kind: 'catalog', startedAt, finishedAt: new Date(),
        ok: false, rejectedReason: reason, seen: products.length,
        durationMs: Date.now() - startedAt.getTime(),
      });
      return { ok: false, rejected: true, reason };
    }

    const counts = await applyToMirror(products, shopId);
    const durationMs = Date.now() - startedAt.getTime();

    await SyncLog().create({
      kind: 'catalog', startedAt, finishedAt: new Date(), ok: true,
      seen: products.length, ...counts, durationMs,
    });
    logger.info('catalog sync done', { seen: products.length, ...counts, durationMs });
    return { ok: true, seen: products.length, ...counts, durationMs };
  } catch (err) {
    const durationMs = Date.now() - startedAt.getTime();
    logger.error('catalog sync failed', { err, durationMs });
    await SyncLog().create({
      kind: 'catalog', startedAt, finishedAt: new Date(), ok: false,
      error: err.message, durationMs,
    }).catch(() => {});
    return { ok: false, error: err.message };
  }
}

/** Prevents an interval tick from overlapping a still-running sync. */
let running = null;

function runCatalogSyncExclusive(options) {
  if (running) return running;
  running = runCatalogSync(options).finally(() => { running = null; });
  return running;
}

function startScheduler() {
  const timer = setInterval(() => {
    runCatalogSyncExclusive().catch((err) => logger.error('scheduled sync threw', { err }));
  }, config.sync.intervalMs);
  timer.unref?.();
  logger.info('sync scheduler started', { intervalMs: config.sync.intervalMs });
  return timer;
}

module.exports = {
  runCatalogSync: runCatalogSyncExclusive,
  startScheduler,
  toMirrorFields,
  fetchAllProducts,
};
