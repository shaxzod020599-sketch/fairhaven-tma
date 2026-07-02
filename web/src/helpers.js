/**
 * Shared helpers for the web site (independent of the mini-app utils).
 */

/** Format number as UZS currency: "150 000 UZS" */
export function formatPrice(amount) {
  const n = Number(amount) || 0;
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' UZS';
}

/** Discount info when oldPrice > price. */
export function getDiscountInfo(product) {
  const price = Number(product?.price) || 0;
  const oldPrice = Number(product?.oldPrice) || 0;
  if (!price || oldPrice <= price) {
    return { hasDiscount: false, oldPrice: 0, price, percent: 0 };
  }
  const percent = Math.round(((oldPrice - price) / oldPrice) * 100);
  return { hasDiscount: true, oldPrice, price, percent };
}

/** Merge imageUrl + images[] into a deduped gallery list. */
export function getAllImages(product) {
  const out = [];
  if (product?.imageUrl) out.push(product.imageUrl);
  if (Array.isArray(product?.images)) {
    for (const u of product.images) {
      if (u && !out.includes(u)) out.push(u);
    }
  }
  return out.length ? out : [];
}

/** Resolve product display name by language with fallback to RU. */
export function productName(product, lang) {
  if (!product) return '';
  if (lang === 'uz') return product.nameUz || product.name || '';
  return product.name || '';
}

/** Resolve product description by language with fallback chain. */
export function productDescription(product, lang) {
  if (!product) return '';
  if (lang === 'uz') {
    return product.descriptionUzLat || product.descriptionUz || product.description || '';
  }
  return product.description || '';
}

/** Map a life-stage slug to the product tags it should match. */
export const LIFE_STAGES = [
  {
    slug: 'fertility-women',
    tag: 'women',
    icon: '🌸',
    tone: 'pink',
  },
  {
    slug: 'fertility-men',
    tag: 'men',
    icon: '🌿',
    tone: 'blue',
  },
  {
    slug: 'pregnant',
    tag: 'prenatal',
    icon: '🤰',
    tone: 'lavender',
  },
  {
    slug: 'nursing',
    tag: 'nursing',
    icon: '🍼',
    tone: 'mint',
  },
  {
    slug: 'menopause',
    tag: 'menopause',
    icon: '🌿',
    tone: 'wine',
  },
];
