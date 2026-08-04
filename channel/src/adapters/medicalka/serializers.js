/**
 * Wire format for Medicalka.
 *
 * Their integration guide is explicit about types and their client relies on
 * them: `id` and `total` are integers, while `price` and `quantity` arrive as
 * decimal *strings* ("749000.00"). Emitting a JSON number where a string is
 * expected is the kind of mismatch that only shows up as a parse error on
 * their side, so the conversion lives here and nowhere else.
 */

const config = require('../../config');

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

/**
 * The two tax codes a fiscal receipt needs, resolved per product.
 *
 * `ikpu` (ИКПУ/MXIK) says what the product is; `package_code` says which unit
 * it is sold in. Billz stores neither, so both live on our product card, and a
 * product without its own falls back to the operator's default from the panel.
 * Empty strings rather than omitted keys — their client reads the field either
 * way, and a missing key is harder to notice than a blank one.
 */
function taxCodes(card, defaults = {}) {
  return {
    ikpu: String(card.mxikCode || defaults.mxikCode || '').trim(),
    package_code: String(card.packageCode || defaults.packageCode || '').trim(),
  };
}

/**
 * One shop-wide code, honouring a deliberate blank.
 *
 * An operator who empties the field in the panel is answering "we have no
 * shop-wide code", and the feed has to say the same thing — the panel showing
 * blank while the wire carries a fabricated tax code is exactly the kind of
 * silent mismatch that lands on a customer's receipt. Only a row that is not
 * there at all (a fresh install before the seed runs) falls back to the
 * compiled constant.
 */
function shopDefault(settings, key, fallback) {
  const has = settings && Object.prototype.hasOwnProperty.call(settings, key);
  return String((has ? settings[key] : fallback) ?? '').trim();
}

/** Panel-set defaults, falling back to the build-time constants. */
function defaultsFrom(settings) {
  return {
    mxikCode: shopDefault(settings, 'channels.defaultMxikCode', config.defaultMxikCode),
    packageCode: shopDefault(settings, 'channels.defaultPackageCode', config.defaultPackageCode),
  };
}

function product({ card, mirror, medicalkaId, price, defaults }) {
  return {
    id: medicalkaId,
    name: card.name || mirror.name || '',
    manufacturer: card.brand || mirror.brandName || '',
    barcode: card.barcode || mirror.barcode || '',
    ...taxCodes(card, defaults),
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

module.exports = {
  decimalString, timestamp, pharmacy, product, inventoryRow, list, defaultsFrom,
};
