const config = require('../../config');
const catalog = require('../../core/catalog');
const images = require('../../media/images');
const statuses = require('./statuses');

const crypto = require('node:crypto');
const contract = require('./contract');

const CHANNEL = 'uzum';

const CONTENT_TYPES = {
  nomenclature: 'application/vnd.eda.picker.nomenclature.v1+json',
  availability: 'application/vnd.eda.picker.availability.v1+json',
  order: 'application/vnd.eats.order.v2+json',
};

/** Their error envelope. Always an array, even for a single fault. */
function errors(list) {
  return (Array.isArray(list) ? list : [list]).map(({ code, description }) => ({
    code: Number(code) || 500,
    description: String(description || 'unexpected error'),
  }));
}

/**
 * The tax classification code sent with each product.
 *
 * Billz carries none — the audit found the custom field empty on all 28
 * products — so a default is configured and a product may override it. Sending
 * a wrong code is a tax filing problem, not a display problem, which is why the
 * fallback is a deliberate setting rather than a literal buried here.
 */
function serviceCodes(card, defaults) {
  const mxik = String(card.mxikCode || '').trim() || defaults.mxikCode;
  const packageCode = String(card.packageCode || '').trim() || defaults.packageCode;
  if (!mxik) return undefined;
  return {
    mxikCodeUz: mxik,
    ...(packageCode ? { packageCodeUz: packageCode } : {}),
  };
}

/**
 * Measurement. Every Billz product in this catalogue is sold by the piece —
 * none are weighed — so `isCatchWeight` is false and the unit is a count.
 */
function measure() {
  return { value: 1 };
}

// Only piece units can be sold truthfully by the current reservation adapter.
function supportedEntry({ mirror, card }) {
  const unit = String(mirror.measurementUnit || '').trim().toLowerCase();
  const price = catalog.priceFor(card, CHANNEL);
  return ['', 'шт', 'шт.', 'pcs', 'pc', 'piece', 'pieces', 'dona'].includes(unit)
    && typeof mirror.billzProductId === 'string' && mirror.billzProductId.length > 0
    && mirror.billzProductId.length <= 64 && Number.isFinite(price) && price > 0;
}

/** One product in the nomenclature payload. */
function compositionItem({ card, mirror }, defaults) {
  const price = catalog.priceFor(card, CHANNEL);
  const oldPrice = Number(card.channels?.[CHANNEL]?.oldPrice) || 0;

  return {
    id: mirror.billzProductId,
    categoryId: categoryIdFor(card),
    name: card.nameUz || card.name || mirror.name || '',
    description: { general: String(card.descriptionUz || card.description || '') },
    price,
    // Only sent when it is genuinely higher: an "old price" equal to the price
    // renders as a struck-through identical number.
    ...(oldPrice > price ? { oldPrice } : {}),
    vendorCode: card.sku || mirror.sku || '',
    barcode: { value: String(card.barcode || mirror.barcode || ''), weightEncoding: 'none' },
    measure: measure(mirror),
    isCatchWeight: false,
    images: images.imagesFor(card),
    ...(serviceCodes(card, defaults) ? { serviceCodesUz: serviceCodes(card, defaults) } : {}),
  };
}

/**
 * Categories come from the product card, not from Billz.
 *
 * Billz categories describe stock control; the shop's own categories are what a
 * customer browses, and they are what the bot and site already use. Sending two
 * different trees to two channels would be a maintenance trap.
 */
function categoryIdFor(card) {
  const raw = String(card.category || 'other').trim().toLowerCase();
  const slug = raw.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'other';
  if (slug.length <= 64 && slug === raw) return slug;
  return `${slug.slice(0, 47)}-${crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16)}`;
}

function categoriesFrom(entries) {
  const byId = new Map();
  let sortOrder = 0;
  for (const { card } of entries) {
    const id = categoryIdFor(card);
    if (byId.has(id)) continue;
    sortOrder += 1;
    byId.set(id, {
      id,
      name: String(card.category || 'Boshqa'),
      sortOrder,
    });
  }
  return [...byId.values()];
}

/** `GET /nomenclature/{storeId}/composition` */
function composition(entries, defaults) {
  return {
    categories: categoriesFrom(entries),
    items: entries.map((entry) => compositionItem(entry, defaults)),
  };
}

/** `GET /nomenclature/{storeId}/availability` */
function availability(entries) {
  return {
    items: entries.map(({ card, mirror }) => ({
      id: mirror.billzProductId,
      stock: catalog.isAvailable(card, mirror, CHANNEL)
        ? catalog.publishedQuantity(card, mirror, CHANNEL) : 0,
    })),
  };
}

/** `GET /order/{orderId}` */
function order(record) {
  if (record.rawIn && !contract.validate(record.rawIn)) return contract.snapshot(record.rawIn);
  return {
    eatsId: String(record.externalId),
    comment: typeof record.rawIn?.comment === 'string' ? record.rawIn.comment : '',
    promos: [],
    items: record.items.map((item) => ({
      id: item.billzProductId,
      name: item.name || '',
      quantity: item.quantity,
      price: item.unitPrice,
      modifications: [],
      promos: [],
    })),
  };
}

/** GET status exposes business progress, never upstream diagnostic text. */
function orderStatus(record) {
  return {
    status: statuses.toUzum(record.status, record.billz),
    ...(record.updatedAt ? { updatedAt: new Date(record.updatedAt).toISOString() } : {}),
  };
}

/**
 * Defaults an operator can change without a deploy.
 *
 * Keyed as the admin panel stores them. The environment value is the fallback
 * for a deployment where nobody has opened that screen yet, not the other way
 * round — the panel is where this is meant to be set.
 */
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

function defaultsFrom(settings) {
  return {
    mxikCode: shopDefault(settings, 'channels.defaultMxikCode', config.defaultMxikCode),
    packageCode: shopDefault(settings, 'channels.defaultPackageCode', config.defaultPackageCode),
  };
}

module.exports = {
  CHANNEL,
  CONTENT_TYPES,
  availability,
  categoriesFrom,
  categoryIdFor,
  composition,
  compositionItem,
  defaultsFrom,
  errors,
  measure,
  order,
  orderStatus,
  serviceCodes,
  supportedEntry,
};
