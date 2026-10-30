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

/** `{ kind: 'product' | 'post' | 'page', path, param }` for a URL path. */
export function matchRoute(pathname) {
  const path = normalizePath(pathname);
  const product = path.match(/^\/product\/([^/]+)$/);
  if (product) return { kind: 'product', path, param: decode(product[1]) };
  const post = path.match(/^\/learn\/([^/]+)$/);
  if (post) return { kind: 'post', path, param: decode(post[1]) };
  return { kind: 'page', path };
}

/** The noindex prefix a path falls under (`/order/123` → `/order`), if any. */
export function privatePrefix(cfg, pathname) {
  const path = normalizePath(pathname);
  return Object.keys(cfg.noindex).find((prefix) => path === prefix || path.startsWith(`${prefix}/`)) || '';
}

/** "FertilAid for Women, Fairhaven Health" — the brand only when the name lacks it. */
export function productLabel(product) {
  const name = cleanText(product?.name);
  const brand = cleanText(product?.brand);
  return brand && !name.toLowerCase().includes(brand.toLowerCase()) ? `${name}, ${brand}` : name;
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

/**
 * Everything the head needs for `pathname`. `data` carries what the page
 * loaded: `{ product }`, `{ post }`, `{ empty: true }` for a life-stage page
 * without products, or `{ notFound: true }`.
 */
export function buildMeta(cfg, pathname, data = {}) {
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
    const label = productLabel(product);
    const price = Number(product.price) > 0 ? ` — ${formatSum(product.price)}` : '';
    return {
      ...base,
      type: 'product',
      title: `${label} — ${cfg.product.titleTail}`,
      h1: cleanText(product.name),
      description: clip(`${label}${price}. ${cleanText(product.description)} ${cfg.product.descriptionTail}`),
      image: productImages(cfg, product)[0] || base.image,
    };
  }

  if (route.kind === 'post') {
    const copy = postCopy(data.post);
    if (!copy.title) return missing;
    return {
      ...base,
      type: 'article',
      title: `${cleanText(copy.title)} — ${cfg.post.titleTail}`,
      h1: cleanText(copy.title),
      description: clip(copy.excerpt || copy.body?.[0]),
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
