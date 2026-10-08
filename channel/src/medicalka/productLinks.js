const BillzProduct = require('../models/BillzProduct');
const ProductCard = require('../models/ProductCard');

/**
 * Medicalka's approvals and paid sub-orders name products by Medicalka's own
 * ids, not by the integer id we publish. Approvals also echo the name we
 * published (`product_external_name`), so the first approval that shows a
 * product links its Medicalka id to the one published product carrying exactly
 * that name. The stored link then holds when names change later.
 *
 * A name that matches no published product, or several, links nothing, and a
 * Medicalka id claimed by two products resolves to neither: the order stops
 * for a person instead of guessing.
 */

const key = (value) => String(value ?? '').trim().toLowerCase();

async function linkedProducts(ProductModel, sourceIds) {
  const ids = [...new Set(sourceIds.filter(Boolean).map(String))];
  if (!ids.length) return new Map();
  const rows = await ProductModel.find({ medicalkaSourceIds: { $in: ids } }).lean();
  const owners = new Map();
  for (const row of rows) {
    for (const id of row.medicalkaSourceIds || []) {
      if (!ids.includes(id)) continue;
      owners.set(id, owners.has(id) ? null : row);
    }
  }
  return new Map([...owners].filter(([, row]) => row));
}

function createProductLinks({ ProductModel = BillzProduct(), CardModel = ProductCard() } = {}) {
  // Published name → product, exactly as the Medicalka feed serialises it
  // (card name first, Billz name otherwise). Ambiguous names map to null.
  async function publishedByName() {
    const mirrors = await ProductModel.find({ medicalkaId: { $ne: null } }).lean();
    const cards = await CardModel.find({
      billzProductId: { $in: mirrors.map((mirror) => mirror.billzProductId) },
    }).lean();
    const cardNames = new Map(cards.map((card) => [card.billzProductId, card.name]));
    const byName = new Map();
    for (const mirror of mirrors) {
      const name = key(cardNames.get(mirror.billzProductId) || mirror.name);
      if (name) byName.set(name, byName.has(name) ? null : mirror);
    }
    return byName;
  }

  /** Links the approval lines whose Medicalka id is not linked yet. */
  async function learn(items = []) {
    const lines = items.filter((item) => item?.productId && key(item.externalName));
    if (!lines.length) return 0;
    const known = await ProductModel.find({
      medicalkaSourceIds: { $in: lines.map((line) => line.productId) },
    }).select('medicalkaSourceIds').lean();
    const linked = new Set(known.flatMap((row) => row.medicalkaSourceIds || []));
    const unknown = lines.filter((line) => !linked.has(line.productId));
    if (!unknown.length) return 0;
    const byName = await publishedByName();
    let learned = 0;
    for (const line of unknown) {
      const mirror = byName.get(key(line.externalName));
      if (!mirror) continue;
      const result = await ProductModel.updateOne(
        { billzProductId: mirror.billzProductId },
        { $addToSet: { medicalkaSourceIds: line.productId } }
      );
      learned += result.modifiedCount || 0;
    }
    return learned;
  }

  /**
   * Billz lines for approval items, or the Medicalka ids that have no link.
   * Learns first, so an approval seen for the first time still resolves.
   */
  async function resolve(items = []) {
    await learn(items);
    const byId = await linkedProducts(ProductModel, items.map((item) => item.productId));
    const missing = [...new Set(items
      .filter((item) => !byId.has(item.productId))
      .map((item) => item.productId || 'unknown'))];
    if (missing.length) return { items: [], missing };
    return {
      items: items.map((item) => ({
        billzProductId: byId.get(item.productId).billzProductId,
        name: byId.get(item.productId).name || item.externalName || item.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
      missing: [],
    };
  }

  return { learn, resolve };
}

module.exports = { createProductLinks, linkedProducts };
