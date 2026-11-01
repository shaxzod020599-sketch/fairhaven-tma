/**
 * Catalogue search. Everything is compared in one folded Latin form: lower case, no diacritics, no
 * apostrophes, Cyrillic transliterated. So «солгар», «Solgar» and «SOLGAR» meet, as do Uzbek «magniy» and
 * Russian «магний». Synonym groups bridge different words for one thing (омега / omega / рыбий жир).
 * Ranking: the title starts with the query, then a brand match, then the number of token hits.
 */

const CYR = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  ў: 'o', қ: 'q', ғ: 'g', ҳ: 'h',
};

/** Folded Latin form used on both sides of every comparison. */
export function fold(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[’‘`ʼʻ']/g, '')
    .replace(/[Ѐ-ӿ]/g, (ch) => CYR[ch] ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    // Uzbek Latin x and Russian х (folded to h) are the same sound; ph and f too.
    .replace(/x/g, 'h')
    .replace(/ph/g, 'f')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Phrases that mean one thing; both the query and the product text get the short form added.
const PHRASES = [
  [/\bvitamin d ?3\b/g, 'd3'],
  [/\bvitamin d\b/g, 'd3'],
  [/\bd 3\b/g, 'd3'],
  [/\bk 2\b/g, 'k2'],
  [/\bb 12\b/g, 'b12'],
  [/\bco ?q ?10\b/g, 'q10'],
  [/\bryb[iy]+ zhir\b/g, 'omega'],
  [/\bfish oil\b/g, 'omega'],
  [/\bbaliq yog/g, 'omega'],
];

function withPhrases(folded) {
  let extra = '';
  for (const [re, short] of PHRASES) {
    re.lastIndex = 0;
    if (re.test(folded)) extra += ` ${short}`;
  }
  return extra ? `${folded}${extra}` : folded;
}

// Each group lists word starts (any language) that mean the same thing. Folded at load.
const SYNONYM_GROUPS = [
  ['омега', 'omega', 'рыбий', 'fish'],
  ['коллаген', 'collagen', 'kollagen'],
  ['магни', 'magnes', 'magniy'],
  ['d3', 'витамин д', 'vitamin d'],
  ['цинк', 'zinc', 'rux'],
  ['желез', 'iron', 'temir'],
  ['инозит', 'inosit', 'inozit', 'myo', 'мио'],
  ['фолат', 'фолиев', 'folat', 'folic', 'folate'],
  ['пробиот', 'probiot'],
  ['фермент', 'enzym', 'ferment', 'дайджест', 'digest'],
  ['детск', 'kids', 'kid', 'child', 'bolalar', 'baby', 'кидс'],
  ['q10', 'коэнзим', 'coenzym', 'koenzim', 'coq10'],
  ['кальци', 'calcium', 'kalsiy', 'kaltsiy'],
  ['йод', 'iodine', 'yod'],
  ['биотин', 'biotin'],
].map((group) => [...new Set(group.map(fold))]);

/** Alternative word starts for one query token (the token itself first). */
export function expandToken(token) {
  const out = [token];
  if (token.length < 2) return out;
  for (const group of SYNONYM_GROUPS) {
    const hit = group.some((stem) => token.startsWith(stem) || (token.length >= 3 && stem.startsWith(token)));
    if (hit) for (const stem of group) if (!out.includes(stem)) out.push(stem);
  }
  return out;
}

/** Query tokens, each with its alternatives. Empty when the query has nothing searchable. */
export function parseQuery(query) {
  const folded = fold(query);
  if (!folded) return [];
  let text = folded;
  for (const [re, short] of PHRASES) text = text.replace(re, short);
  return text.split(' ').filter(Boolean).map((token) => ({ token, alts: expandToken(token) }));
}

/** Folded text of a product, by field weight. Built once per product (see buildIndex). */
export function indexProduct(product, labels) {
  const title = withPhrases(fold(`${product.title || ''} ${product.titleUz || ''}`));
  const brand = fold(product.brandName || product.brand || '');
  const words = [product.name, product.nameUz, product.spec, product.specUz, ...(product.tags || [])];
  if (labels) {
    for (const key of product.needs || []) words.push(labels(`need.${key}`));
    if (product.kind) words.push(labels(`kind.${product.kind}`));
  }
  const rest = withPhrases(fold(words.filter(Boolean).join(' ')));
  return { title, brand, rest };
}

// True when `stem` starts a word in `text`.
function startsWord(text, stem) {
  if (!stem) return false;
  let at = text.indexOf(stem);
  while (at !== -1) {
    if (at === 0 || text[at - 1] === ' ') return true;
    at = text.indexOf(stem, at + 1);
  }
  return false;
}

const hitIn = (text, alts) => alts.some((stem) => startsWord(text, stem));

/** Relevance of one product, or 0 when some query token is not found anywhere. */
export function scoreProduct(entry, tokens, folded) {
  let hits = 0;
  let brandHit = false;
  for (const { alts } of tokens) {
    const inTitle = hitIn(entry.title, alts);
    const inBrand = hitIn(entry.brand, alts);
    if (!inTitle && !inBrand && !hitIn(entry.rest, alts)) return 0;
    if (inBrand) brandHit = true;
    hits += inTitle ? 3 : 1;
  }
  const prefix = folded && entry.title.startsWith(folded) ? 1 : 0;
  return prefix * 10000 + (brandHit ? 1000 : 0) + hits;
}

/**
 * Products matching every query token, best first; ties keep the given (API) order.
 * `index` is a Map from product to its indexProduct() entry; missing entries are built on the fly.
 */
export function searchProducts(products, query, index) {
  const tokens = parseQuery(query);
  if (!tokens.length) return products;
  const folded = tokens.map((t) => t.token).join(' ');
  const scored = [];
  products.forEach((product, order) => {
    const entry = index?.get(product) || indexProduct(product);
    const score = scoreProduct(entry, tokens, folded);
    if (score > 0) scored.push({ product, score, order });
  });
  scored.sort((a, b) => b.score - a.score || a.order - b.order);
  return scored.map((s) => s.product);
}

/** A Map product -> index entry for a list, so repeated searches do not refold every product. */
export function buildIndex(products, labels) {
  const map = new Map();
  for (const product of products) map.set(product, indexProduct(product, labels));
  return map;
}
