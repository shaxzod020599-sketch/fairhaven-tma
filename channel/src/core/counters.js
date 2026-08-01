const logger = require('../logger');
const BillzProduct = require('../models/BillzProduct');
const ChannelOrder = require('../models/ChannelOrder');

/**
 * Repairs the reservation counters from the orders that own them.
 *
 * `reservedQty` and `pendingQty` are the only fields on the Billz mirror that
 * the catalogue sync does not overwrite — deliberately, because Billz knows
 * nothing about what we are holding. The cost of that decision is that a drift
 * here is permanent: no later sync corrects it, and a few units lost this way
 * every month eventually reads as "out of stock" on a product sitting on the
 * shelf.
 *
 * The order lifecycle is written to make drift impossible — each counter move
 * sits next to the flag that records it, with no `await` between them. This
 * exists because "impossible" covers the code as written and not the process
 * being killed between two database round-trips, and because the failure is
 * silent: nothing surfaces until someone counts the shelf.
 *
 * **It is a repair, not the mechanism.** A correction here means something went
 * wrong upstream, so every one is logged. If these lines are not rare, the fix
 * belongs in the lifecycle, not in a bigger hammer.
 */

// A product whose orders are all settled and quiet is safe to correct. Inside
// this window an order may be mid-transition, and a `$set` computed before its
// `$inc` landed would undo it.
const QUIET_MS = 2 * 60 * 1000;

/** What the counters should be, according to the orders currently holding stock. */
async function expectedCounters() {
  const rows = await ChannelOrder().aggregate([
    {
      $match: {
        $or: [
          { 'billz.reservationApplied': true },
          { 'billz.pendingApplied': true },
        ],
      },
    },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.billzProductId',
        reserved: {
          $sum: { $cond: ['$billz.reservationApplied', '$items.quantity', 0] },
        },
        pending: {
          $sum: { $cond: ['$billz.pendingApplied', '$items.quantity', 0] },
        },
        lastTouched: { $max: '$updatedAt' },
      },
    },
  ]);

  return new Map(rows.map((row) => [row._id, {
    reserved: row.reserved,
    pending: row.pending,
    lastTouched: row.lastTouched,
  }]));
}

/**
 * Compares every mirror against its orders and corrects the ones that disagree.
 *
 * Returns the corrections it made, so a caller — or a test — can assert that
 * there were none rather than trusting that there were none.
 */
async function reconcileCounters({ now = Date.now(), quietMs = QUIET_MS, apply = true } = {}) {
  const expected = await expectedCounters();

  // Every mirror that currently claims to hold something, plus every product an
  // order says should. A mirror holding units with no order behind it is the
  // case that matters most, and it is invisible if only orders are walked.
  const mirrors = await BillzProduct()
    .find({
      $or: [
        { reservedQty: { $gt: 0 } },
        { pendingQty: { $gt: 0 } },
        { billzProductId: { $in: [...expected.keys()] } },
      ],
    })
    .select('billzProductId reservedQty pendingQty')
    .lean();

  const corrections = [];
  const skipped = [];

  for (const mirror of mirrors) {
    const want = expected.get(mirror.billzProductId) || { reserved: 0, pending: 0 };
    const reservedOff = (mirror.reservedQty || 0) !== want.reserved;
    const pendingOff = (mirror.pendingQty || 0) !== want.pending;
    if (!reservedOff && !pendingOff) continue;

    // An order that changed a moment ago may still be mid-transition: its
    // counter update can have landed after this aggregate read. Correcting now
    // would undo it.
    const touched = want.lastTouched ? new Date(want.lastTouched).getTime() : 0;
    if (now - touched < quietMs) {
      skipped.push(mirror.billzProductId);
      continue;
    }

    corrections.push({
      billzProductId: mirror.billzProductId,
      reserved: [mirror.reservedQty || 0, want.reserved],
      pending: [mirror.pendingQty || 0, want.pending],
    });

    if (apply) {
      await BillzProduct().updateOne(
        { billzProductId: mirror.billzProductId },
        { $set: { reservedQty: want.reserved, pendingQty: want.pending } }
      );
    }
  }

  if (corrections.length) {
    // Loud on purpose. Each of these is a lifecycle bug that got past the
    // flags, and the numbers are the evidence for finding it.
    logger.warn('reservation counters drifted and were repaired', {
      corrections: corrections.slice(0, 20),
      total: corrections.length,
    });
  }

  return { corrections, skipped, examined: mirrors.length };
}

module.exports = { QUIET_MS, expectedCounters, reconcileCounters };
