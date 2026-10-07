const catalog = require('../../core/catalog');
const images = require('../../media/images');

const PIECE_UNITS = new Set(['', 'шт', 'шт.', 'pcs', 'pc', 'piece', 'pieces', 'dona']);
// Barcode types documented by partner.nomenclature.composition.get.
const BARCODE_TYPES = new Set(('auspost ausredirect ausreply ausroute aztec c25iata c25ind c25inter c25logic c25matrix codabar codablockf code11 code100 code128 code128b code16k code39 code49 code93 daft datamatrix dotcode dpident dpleit ean128 ean13 ean14 eanx eanx_chk excode39 fim flat hanxin hibc_128 hibc_39 hibc_aztec hibc_blockf hibc_dm hibc_micpdf hibc_pdf hibc_qr isbnx itf14 japanpost kix koreapost logmars mailmark maxicode micropdf417 microqr msi_plessey nve18 onecode pdf417 pdf417trunc pharma pharma_two planet plessey postnet pzn qrcode rm4scc rss14 rss14stack rss14stack_omni rss_exp rss_expstack rss_ltd telepen telepen_num upca upca_chk upce upce_chk vin').split(' '));

// Shown to Yandex customers; ids stay the backend's category keys.
const CATEGORY_NAMES = {
  supplements: 'Qo‘shimchalar', vitamins: 'Vitaminlar', hygiene: 'Gigiyena',
  cosmetics: 'Kosmetika', parapharmaceuticals: 'Parafarmatsevtika', drinks: 'Ichimliklar',
};
// Every product is sold by the piece, but Yandex still requires a package
// measure. Owner decision 2026-10-07: take it from the name when printed there,
// otherwise a nominal 100 g that operators can correct per product in the panel.
const NOMINAL_MEASURE = { unit: 'GRM', value: 100 };
const SETTING_KEYS = ['channels.defaultMxikCode', 'channels.defaultPackageCode'];

function string(value) { return typeof value === 'string' ? value.trim() : ''; }

/**
 * Shop-wide fiscal codes. Owner decision 2026-10-07: every product is sold
 * under one MXIK and one package code, the same defaults Medicalka and Uzum use.
 */
function defaultsFrom(settings = {}) {
  const config = require('../../config');
  const pick = (key, fallback) => string(String((Object.hasOwn(settings, key) ? settings[key] : fallback) ?? ''));
  return {
    mxikCode: pick('channels.defaultMxikCode', config.defaultMxikCode),
    packageCode: pick('channels.defaultPackageCode', config.defaultPackageCode),
  };
}
async function loadDefaults() {
  return defaultsFrom(await require('../../models/SettingView').readSettings(SETTING_KEYS));
}

/** Symbology from the digits, for products without an operator-set type. */
function barcodeTypeFor(barcode) {
  if (!/^\d+$/.test(barcode)) return 'code128';
  return ({ 8: 'eanx', 12: 'upca', 13: 'ean13', 14: 'itf14' })[barcode.length] || 'code128';
}

function measureFor(settings, name) {
  if (settings.measure) return settings.measure;
  const printed = /(\d{1,5})\s*(ГР|Г|GR|G|МЛ|ML)(?![\p{L}])/iu.exec(name || '');
  if (!printed || Number(printed[1]) <= 0) return NOMINAL_MEASURE;
  return { unit: /^(МЛ|ML)$/i.test(printed[2]) ? 'MLT' : 'GRM', value: Number(printed[1]) };
}

/** Null means delisted, even when an operator forced availability in. */
function compositionItem({ card, mirror }, defaults = defaultsFrom()) {
  const settings = card.channels?.yandex || {};
  const price = catalog.priceFor(card, 'yandex');
  const id = string(mirror.billzProductId);
  const categoryId = string(card.category);
  const name = string(card.nameUz || card.name || mirror.name);
  const vendorCode = string(card.sku || mirror.sku);
  const barcode = string(card.barcode || mirror.barcode);
  const barcodeType = settings.barcodeType || barcodeTypeFor(barcode);
  const measure = measureFor(settings, card.name || mirror.name);
  const mxik = string(card.mxikCode) || defaults.mxikCode;
  const packageCode = string(card.packageCode) || defaults.packageCode;
  if (!catalog.isPublishable(card, mirror, 'yandex')
    || !PIECE_UNITS.has(string(mirror.measurementUnit).toLowerCase())
    || !id || id.length > 64 || !categoryId || categoryId.length > 64 || !name || !vendorCode
    || !Number.isFinite(price) || price <= 0 || !barcode || !BARCODE_TYPES.has(barcodeType)
    || !measure || !['GRM', 'MLT'].includes(measure.unit) || !Number.isSafeInteger(measure.value) || measure.value <= 0
    || !mxik || !packageCode) return null;
  const media = images.imagesFor(card).map(({ url }, order) => ({ url, order }));
  if (!media.length) return null;
  const oldPrice = Number(settings.oldPrice);
  return {
    id, categoryId, name,
    description: { general: String(card.descriptionUz || card.description || '') },
    price, ...(Number.isFinite(oldPrice) && oldPrice > price ? { oldPrice } : {}),
    vendorCode, barcode: { type: barcodeType, value: barcode, weightEncoding: 'none' },
    measure: { unit: measure.unit, value: measure.value }, isCatchWeight: false,
    images: media, serviceCodesUz: { mxikCodeUz: mxik, packageCodeUz: packageCode },
  };
}

function composition(items, totalCount) {
  const categories = [...new Map(items.map((item) => [item.categoryId, { id: item.categoryId, name: CATEGORY_NAMES[item.categoryId] || item.categoryId }])).values()];
  return { categories, items, totalCount };
}

function order(record) {
  return { discriminator: 'yandex', eatsId: record.externalId,
    items: record.items.map((item) => ({ id: item.billzProductId, price: item.unitPrice, quantity: item.quantity })) };
}

function orderStatus(record) {
  return { status: record.yandex?.cancelRequested ? 'CANCELLED' : record.yandex?.fulfillmentStatus || 'NEW',
    ...(record.updatedAt || record.createdAt ? { updatedAt: new Date(record.updatedAt || record.createdAt).toISOString() } : {}) };
}

module.exports = { SETTING_KEYS, defaultsFrom, loadDefaults, barcodeTypeFor, measureFor, compositionItem, composition, order, orderStatus };
