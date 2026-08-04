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
];

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
    },
  };
}
