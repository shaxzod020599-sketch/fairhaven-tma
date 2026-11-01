/**
 * Health goals ("needs") and product kinds for the public catalogue.
 *
 * Computed from the raw product name, because the catalogue has no such
 * fields yet and Billz names carry the active ingredient. An admin can store
 * `needs` / `kind` on a product; stored values win (see utils/publicProduct.js).
 * Keys are stable: the site's URLs and labels are built on them.
 */
const { resolveBrand } = require('./brands');

// Canonical order, as the site lists them.
const NEED_KEYS = [
  'fertility', 'pregnancy', 'women', 'men', 'beauty', 'sleep',
  'immunity', 'heart', 'digestion', 'metabolism', 'kids', 'bones',
];
const KIND_KEYS = ['vitamins', 'minerals', 'omega', 'collagen', 'inositol', 'herbal', 'enzymes', 'intimate'];

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
function classify(product) {
  return { needs: needsOf(product), kind: kindOf(product) };
}

module.exports = { NEED_KEYS, KIND_KEYS, classify };
