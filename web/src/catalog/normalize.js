/**
 * One product shape for every page. API fields win; missing ones (older API) are computed with the same
 * rules the backend uses, so a card never shows the raw ALL-CAPS name as its title.
 */
import { resolveBrand, brandBySlug } from './brands.js';
import { formatTitle, formatTitleUz, formatSpec } from './displayName.js';
import { classify, orderNeeds, isKind } from './taxonomy.js';

const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** Normalised copy of an API product. Safe to call twice: a normalised product is returned as is. */
export function normalizeProduct(raw) {
  if (!raw || raw.__fh) return raw;
  const hasBrand = typeof raw.brandSlug === 'string' && typeof raw.brandName === 'string';
  const brand = hasBrand ? { slug: raw.brandSlug, name: raw.brandName } : resolveBrand(raw);
  const auto = Array.isArray(raw.needs) && typeof raw.kind === 'string' ? null : classify(raw);
  const price = toNumber(raw.price);
  const oldPrice = toNumber(raw.oldPrice);
  const saving = oldPrice > price ? oldPrice - price : 0;
  const title = (typeof raw.title === 'string' && raw.title.trim()) || formatTitle(raw.name, raw.brand) || String(raw.name || '');
  const titleUz = typeof raw.titleUz === 'string' ? raw.titleUz : formatTitleUz(raw.nameUz, raw.brand);

  return Object.defineProperty({
    ...raw,
    title,
    titleUz,
    spec: typeof raw.spec === 'string' ? raw.spec : formatSpec(raw.name, raw.brand),
    specUz: typeof raw.specUz === 'string' ? raw.specUz : formatSpec(raw.name, raw.brand, 'uz'),
    brandName: brand.name,
    brandSlug: brand.slug,
    needs: Array.isArray(raw.needs) ? orderNeeds(raw.needs) : auto.needs,
    kind: typeof raw.kind === 'string' ? (isKind(raw.kind) ? raw.kind : '') : auto.kind,
    price,
    oldPrice,
    saving,
    percent: saving ? Math.round((saving / oldPrice) * 100) : 0,
    image: raw.imageUrl || (Array.isArray(raw.images) && raw.images[0]) || '',
    isAvailable: raw.isAvailable !== false,
  }, '__fh', { value: true, enumerable: false });
}

/** Display title in the current language; Uzbek falls back to the Russian title. */
export function productTitle(product, lang) {
  if (!product) return '';
  if (lang === 'uz' && product.titleUz) return product.titleUz;
  return product.title || product.name || '';
}

/** Pack and dose line in the current language. */
export function productSpec(product, lang) {
  if (!product) return '';
  if (lang === 'uz' && typeof product.specUz === 'string') return product.specUz;
  return product.spec || '';
}

/** 'US', 'CA' or null for a brand slug (registry), for the «Страна бренда» line. */
export function brandCountry(slug) {
  return brandBySlug(slug)?.country || null;
}
