const config = require('../../config');
const catalog = require('../../core/catalog');
const images = require('../../media/images');
const statuses = require('./statuses');

/**
 * Response shapes for the Uzum Tezkor Retail API.
 *
 * Uzum inherits the Yandex Eats contract, so this file is also the template for
 * the Yandex integration later. Two things about it are easy to get wrong and
 * expensive to get wrong:
 *
 *   - **Errors are an array**, `[{code, description}]`, not an object. Their
 *     client indexes into it.
 *   - **Content types are versioned and specific.** A correct body under
 *     `application/json` is rejected as firmly as a malformed one.
 */

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
function measure(mirror) {
  return {
    value: 1,
    unit: String(mirror.measurementUnit || '').toLowerCase().startsWith('kg') ? 'GRM' : 'PCS',
  };
}

/** One product in the nomenclature payload. */
function compositionItem({ card, mirror }, defaults) {
  const price = catalog.priceFor(card, CHANNEL);
  const oldPrice = Number(card.channels?.[CHANNEL]?.oldPrice) || 0;

  return {
    id: mirror.billzProductId,
    categoryId: categoryIdFor(card),
    name: card.nameUz || card.name || mirror.name || '',
    description: card.descriptionUz || card.description || '',
    price,
    // Only sent when it is genuinely higher: an "old price" equal to the price
    // renders as a struck-through identical number.
    ...(oldPrice > price ? { oldPrice } : {}),
    vendorCode: card.sku || mirror.sku || '',
    barcodes: [card.barcode || mirror.barcode].filter(Boolean),
    measure: measure(mirror),
    isCatchWeight: false,
    images: images.imagesFor(card),
    inStock: catalog.publishedQuantity(card, mirror, CHANNEL),
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
  return raw.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'other';
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
      parentId: null,
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
      stock: catalog.publishedQuantity(card, mirror, CHANNEL),
      available: catalog.isAvailable(card, mirror, CHANNEL),
    })),
  };
}

/** `GET /order/{orderId}` */
function order(record) {
  return {
    orderId: record.internalOrderId,
    eatsId: record.externalId,
    status: statuses.toUzum(record.status),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    total: record.totalAmount,
    items: record.items.map((item) => ({
      id: item.billzProductId,
      name: item.name,
      quantity: item.quantity,
      price: item.unitPrice,
      total: item.quantity * item.unitPrice,
    })),
    customer: {
      name: record.customer?.name || '',
      phone: record.customer?.phone || '',
      address: record.customer?.address || '',
    },
  };
}

/** `GET /order/{orderId}/status` */
function orderStatus(record) {
  return {
    status: statuses.toUzum(record.status),
    comment: record.billz?.lastError || '',
    updatedAt: record.updatedAt,
  };
}

/** Defaults an operator can change without a deploy. */
function defaultsFrom(settings) {
  return {
    mxikCode: String(settings?.defaultMxikCode || config.defaultMxikCode || '').trim(),
    packageCode: String(settings?.defaultPackageCode || '').trim(),
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
};
