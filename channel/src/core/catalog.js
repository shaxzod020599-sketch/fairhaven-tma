const BillzProduct = require('../models/BillzProduct');
const ProductCard = require('../models/ProductCard');
const { nextValue } = require('../models/Counter');

/**
 * Decides what a channel is allowed to see, and at what price.
 *
 * Two records make one channel listing:
 *   - the Fairhaven product card (`products`) — the channel price, whether the
 *     channel is enabled, the description an operator wrote;
 *   - the Billz mirror (`billzproducts`) — stock and the reference retail price.
 *
 * Both must be present. A card with no Billz link has no stock behind it, and a
 * mirrored Billz product with no card was never put on sale.
 */

function channelConfig(card, channel) {
  return (card.channels && card.channels[channel]) || {};
}

/**
 * Stock a channel may sell: what Billz holds, minus units already committed.
 *
 * `reservedQty` is held by confirmed reservations in Billz; `pendingQty` by bot
 * orders still awaiting Telegram approval. Subtracting the pending ones is what
 * stops a marketplace from selling a unit that a customer is already waiting on
 * — the reservation itself is only written to Billz after approval.
 *
 * **Subtracting `reservedQty` is not belt-and-braces; it is the only thing
 * doing the job.** Measured against the live company: three units were reserved
 * through the API and `active_measurement_value` — the field this mirror reads
 * as `stock` — did not move, over ten seconds. Billz records a postponed order
 * without deducting it from the number its product list reports.
 *
 * So the tempting simplification, "Billz already knows what is reserved, just
 * read its stock", oversells: every marketplace would keep selling units that
 * are already spoken for, and the discrepancy only surfaces when a courier
 * arrives for something that is gone.
 */
function availableStock(mirror) {
  return Math.max(0, (mirror.stock || 0) - (mirror.reservedQty || 0) - (mirror.pendingQty || 0));
}

function isAvailable(card, mirror, channel) {
  const cfg = channelConfig(card, channel);
  if (!cfg.enabled) return false;
  if (cfg.forceStatus === 'out') return false;
  if (mirror.deletedInBillz) return false;
  if (cfg.forceStatus === 'in') return true;
  return availableStock(mirror) > (cfg.minStock || 0);
}

/**
 * The price a channel sells at. Set by hand — the Billz retail price is a
 * reference, not a default: each marketplace has its own commission.
 *
 * Returns 0 when unset, and callers must treat that as "do not publish".
 * Publishing at zero would let a marketplace sell stock for nothing.
 */
function priceFor(card, channel) {
  const cfg = channelConfig(card, channel);
  return Number(cfg.price) > 0 ? Number(cfg.price) : 0;
}

function isPublishable(card, mirror, channel) {
  if (!card || !mirror) return false;
  // A product Billz no longer carries must leave the catalogue, not merely
  // report zero stock: leaving it listed means the marketplace keeps showing a
  // product that cannot be supplied.
  if (mirror.deletedInBillz) return false;
  const cfg = channelConfig(card, channel);
  if (!cfg.enabled) return false;
  return priceFor(card, channel) > 0;
}

/**
 * Units a channel may actually be told about.
 *
 * `availableStock` is what exists after reservations; `minStock` is the
 * cushion held back for the shop floor. Publishing the former let a channel
 * sell straight through the cushion, which is the one thing it exists to stop.
 */
function sellableStock(card, mirror, channel) {
  const cfg = channelConfig(card, channel);
  return Math.max(0, availableStock(mirror) - (Number(cfg.minStock) || 0));
}

/**
 * The quantity a channel is actually told.
 *
 * `forceStatus: 'in'` is an operator override meaning "sell this regardless of
 * what Billz says". Publishing a quantity of zero alongside is_available:true
 * is a contradiction their client cannot act on, so the override carries a
 * nominal unit rather than an impossible row.
 */
function publishedQuantity(card, mirror, channel) {
  const sellable = sellableStock(card, mirror, channel);
  if (sellable <= 0 && channelConfig(card, channel).forceStatus === 'in') return 1;
  return sellable;
}

/**
 * Joins cards to mirrors for one channel.
 *
 * Filtering happens in Mongo where it can use an index, then the join is a
 * single second query keyed by billzProductId — not one lookup per product.
 */
async function listForChannel(channel, { skip = 0, limit = 50, search = '' } = {}) {
  const filter = {
    [`channels.${channel}.enabled`]: true,
    billzProductId: { $nin: ['', null] },
  };
  if (search) {
    const safe = String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = new RegExp(safe, 'i');

    // A listing publishes `card.barcode || mirror.barcode`, and in the live
    // shop no card carries one — all 25 are blank while every mirror row has
    // its barcode from Billz. Searching the card alone therefore found nothing
    // for any barcode this API had just published, and the integration guide
    // states barcode is searchable. The mirror's name is searched for the same
    // reason: cards are named in Russian for the shop, so a partner searching
    // the manufacturer's own English wording matched nothing.
    const mirrorHits = await BillzProduct()
      .find({ $or: [{ barcode: rx }, { sku: rx }, { name: rx }] })
      .select('billzProductId')
      .lean();

    filter.$or = [
      { name: rx }, { brand: rx }, { sku: rx }, { barcode: rx },
      ...(mirrorHits.length
        ? [{ billzProductId: { $in: mirrorHits.map((m) => m.billzProductId) } }]
        : []),
    ];
  }

  const cards = await ProductCard()
    .find(filter)
    .sort({ name: 1 })
    .lean();

  const mirrors = await BillzProduct()
    .find({ billzProductId: { $in: cards.map((c) => c.billzProductId) } })
    .lean();
  const byBillzId = new Map(mirrors.map((m) => [m.billzProductId, m]));

  const joined = cards
    .map((card) => ({ card, mirror: byBillzId.get(card.billzProductId) }))
    .filter(({ card, mirror }) => isPublishable(card, mirror, channel));

  return {
    total: joined.length,
    items: joined.slice(skip, skip + limit),
  };
}

/** Single listing by Billz id. Returns null when it must not be published. */
async function findForChannel(channel, billzProductId) {
  const card = await ProductCard().findOne({ billzProductId }).lean();
  if (!card) return null;
  const mirror = await BillzProduct().findOne({ billzProductId }).lean();
  if (!isPublishable(card, mirror, channel)) return null;
  return { card, mirror };
}

/**
 * Allocates the integer id Medicalka indexes products by, once per product.
 *
 * Done lazily rather than during sync so ids are only spent on products that
 * are actually published, and the sequence stays small and readable.
 */
async function ensureMedicalkaId(mirror) {
  if (mirror.medicalkaId) return mirror.medicalkaId;
  const id = await nextValue('medicalkaProductId');
  await BillzProduct().updateOne(
    { billzProductId: mirror.billzProductId, medicalkaId: null },
    { $set: { medicalkaId: id } }
  );
  // If a concurrent request won the race, its id is the one that stuck.
  const fresh = await BillzProduct()
    .findOne({ billzProductId: mirror.billzProductId })
    .select('medicalkaId')
    .lean();
  return fresh?.medicalkaId || id;
}

module.exports = {
  availableStock,
  channelConfig,
  ensureMedicalkaId,
  findForChannel,
  isAvailable,
  isPublishable,
  listForChannel,
  priceFor,
  publishedQuantity,
  sellableStock,
};
