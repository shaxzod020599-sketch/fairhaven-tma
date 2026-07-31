/**
 * Wire format for Medicalka.
 *
 * Their integration guide is explicit about types and their client relies on
 * them: `id` and `total` are integers, while `price` and `quantity` arrive as
 * decimal *strings* ("749000.00"). Emitting a JSON number where a string is
 * expected is the kind of mismatch that only shows up as a parse error on
 * their side, so the conversion lives here and nowhere else.
 */

/** Money and quantities as fixed 2-decimal strings, per their examples. */
function decimalString(value) {
  const n = Number(value);
  return (Number.isFinite(n) ? n : 0).toFixed(2);
}

/** "2026-07-08T19:45:54" — ISO 8601, seconds precision, no timezone suffix. */
function timestamp(date) {
  const d = date instanceof Date ? date : new Date(date || Date.now());
  const valid = Number.isNaN(d.getTime()) ? new Date() : d;
  return valid.toISOString().replace(/\.\d{3}Z$/, '');
}

function pharmacy(shop) {
  return {
    id: shop.id,
    name: shop.name,
    created_at: timestamp(shop.createdAt),
  };
}

function product({ card, mirror, medicalkaId, price }) {
  return {
    id: medicalkaId,
    name: card.name || mirror.name || '',
    manufacturer: card.brand || mirror.brandName || '',
    barcode: card.barcode || mirror.barcode || '',
    price: decimalString(price),
    updated_at: timestamp(card.updatedAt || mirror.syncedAt),
  };
}

/**
 * One row of the stock feed.
 *
 * `is_available` is always true because the endpoint only ever lists products
 * that are in stock — their guide states absent products simply are not there.
 */
function inventoryRow({ medicalkaId, quantity, price, pharmacyId }) {
  return {
    pharmacy_id: pharmacyId,
    product_id: medicalkaId,
    quantity: decimalString(quantity),
    price: decimalString(price),
    is_available: true,
  };
}

function list(items, total) {
  return { items, total: Number(total) || 0 };
}

module.exports = { decimalString, timestamp, pharmacy, product, inventoryRow, list };
