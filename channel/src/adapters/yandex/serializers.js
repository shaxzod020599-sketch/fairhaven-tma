const catalog = require('../../core/catalog');
const images = require('../../media/images');

const PIECE_UNITS = new Set(['', 'шт', 'шт.', 'pcs', 'pc', 'piece', 'pieces', 'dona']);
// Barcode types documented by partner.nomenclature.composition.get.
const BARCODE_TYPES = new Set(('auspost ausredirect ausreply ausroute aztec c25iata c25ind c25inter c25logic c25matrix codabar codablockf code11 code100 code128 code128b code16k code39 code49 code93 daft datamatrix dotcode dpident dpleit ean128 ean13 ean14 eanx eanx_chk excode39 fim flat hanxin hibc_128 hibc_39 hibc_aztec hibc_blockf hibc_dm hibc_micpdf hibc_pdf hibc_qr isbnx itf14 japanpost kix koreapost logmars mailmark maxicode micropdf417 microqr msi_plessey nve18 onecode pdf417 pdf417trunc pharma pharma_two planet plessey postnet pzn qrcode rm4scc rss14 rss14stack rss14stack_omni rss_exp rss_expstack rss_ltd telepen telepen_num upca upca_chk upce upce_chk vin').split(' '));

function string(value) { return typeof value === 'string' ? value.trim() : ''; }

/** Null means delisted, even when an operator forced availability in. */
function compositionItem({ card, mirror }) {
  const settings = card.channels?.yandex || {};
  const price = catalog.priceFor(card, 'yandex');
  const measure = settings.measure;
  const id = string(mirror.billzProductId);
  const categoryId = string(card.category);
  const name = string(card.nameUz || card.name || mirror.name);
  const vendorCode = string(card.sku || mirror.sku);
  const barcode = string(card.barcode || mirror.barcode);
  const mxik = string(card.mxikCode);
  const packageCode = string(card.packageCode);
  if (!catalog.isPublishable(card, mirror, 'yandex')
    || !PIECE_UNITS.has(string(mirror.measurementUnit).toLowerCase())
    || !id || id.length > 64 || !categoryId || categoryId.length > 64 || !name || !vendorCode
    || !Number.isFinite(price) || price <= 0 || !barcode || !BARCODE_TYPES.has(settings.barcodeType)
    || !measure || !['GRM', 'MLT'].includes(measure.unit) || !Number.isSafeInteger(measure.value) || measure.value <= 0
    || !mxik || !packageCode) return null;
  const media = images.imagesFor(card).map(({ url }, order) => ({ url, order }));
  if (!media.length) return null;
  const oldPrice = Number(settings.oldPrice);
  return {
    id, categoryId, name,
    description: { general: String(card.descriptionUz || card.description || '') },
    price, ...(Number.isFinite(oldPrice) && oldPrice > price ? { oldPrice } : {}),
    vendorCode, barcode: { type: settings.barcodeType, value: barcode, weightEncoding: 'none' },
    measure: { unit: measure.unit, value: measure.value }, isCatchWeight: false,
    images: media, serviceCodesUz: { mxikCodeUz: mxik, packageCodeUz: packageCode },
  };
}

function composition(items, totalCount) {
  const categories = [...new Map(items.map((item) => [item.categoryId, { id: item.categoryId, name: item.categoryId }])).values()];
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

module.exports = { compositionItem, composition, order, orderStatus };
