/**
 * Brand registry for the public catalogue.
 *
 * `Product.brand` is free text typed in Billz and the admin panel, so one
 * brand arrives under several spellings ("NATURES PLUS", "Nature's Plus",
 * "JARROW"). The site needs one display name and one stable URL slug per
 * brand; the raw field stays untouched because integrations match on it.
 */

const BRANDS = [
  { slug: 'fairhaven-health', name: 'Fairhaven Health', country: 'US', aliases: ['FAIRHAVEN HEALTH', 'FAIRHAVEN', 'FAIR HAVEN HEALTH'] },
  { slug: 'solgar', name: 'Solgar', country: 'US', aliases: ['SOLGAR'] },
  { slug: 'now-foods', name: 'NOW Foods', country: 'US', aliases: ['NOW FOODS', 'NOW'] },
  { slug: 'carlson', name: 'Carlson', country: 'US', aliases: ['CARLSON', 'CARLSON LABS'] },
  { slug: 'natural-factors', name: 'Natural Factors', country: 'CA', aliases: ['NATURAL FACTORS'] },
  { slug: 'solaray', name: 'Solaray', country: 'US', aliases: ['SOLARAY'] },
  { slug: 'natures-plus', name: "Nature's Plus", country: 'US', aliases: ['NATURES PLUS', "NATURE'S PLUS", 'NATURESPLUS'] },
  { slug: 'sports-research', name: 'Sports Research', country: 'US', aliases: ['SPORTS RESEARCH'] },
  { slug: 'enzymedica', name: 'Enzymedica', country: 'US', aliases: ['ENZYMEDICA'] },
  { slug: 'vital-proteins', name: 'Vital Proteins', country: 'US', aliases: ['VITAL PROTEINS'] },
  { slug: 'life-extension', name: 'Life Extension', country: 'US', aliases: ['LIFE EXTENSION'] },
  { slug: 'childlife', name: 'ChildLife', country: 'US', aliases: ['CHILDLIFE', 'CHILD LIFE', 'CHILDLIFE ESSENTIALS'] },
  // Country of origin is not established for Colastin; the site shows nothing.
  { slug: 'colastin', name: 'Colastin', country: null, aliases: ['COLASTIN'] },
  { slug: 'jarrow-formulas', name: 'Jarrow Formulas', country: 'US', aliases: ['JARROW FORMULAS', 'JARROW'] },
  { slug: 'life-flo', name: 'Life-flo', country: 'US', aliases: ['LIFE FLO', 'LIFE-FLO', 'LIFEFLO'] },
  { slug: 'youtheory', name: 'Youtheory', country: 'US', aliases: ['YOUTHEORY'] },
  { slug: 'natures-way', name: "Nature's Way", country: 'US', aliases: ["NATURE'S WAY", 'NATURES WAY'] },
  { slug: 'california-gold-nutrition', name: 'California Gold Nutrition', country: 'US', aliases: ['CALIFORNIA GOLD NUTRITION', 'CALIFORNIA GOLD'] },
  { slug: 'source-naturals', name: 'Source Naturals', country: 'US', aliases: ['SOURCE NATURALS'] },
  { slug: 'buried-treasure', name: 'Buried Treasure', country: 'US', aliases: ['BURIED TREASURE'] },
];

// Compares spellings by letters and digits only: "Nature’s Plus", "NATURES
// PLUS" and "natures-plus" are the same brand.
function compact(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[’`ʼ]/g, "'")
    .replace(/[^\p{L}\p{N}]/gu, '');
}

const BY_COMPACT = new Map();
for (const brand of BRANDS) {
  for (const alias of [brand.name, brand.slug, ...brand.aliases]) BY_COMPACT.set(compact(alias), brand);
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// A brand spelled inside a product name, e.g. "МОРСКОЙ КОЛЛАГЕН VITAL PROTEINS
// 221 G". "NOW" alone is an ordinary English word, so it never counts here.
function aliasPattern(alias) {
  const body = escapeRegex(alias)
    .replace(/'/g, "['’`ʼ]?")
    .replace(/[ -]/g, '[\\s-]*');
  return new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, 'giu');
}

const NAME_PATTERNS = BRANDS.flatMap((brand) =>
  brand.aliases
    .filter((alias) => alias !== 'NOW')
    .sort((a, b) => b.length - a.length)
    .map((alias) => ({ brand, re: aliasPattern(alias) }))
);

const CYRILLIC = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[’`ʼ']/g, '')
    .replace(/[а-яё]/g, (ch) => CYRILLIC[ch])
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function titleCase(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/(^|[\s-])(\p{L})/gu, (_m, sep, ch) => sep + ch.toUpperCase());
}

/** The registry entry for a brand field, or an automatic one for a new brand. */
function brandFromField(field) {
  const raw = String(field || '').trim();
  if (!raw) return null;
  const known = BY_COMPACT.get(compact(raw));
  if (known) return known;
  const name = titleCase(raw);
  return { slug: slugify(name), name, country: null, aliases: [raw.toUpperCase()] };
}

/** Every known brand spelled in a product name, longest spelling first. */
function brandsInName(name) {
  const text = String(name || '');
  const found = [];
  for (const { brand, re } of NAME_PATTERNS) {
    re.lastIndex = 0;
    if (re.test(text) && !found.includes(brand)) found.push(brand);
  }
  return found;
}

/**
 * The brand a product really belongs to. A name that spells a different known
 * brand than the brand field wins: the field is sometimes copied from the
 * previous card (a Vital Proteins collagen was filed under Fairhaven Health).
 */
function resolveBrand(product) {
  const fromField = brandFromField(product?.brand);
  const inName = brandsInName(product?.name);
  const brand = fromField && (inName.length === 0 || inName.includes(fromField))
    ? fromField
    : inName[0] || fromField;
  if (!brand) return { slug: '', name: '', country: null };
  return { slug: brand.slug, name: brand.name, country: brand.country };
}

/** Removes every spelling of every known brand (and of `extra`) from a name. */
function stripBrands(text, extra) {
  let out = String(text || '');
  for (const { re } of NAME_PATTERNS) out = out.replace(re, ' ');
  const own = String(extra || '').trim();
  if (own && !BY_COMPACT.has(compact(own))) out = out.replace(aliasPattern(own.toUpperCase()), ' ');
  return out;
}

module.exports = { BRANDS, resolveBrand, brandFromField, brandsInName, stripBrands, slugify };
