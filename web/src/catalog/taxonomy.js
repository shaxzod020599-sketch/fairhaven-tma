/**
 * Health goals ("needs") and product kinds. Keys are stable: URLs, i18n labels (need.<key>, kind.<key>,
 * needDesc.<key>) and icons are built on them. The order here is the order the site lists them.
 * classify() is the client copy of backend/utils/catalog/taxonomy.js, used only while the API does not
 * send `needs` / `kind`; parity.test.mjs keeps the copies in step.
 */
import { resolveBrand } from './brands.js';

export const NEED_KEYS = [
  'fertility', 'pregnancy', 'women', 'men', 'beauty', 'sleep',
  'immunity', 'heart', 'digestion', 'metabolism', 'kids', 'bones',
];
export const KIND_KEYS = ['vitamins', 'minerals', 'omega', 'collagen', 'inositol', 'herbal', 'enzymes', 'intimate'];

// Old /shop/:stage slugs from the previous site. They keep working by mapping to a need.
export const LEGACY_STAGES = {
  'fertility-women': 'fertility',
  'fertility-men': 'men',
  pregnant: 'pregnancy',
  nursing: 'pregnancy',
  menopause: 'women',
};

export const isNeed = (key) => NEED_KEYS.includes(key);
export const isKind = (key) => KIND_KEYS.includes(key);

/** Need key for a /shop/:stage slug (a need key or a legacy stage), or '' when unknown. */
export function needFromSlug(slug) {
  if (isNeed(slug)) return slug;
  return LEGACY_STAGES[slug] || '';
}

/** Keeps only known keys, in canonical order, without duplicates. */
export function orderNeeds(keys) {
  const list = Array.isArray(keys) ? keys : [];
  return NEED_KEYS.filter((key) => list.includes(key));
}

const has = (text, ...keys) => keys.some((key) => text.includes(key));

function needsOf(product) {
  const n = String(product?.name || '').toUpperCase();
  const brand = resolveBrand(product).slug;
  const fairhaven = brand === 'fairhaven-health';
  const out = new Set();
  if (has(n, 'FERTIL', 'MOTILITY', 'COUNTBOOST', 'OVABOOST', 'FH PRO', 'PQQ', 'BABYDANCE', 'МИО-ФОЛАТ') ||
      (fairhaven && n.includes('ИНОЗИТОЛ'))) out.add('fertility');
  if (has(n, 'ПРЕНАТАЛ', 'ЛАКТАЦ', 'МЕТИЛФОЛАТ', 'BABY')) out.add('pregnancy');
  if (has(n, 'МЕНОПАУЗ', 'ISOFRESH', 'ЖЕЛЕЗО', 'ХЕМА', 'ЖЕНЩИН', 'ИНОЗИТОЛ')) out.add('women');
  if (has(n, 'МУЖЧИН')) out.add('men');
  if (has(n, 'КОЛЛАГЕН', 'БИОТИН', 'ГИАЛУРОН', 'COLASTIN')) out.add('beauty');
  if (has(n, 'МАГНИЙ', 'НЕУРО', 'СТРЕСС', 'УЛЬТРА-МАГ', 'B-КОМПЛЕКС', 'В-КОМПЛЕКС')) out.add('sleep');
  // Children's D3 and C belong to "kids", not to the adult immunity shelf.
  if (has(n, 'ВИТАМИН Д', 'Д3', 'Д-3', 'Д 3', 'ЦИНК', 'ВИТАМИН С', 'ЙОД', 'МУЛЬТИВИТАМИНЫ И МИНЕРАЛЫ') &&
      !n.includes('KIDS')) out.add('immunity');
  if (has(n, 'ОМЕГА', 'РЫБИЙ', 'Q10', 'МОЗГ', 'НЕУРО', 'ДГК')) out.add('heart');
  if (has(n, 'ДАЙДЖЕСТ', 'ПСИЛЛИУМ', 'ПАПАЙ', 'ХЛОРОФРЕШ', 'ПРОБИОТИК')) out.add('digestion');
  if (has(n, 'БЕРБЕРИН', 'ХРОМ', 'WELLBETX')) out.add('metabolism');
  if (has(n, 'KIDS', 'КИДС', "KID'S", "BABY'S", 'BIGFRIENDS', 'ADDED ATTENTION') || brand === 'childlife') out.add('kids');
  if (has(n, 'КАЛЬЦИЙ', 'К2', 'K2')) out.add('bones');
  return NEED_KEYS.filter((key) => out.has(key));
}

// First match wins: a collagen with vitamin C is a collagen.
function kindOf(product) {
  const n = String(product?.name || '').toUpperCase();
  if (n.includes('BABYDANCE')) return 'intimate';
  if (has(n, 'КОЛЛАГЕН', 'COLASTIN')) return 'collagen';
  if (has(n, 'ОМЕГА', 'РЫБИЙ', 'ДГК')) return 'omega';
  if (has(n, 'ИНОЗИТОЛ', 'МИО-ФОЛАТ', 'PQQ')) return 'inositol';
  if (has(n, 'ДАЙДЖЕСТ', 'ПАПАЙ', 'ПРОБИОТИК', 'ISOFRESH')) return 'enzymes';
  if (has(n, 'БЕРБЕРИН', 'ЧАЙ', 'ХЛОРОФРЕШ', 'ПСИЛЛИУМ')) return 'herbal';
  if (has(n, 'МАГНИЙ', 'ЦИНК', 'ЖЕЛЕЗО', 'ХЕМА', 'ЙОД', 'КАЛЬЦИЙ', 'ХРОМ', 'УЛЬТРА-МАГ', 'НЕУРО')) return 'minerals';
  return 'vitamins';
}

/** {needs, kind} computed from the product name and brand. */
export function classify(product) {
  return { needs: needsOf(product), kind: kindOf(product) };
}
