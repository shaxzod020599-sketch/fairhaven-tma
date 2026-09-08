export const CATEGORIES = [
  ['cosmetics', 'Косметика'],
  ['parapharmaceuticals', 'Парафармацевтика'],
  ['supplements', 'Добавки'],
  ['vitamins', 'Витамины'],
  ['hygiene', 'Гигиена'],
  ['drinks', 'Напитки'],
];

export const CHANNELS = [
  { key: 'medicalka', label: 'Medicalka', price: true, minStock: true },
  { key: 'uzum', label: 'Uzum Tezkor', price: true, minStock: true },
  { key: 'yandex', label: 'Yandex', price: true, minStock: true },
];

// Full documented set also accepted by the Yandex foundation serializer.
// Keep uncommon stored types selectable; never infer symbology from a barcode.
export const YANDEX_BARCODE_TYPES = ('auspost ausredirect ausreply ausroute aztec c25iata c25ind c25inter c25logic c25matrix codabar codablockf code11 code100 code128 code128b code16k code39 code49 code93 daft datamatrix dotcode dpident dpleit ean128 ean13 ean14 eanx eanx_chk excode39 fim flat hanxin hibc_128 hibc_39 hibc_aztec hibc_blockf hibc_dm hibc_micpdf hibc_pdf hibc_qr isbnx itf14 japanpost kix koreapost logmars mailmark maxicode micropdf417 microqr msi_plessey nve18 onecode pdf417 pdf417trunc pharma pharma_two planet plessey postnet pzn qrcode rm4scc rss14 rss14stack rss14stack_omni rss_exp rss_expstack rss_ltd telepen telepen_num upca upca_chk upce upce_chk vin').split(' ');

export function validateProduct(product) {
  const errors = {};
  if (!String(product.name || '').trim()) errors.name = 'Введите название';
  if (!product.category) errors.category = 'Выберите категорию';
  if (!Number.isFinite(Number(product.price)) || Number(product.price) < 0) errors.price = 'Цена не может быть отрицательной';
  const mxik = String(product.mxikCode || '').trim();
  if (mxik && !/^\d{6,20}$/.test(mxik)) errors.mxikCode = 'ИКПУ содержит от 6 до 20 цифр';
  const pkg = String(product.packageCode || '').trim();
  if (pkg && !/^\d{3,20}$/.test(pkg)) errors.packageCode = 'Код упаковки содержит от 3 до 20 цифр';
  return errors;
}

export function duplicateDraft(product) {
  const { _id, ...copy } = product;
  return {
    ...copy,
    name: `${product.name || 'Товар'} — копия`,
    sku: '',
    barcode: '',
    billzProductId: '',
    billz: null,
  };
}

export function emptyProduct() {
  return {
    name: '', nameUz: '', brand: '', sku: '', barcode: '', price: 0, oldPrice: 0,
    category: 'vitamins', imageUrl: '', images: [], description: '', descriptionUz: '',
    descriptionUzLat: '', mxikCode: '', packageCode: '', isAvailable: true,
    channels: {
      medicalka: { enabled: false, price: 0, forceStatus: 'auto', minStock: 0 },
      uzum: { enabled: false, price: 0, forceStatus: 'auto', minStock: 0 },
      yandex: { enabled: false, price: 0, forceStatus: 'auto', minStock: 0, measure: null, barcodeType: '' },
    },
  };
}
