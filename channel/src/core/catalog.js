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
  const cfg = channelConfig(card, channel);
  if (!cfg.enabled) return false;
  return priceFor(card, channel) > 0;
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
    filter.$or = [{ name: rx }, { brand: rx }, { sku: rx }, { barcode: rx }];
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
};
