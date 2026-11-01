/**
 * Title, description, canonical and robots rules for every fairhaven.uz page.
 *
 * Shared by the site (applied after each in-app navigation) and the backend
 * (written into the first HTML a search engine receives), so the two never
 * disagree. Pure and import-free: callers pass in the pages.json config.
 */

const INDEX = 'index, follow, max-image-preview:large';
const NOINDEX = 'noindex, nofollow';
const NOINDEX_FOLLOW = 'noindex, follow';

export function normalizePath(pathname) {
  const clean = String(pathname || '/').split(/[?#]/)[0].replace(/\/+$/, '');
  return clean || '/';
}

export function cleanText(value) {
  return String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Shorten to `max` characters on a word boundary. */
export function clip(value, max = 160) {
  const text = cleanText(value);
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:—–-]+$/, '')}…`;
}

export function formatSum(amount) {
  return `${String(Math.round(Number(amount) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} сум`;
}

export function absoluteUrl(origin, url) {
  const value = String(url || '');
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  return `${origin}${value.startsWith('/') ? '' : '/'}${value}`;
}

function decode(value) {
  try {
    return decodeURIComponent(value);
  } catch (_) {
    return value;
  }
}

/** `{ kind: 'product' | 'post' | 'need' | 'brand' | 'page', path, param }` for a URL path. */
export function matchRoute(pathname) {
  const path = normalizePath(pathname);
  const product = path.match(/^\/product\/([^/]+)$/);
  if (product) return { kind: 'product', path, param: decode(product[1]) };
  const post = path.match(/^\/learn\/([^/]+)$/);
  if (post) return { kind: 'post', path, param: decode(post[1]) };
  const need = path.match(/^\/shop\/([^/]+)$/);
  if (need) return { kind: 'need', path, param: decode(need[1]) };
  const brand = path.match(/^\/brands\/([^/]+)$/);
  if (brand) return { kind: 'brand', path, param: decode(brand[1]) };
  return { kind: 'page', path };
}

/**
 * The need key a /shop/<slug> URL shows, or ''. Old life-stage slugs
 * (`pregnant`, `fertility-women`…) map to a need; their URL is no longer
 * canonical, so the server answers 301 and the app navigates with replace.
 */
export function needForSlug(cfg, slug) {
  if (cfg.needs[slug]) return slug;
  return cfg.legacyStages[slug] || '';
}

/** `/shop/<need>` when `pathname` is an old life-stage URL, else ''. */
export function legacyRedirect(cfg, pathname) {
  const route = matchRoute(pathname);
  if (route.kind !== 'need' || cfg.needs[route.param]) return '';
  const need = cfg.legacyStages[route.param];
  return need ? `/shop/${need}` : '';
}

/** The noindex prefix a path falls under (`/order/123` → `/order`), if any. */
export function privatePrefix(cfg, pathname) {
  const path = normalizePath(pathname);
  return Object.keys(cfg.noindex).find((prefix) => path === prefix || path.startsWith(`${prefix}/`)) || '';
}

/**
 * Em and en dashes are not used in FairHaven copy. Product and post texts
 * come from people, so titles and descriptions are cleaned of them: a range
 * keeps a hyphen ("1–3" → "1-3"), any other dash becomes a comma.
 */
export function undash(value) {
  return String(value ?? '')
    .replace(/(\d)\s*[–—]\s*(?=\d)/g, '$1-')
    .replace(/\s*[–—]+\s*/g, ', ')
    .replace(/,\s*([,.:;!?])/g, '$1')
    .replace(/^,\s*|,\s*$/g, '')
    .trim();
}

/** Display title from the API (`title`), else the raw name. */
export function productTitle(product) {
  return cleanText(product?.title) || cleanText(product?.name);
}

/** Canonical brand from the API (`brandName`), else the raw field. */
export function productBrand(product) {
  return cleanText(product?.brandName) || cleanText(product?.brand);
}

/** "Магний глицинат · Natural Factors": the brand only when the title lacks it. */
export function productLabel(product, separator = ' · ') {
  const title = productTitle(product);
  const brand = productBrand(product);
  return brand && !title.toLowerCase().includes(brand.toLowerCase()) ? `${title}${separator}${brand}` : title;
}

/** "1 товар", "24 товара", "106 товаров". */
export function itemCount(count) {
  const n = Math.abs(Math.trunc(Number(count) || 0));
  const tens = n % 100;
  const ones = n % 10;
  const word = tens >= 11 && tens <= 14 ? 'товаров'
    : ones === 1 ? 'товар'
    : ones >= 2 && ones <= 4 ? 'товара'
    : 'товаров';
  return `${n} ${word}`;
}

const hasCount = (count) => Number.isInteger(count) && count >= 0;

/** Whole sentences, in order, while they fit a search snippet (~200 chars). */
function sentences(parts, max = 200) {
  let text = '';
  for (const part of parts.filter(Boolean)) {
    const next = text ? `${text} ${part}` : part;
    if (text && next.length > max) break;
    text = next;
  }
  return text;
}

export function productImages(cfg, product) {
  const list = [product?.imageUrl, ...(Array.isArray(product?.images) ? product.images : [])]
    .filter(Boolean)
    .map((url) => absoluteUrl(cfg.origin, url));
  return [...new Set(list)];
}

/** Russian copy of a blog entry (admin-managed or built-in guide). */
export function postCopy(post) {
  return post?.ru || {};
}

const withSite = (cfg, text) => `${text} | ${cfg.siteName}`;

/** Same `meta` with dash-free title and description. */
function tidy(meta) {
  return { ...meta, title: undash(meta.title), description: undash(meta.description) };
}

/**
 * Everything the head needs for `pathname`. `data` carries what the page
 * loaded: `{ product }`, `{ post }`, `{ need, count }` for /shop/<need>,
 * `{ brand: { slug, name, count } }` for /brands/<slug>, or
 * `{ notFound: true }`. `{ empty: true }` (or `count: 0`) keeps a goal page
 * without products out of the index.
 */
export function buildMeta(cfg, pathname, data = {}) {
  return tidy(rawMeta(cfg, pathname, data || {}));
}

function rawMeta(cfg, pathname, data) {
  const route = matchRoute(pathname);
  const home = cfg.pages['/'];
  const base = {
    path: route.path,
    siteName: cfg.siteName,
    canonical: `${cfg.origin}${route.path}`,
    image: absoluteUrl(cfg.origin, cfg.defaultImage),
    type: 'website',
    robots: INDEX,
    status: 200,
  };
  const missing = {
    ...base,
    ...cfg.notFound,
    canonical: '',
    robots: NOINDEX,
    status: 404,
  };

  const prefix = privatePrefix(cfg, route.path);
  if (prefix) {
    return { ...base, title: cfg.noindex[prefix], h1: '', description: home.description, canonical: '', robots: NOINDEX };
  }
  if (data.notFound) return missing;

  if (route.kind === 'product') {
    const { product } = data;
    if (!product) return missing;
    const price = Number(product.price) > 0 ? `, ${formatSum(product.price)}` : '';
    return {
      ...base,
      type: 'product',
      title: withSite(cfg, productLabel(product)),
      h1: productTitle(product),
      description: clip(undash(`${productLabel(product, ', ')}${price}. ${cleanText(product.description)} ${cfg.product.descriptionTail}`)),
      image: productImages(cfg, product)[0] || base.image,
    };
  }

  if (route.kind === 'post') {
    const copy = postCopy(data.post);
    if (!copy.title) return missing;
    return {
      ...base,
      type: 'article',
      title: withSite(cfg, cleanText(copy.title)),
      h1: cleanText(copy.title),
      description: clip(undash(copy.excerpt || copy.body?.[0])),
    };
  }

  if (route.kind === 'need') {
    const need = needForSlug(cfg, route.param);
    if (!need) return missing;
    const copy = cfg.needs[need];
    const count = hasCount(data.count) ? data.count : null;
    return {
      ...base,
      canonical: `${cfg.origin}/shop/${need}`,
      title: withSite(cfg, count ? `${copy.h1}: ${itemCount(count)}` : copy.h1),
      h1: copy.h1,
      description: sentences([copy.description, count ? `В подборке ${itemCount(count)}.` : '', cfg.listTail]),
      robots: data.empty || count === 0 ? NOINDEX_FOLLOW : INDEX,
    };
  }

  if (route.kind === 'brand') {
    const brand = data.brand;
    const name = cleanText(brand?.name);
    const count = hasCount(brand?.count) ? brand.count : null;
    // A brand without products on sale has no page.
    if (!name || count === 0) return missing;
    const slug = cleanText(brand.slug) || route.param;
    const fill = (text) => text.replace(/\{name\}/g, name);
    const lead = cfg.brand.overrides[slug]?.description || fill(cfg.brand.description);
    const heading = fill(cfg.brand.heading);
    return {
      ...base,
      canonical: `${cfg.origin}/brands/${encodeURIComponent(slug)}`,
      title: withSite(cfg, count ? `${heading}: ${itemCount(count)}` : heading),
      h1: name,
      description: sentences([lead, count ? `В каталоге ${itemCount(count)}.` : '', cfg.listTail]),
    };
  }

  const page = cfg.pages[route.path];
  if (!page) return missing;
  return {
    ...base,
    title: page.title,
    h1: page.h1,
    description: page.description,
    robots: data.empty ? NOINDEX_FOLLOW : INDEX,
  };
}

/**
 * Head tags as `[element, keyAttribute, key, value]`. An empty value means
 * the tag must be absent (no canonical on a 404, no robots override…).
 */
export function headTags(meta) {
  return [
    ['meta', 'name', 'description', meta.description],
    ['meta', 'name', 'robots', meta.robots],
    ['link', 'rel', 'canonical', meta.canonical],
    ['meta', 'property', 'og:type', meta.type],
    ['meta', 'property', 'og:locale', 'ru_RU'],
    ['meta', 'property', 'og:site_name', meta.siteName],
    ['meta', 'property', 'og:url', meta.canonical],
    ['meta', 'property', 'og:title', meta.title],
    ['meta', 'property', 'og:description', meta.description],
    ['meta', 'property', 'og:image', meta.image],
    ['meta', 'name', 'twitter:card', 'summary_large_image'],
    ['meta', 'name', 'twitter:title', meta.title],
    ['meta', 'name', 'twitter:description', meta.description],
    ['meta', 'name', 'twitter:image', meta.image],
  ];
}
