/**
 * Wire format for Medicalka.
 *
 * Medicalka's pharmacy-import contract uses integer ids and quantities plus
 * JSON numbers for prices. The older client guide used decimal strings, so the
 * legacy helper remains exported for order-response compatibility tests, while
 * catalogue and stock rows follow the importer Medicalka runs in production.
 */

const config = require('../../config');
const media = require('../../media/images');

/** Money and quantities as fixed 2-decimal strings, per their examples. */
function decimalString(value) {
  const n = Number(value);
  return (Number.isFinite(n) ? n : 0).toFixed(2);
}

function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
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
  const ikpu = String(card.mxikCode || defaults.mxikCode || '').trim();
  return {
    ikpu,
    ikpu_code: ikpu,
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

/**
 * Product pictures, as public URLs with the SHA-1 of the bytes behind each.
 *
 * The files are ours — Billz forbids serving media from their CDN — and they
 * are the same pictures the shop shows. The hash is there so a consumer that
 * caches images can tell an edited picture from an unchanged one without
 * downloading it again; the same shape Uzum already receives.
 *
 * The URLs are public and carry no key. That is deliberate: a marketplace
 * copies product images onto its own CDN, so a token inside an image URL would
 * end up in their HTML and their logs — spreading the credential rather than
 * protecting the picture. An empty array means the product has no uploaded
 * image, which is also the reason the shop itself would not show it.
 */
function product({ card, mirror, medicalkaId, price, defaults }) {
  return {
    id: medicalkaId,
    name: card.name || mirror.name || '',
    manufacturer: card.brand || mirror.brandName || '',
    barcode: card.barcode || mirror.barcode || '',
    ...taxCodes(card, defaults),
    images: media.imagesFor(card),
    price: number(price),
    updated_at: timestamp(card.updatedAt || mirror.syncedAt),
  };
}

/**
 * One row of the stock feed.
 *
 * `is_available` is always true because the endpoint only ever lists products
 * that are in stock — their guide states absent products simply are not there.
 */
function inventoryRow({ medicalkaId, quantity, basePrice, price, pharmacyId }) {
  const salePrice = number(price);
  return {
    pharmacy_id: pharmacyId,
    product_id: medicalkaId,
    quantity: Math.max(0, Math.floor(number(quantity))),
    base_price: number(basePrice) || salePrice,
    price: salePrice,
    is_available: true,
  };
}

function list(items, total) {
  return { items, total: Number(total) || 0 };
}

module.exports = {
  decimalString, timestamp, pharmacy, product, inventoryRow, list, defaultsFrom,
};
