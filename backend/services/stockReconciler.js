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
 *   1. Not approved yet          -> hidden. New products wait for an operator.
 *   2. No image                  -> hidden. A card with no photo should never
 *                                   reach a customer.
 *   3. Linked to Billz           -> follows Billz stock minus reservations.
 *   4. Linked but gone from Billz-> hidden, never deleted. Order history and
 *                                   the link survive so it returns by itself
 *                                   if Billz gets it back.
 *   5. Not linked at all         -> left exactly as the operator set it.
 *
 * Rule 5 is deliberate. "Out of stock when it is not in Billz" means a product
 * that *was* there and disappeared — not one that was never linked. Applying it
 * to never-linked products would empty the shop the first time this ran.
 *
 * `autoStock: false` opts a product out entirely; the admin toggle sets it, so
 * a manual decision is never overwritten on the next pass.
 */

function hasImage(product) {
  if (product.imageUrl && String(product.imageUrl).trim()) return true;
  return Array.isArray(product.images) && product.images.some((u) => u && String(u).trim());
}

/**
 * @returns {{ available: boolean|null, reason: string }}
 *   `available: null` means "leave this product alone".
 */
function decide(product, mirror) {
  if (product.autoStock === false) return { available: null, reason: 'manual_override' };
  if (product.approved === false) return { available: false, reason: 'awaiting_approval' };
  if (!hasImage(product)) return { available: false, reason: 'no_image' };

  if (!product.billzProductId) return { available: null, reason: 'not_linked' };

  if (!mirror || mirror.deletedInBillz) return { available: false, reason: 'gone_from_billz' };

  const free = Math.max(0,
    (mirror.stock || 0) - (mirror.reservedQty || 0) - (mirror.pendingQty || 0));
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

/** Applies the plan. Only products whose value actually changes are written. */
async function reconcileStock() {
  const plan = await planReconcile();
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
function reconcileStockExclusive() {
  if (running) return running;
  running = reconcileStock().finally(() => { running = null; });
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
  decide,
  hasImage,
  planReconcile,
  reconcileStock: reconcileStockExclusive,
  startScheduler,
};
