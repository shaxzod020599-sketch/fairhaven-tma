export function getProductImages(product) {
  if (!product) return [];
  const out = [];
  if (Array.isArray(product.images)) {
    for (const u of product.images) if (u && !out.includes(u)) out.push(u);
  }
  if (product.imageUrl && !out.includes(product.imageUrl)) {
    out.unshift(product.imageUrl);
  }
  return out;
}

export function primaryImage(product) {
  const list = getProductImages(product);
  return list[0] || null;
}

const LATIN_HINT = /^(uz|uz-latn|uz-lat|uz_lat)/i;
const CYRILLIC = /[А-Яа-яЁё]/;

export function pickDescription(product, languageCode) {
  if (!product) return '';
  const lang = (languageCode || '').toLowerCase();
  if (lang.startsWith('uz')) {
    const wantsLatin = LATIN_HINT.test(lang) ||
      lang === 'uz' && !CYRILLIC.test(product.descriptionUz || '');
    if (wantsLatin && product.descriptionUzLat) return product.descriptionUzLat;
    if (product.descriptionUz) return product.descriptionUz;
    if (product.descriptionUzLat) return product.descriptionUzLat;
  }
  return product.description || product.descriptionUz || product.descriptionUzLat || '';
}
