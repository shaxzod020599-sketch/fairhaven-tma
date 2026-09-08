const Product = require('../models/Product');
const BillzProductView = require('../models/BillzProductView');

/**
 * Keeps `isAvailable` correct on its own.
 *
 * Every read path in the app — the mini app catalogue, the bot, the public
 * site, collections, popular products — already filters on `isAvailable`. So
 * rather than teaching each of them about Billz, this keeps that one field
 * true and everything downstream stays correct without changing.
 *
 * Rules, in order:
 *
 *   1. No image                  -> hidden, always. Overrides everything below,
 *                                   including a manual decision: a product with
 *                                   no photo is not out of stock, it is
 *                                   incomplete, and the fix is to add a photo.
 *   2. Not approved yet          -> hidden. New products wait for an operator.
 *   3. Set by hand               -> left alone. An operator marking something
 *                                   in or out of stock outranks Billz.
 *   4. Linked to Billz           -> follows Billz stock minus reservations and sold holds.
 *   5. Linked but gone from Billz-> hidden, never deleted. Order history and
 *                                   the link survive so it returns by itself
 *                                   if Billz gets it back.
 *   6. Not linked at all         -> left exactly as the operator set it.
 *
 * Rules 3 and 6 are what let the shop sell things Billz does not carry. Plenty
 * of the catalogue — nursing pads, test strips, accessories — has no Billz
 * counterpart at all, and those products are managed by hand. "Out of stock
 * when it is not in Billz" means a product that *was* there and disappeared,
 * not one that was never linked.
 *
 * Rule 1 sits above the manual override on purpose. The two are answering
 * different questions: availability is the operator's call, having a usable
 * product card is not.
 */

function hasImage(product) {
  if (product.imageUrl && String(product.imageUrl).trim()) return true;
  return Array.isArray(product.images) && product.images.some((u) => u && String(u).trim());
}

function availableQuantity(mirror) {
  if (!mirror) return 0;
  const sold = [...(mirror.uzumSoldHolds || []), ...(mirror.yandexSoldHolds || [])]
    .reduce((sum, hold) => sum + (Number(hold.quantity) || 0), 0);
  return Math.max(0,
    (mirror.stock || 0) - (mirror.reservedQty || 0) - (mirror.pendingQty || 0) - sold);
}

/**
 * @returns {{ available: boolean|null, reason: string }}
 *   `available: null` means "leave this product alone".
 */
function decide(product, mirror) {
  if (!hasImage(product)) return { available: false, reason: 'no_image' };
  if (product.approved === false) return { available: false, reason: 'awaiting_approval' };
  if (product.autoStock === false) return { available: null, reason: 'manual_override' };

  if (!product.billzProductId) return { available: null, reason: 'not_linked' };

  if (!mirror || mirror.deletedInBillz) return { available: false, reason: 'gone_from_billz' };

  const free = availableQuantity(mirror);
  return free > 0
    ? { available: true, reason: 'in_stock' }
    : { available: false, reason: 'out_of_stock' };
}

/**
 * Computes the changes without writing them.
 * Returns every product whose visibility would flip, plus a reason tally.
 */
async function planReconcile() {
  const products = await Product.find({}).lean();
  const billzIds = products.map((p) => p.billzProductId).filter(Boolean);
  const mirrors = billzIds.length
    ? await BillzProductView.find({ billzProductId: { $in: billzIds } }).lean()
    : [];
  const byBillzId = new Map(mirrors.map((m) => [m.billzProductId, m]));

  const changes = [];
  const reasons = {};

  for (const product of products) {
    const { available, reason } = decide(product, byBillzId.get(product.billzProductId));
    reasons[reason] = (reasons[reason] || 0) + 1;
    if (available === null) continue;
    if (Boolean(product.isAvailable) === available) continue;
    changes.push({
      _id: product._id,
      name: product.name,
      from: Boolean(product.isAvailable),
      to: available,
      reason,
    });
  }

  return { total: products.length, changes, reasons };
}

/**
 * Applies a plan. Only products whose value actually changes are written.
 *
 * Accepts a precomputed plan so an operator who has just read the report can
 * apply exactly what was printed. Recomputing here meant the list shown and
 * the list written could differ — a sync landing between the two is enough,
 * and the whole point of the report is to see what will happen.
 */
async function reconcileStock({ plan: precomputed } = {}) {
  const plan = precomputed || await planReconcile();
  if (!plan.changes.length) return { ...plan, applied: 0 };

  await Product.bulkWrite(
    plan.changes.map((change) => ({
      updateOne: {
        filter: { _id: change._id },
        update: { $set: { isAvailable: change.to } },
      },
    })),
    { ordered: false }
  );

  return { ...plan, applied: plan.changes.length };
}

let running = null;

/** Prevents a scheduled pass from overlapping one already in flight. */
function reconcileStockExclusive(options) {
  if (running) return running;
  running = reconcileStock(options).finally(() => { running = null; });
  return running;
}

/** Caller decides whether to start this — see server.js. */
function startScheduler({ intervalMs = Number(process.env.STOCK_RECONCILE_MS) || 120000 } = {}) {
  const timer = setInterval(() => {
    reconcileStockExclusive()
      .then((result) => {
        if (result.applied) {
          console.log(`[stock] ${result.applied} product(s) changed visibility`);
        }
      })
      .catch((err) => console.error('[stock] reconcile failed:', err?.message || 'Error'));
  }, intervalMs);
  timer.unref?.();
  console.log(`[stock] reconciler every ${Math.round(intervalMs / 1000)}s`);
  return timer;
}

module.exports = {
  availableQuantity,
  decide,
  hasImage,
  planReconcile,
  reconcileStock: reconcileStockExclusive,
  startScheduler,
};
