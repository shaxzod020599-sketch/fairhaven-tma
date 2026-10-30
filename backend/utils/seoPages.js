/**
 * Search-engine HTML for fairhaven.uz.
 *
 * The public site is a client-rendered SPA, so every URL used to answer with
 * the same empty shell: one title, one description and a canonical pointing at
 * the homepage, which told Google that every page was a copy of the homepage.
 * These helpers fill the shell per URL: head tags, structured data (JSON-LD),
 * a plain-HTML snapshot of the page for crawlers, and the sitemap.
 *
 * Titles and descriptions come from the site's own web/src/seo/meta.js, so the
 * first HTML and the page after it loads never disagree. Pure: no database.
 */
const path = require('path');
const { pathToFileURL } = require('url');
const PAGES = require('../../web/src/seo/pages.json');

const WEB_SRC = path.resolve(__dirname, '../../web/src');
const SEO_START = '<!--seo:start-->';
const SEO_END = '<!--seo:end-->';
const ROOT = '<div id="root"></div>';

// Search engines and link-preview fetchers ("Googlebot", "YandexBot",
// "TelegramBot", "bingbot"…). Kept narrow on purpose: in-app browsers such as
// "Telegram-Android" or "YandexSearch" belong to people. A human matched by
// mistake only sees the snapshot until the app replaces it.
const BOT_UA = /bot\b|crawler|spider|slurp|googleother|google-inspectiontool|yandeximages|facebookexternalhit|whatsapp\/|vkshare|embedly/i;

function isBot(userAgent) {
  return BOT_UA.test(String(userAgent || ''));
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

let shared = null;

/** The site's own ES modules (meta rules, blog posts, life stages), loaded once. */
function loadShared() {
  if (!shared) {
    const load = (file) => import(pathToFileURL(path.join(WEB_SRC, file)).href);
    shared = Promise.all([
      load('seo/meta.js'),
      load('content/defaults.js'),
      load('content/guides.js'),
      load('helpers.js'),
    ])
      .then(([meta, defaults, guides, helpers]) => ({
        meta,
        defaultPosts: defaults.DEFAULT_CONTENT.blog,
        guides: guides.GUIDES,
        stages: helpers.LIFE_STAGES,
      }))
      .catch((err) => {
        shared = null;
        throw err;
      });
  }
  return shared;
}

function renderHead(site, meta, structured = []) {
  const tags = site.meta.headTags(meta)
    .filter(([, , , value]) => value)
    .map(([element, keyAttr, key, value]) => (element === 'link'
      ? `<link ${keyAttr}="${key}" href="${escapeHtml(value)}" />`
      : `<meta ${keyAttr}="${key}" content="${escapeHtml(value)}" />`));
  const scripts = structured.map((data) => (
    `<script type="application/ld+json" data-path="${escapeHtml(meta.path)}">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`
  ));
  return [`<title>${escapeHtml(meta.title)}</title>`, ...tags, ...scripts].join('\n    ');
}

/** Swap the marked head block, and put `body` inside #root when given. */
function injectTemplate(template, head, body = '') {
  let html = template;
  const start = html.indexOf(SEO_START);
  const end = html.indexOf(SEO_END);
  if (start !== -1 && end > start) {
    html = `${html.slice(0, start)}${head}${html.slice(end + SEO_END.length)}`;
  }
  return body ? html.replace(ROOT, () => `<div id="root">${body}</div>`) : html;
}

function breadcrumbs(meta) {
  const trail = [['Главная', '/']];
  if (/^\/(shop|product)\//.test(meta.path)) trail.push(['Каталог', '/shop']);
  if (meta.path.startsWith('/learn/')) trail.push(['Блог', '/learn']);
  trail.push([meta.h1 || meta.title, meta.path]);
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map(([name, url], index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name,
      item: `${PAGES.origin}${url}`,
    })),
  };
}

function organization(phone) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'OnlineStore',
    name: PAGES.siteName,
    url: `${PAGES.origin}/`,
    logo: `${PAGES.origin}/apple-touch-icon.png`,
    image: `${PAGES.origin}${PAGES.defaultImage}`,
    address: { '@type': 'PostalAddress', addressLocality: 'Ташкент', addressCountry: 'UZ' },
    areaServed: 'UZ',
  };
  if (phone) data.telephone = phone;
  return data;
}

function productData(site, meta, product) {
  const { cleanText, clip, productImages } = site.meta;
  const images = productImages(PAGES, product);
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: cleanText(product.name),
    description: clip(product.description, 5000) || meta.description,
    image: images.length ? images : [meta.image],
    url: meta.canonical,
  };
  if (cleanText(product.brand)) data.brand = { '@type': 'Brand', name: cleanText(product.brand) };
  if (cleanText(product.sku)) data.sku = cleanText(product.sku);
  if (/^(\d{8}|\d{12,14})$/.test(product.barcode || '')) data.gtin = product.barcode;
  if (Number(product.price) > 0) {
    data.offers = {
      '@type': 'Offer',
      url: meta.canonical,
      price: Number(product.price),
      priceCurrency: 'UZS',
      availability: `https://schema.org/${product.isAvailable === false ? 'OutOfStock' : 'InStock'}`,
      itemCondition: 'https://schema.org/NewCondition',
      seller: { '@type': 'Organization', name: PAGES.siteName },
    };
  }
  return data;
}

function articleData(meta) {
  const publisher = {
    '@type': 'Organization',
    name: PAGES.siteName,
    url: `${PAGES.origin}/`,
    logo: { '@type': 'ImageObject', url: `${PAGES.origin}/apple-touch-icon.png` },
  };
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: meta.h1,
    description: meta.description,
    image: meta.image,
    inLanguage: 'ru',
    mainEntityOfPage: meta.canonical,
    author: publisher,
    publisher,
  };
}

/** JSON-LD blocks for an indexable page; none for 404s and private pages. */
function structuredData(site, meta, { product, phone } = {}) {
  if (meta.status !== 200 || meta.robots.startsWith('noindex')) return [];
  if (meta.path === '/') {
    return [
      organization(phone),
      { '@context': 'https://schema.org', '@type': 'WebSite', name: PAGES.siteName, url: `${PAGES.origin}/`, inLanguage: 'ru' },
    ];
  }
  if (meta.type === 'product' && product) return [productData(site, meta, product), breadcrumbs(meta)];
  if (meta.type === 'article') return [articleData(meta), breadcrumbs(meta)];
  return [breadcrumbs(meta)];
}

const link = (href, text) => `<a href="${escapeHtml(href)}">${escapeHtml(text)}</a>`;

/**
 * Plain HTML of the page for crawlers, rendered inside #root. React replaces
 * it on start, so people never see it; it gives search engines the same text,
 * links and prices the app shows.
 */
function renderSnapshot(site, meta, ctx = {}) {
  const { cleanText, formatSum, productImages, postCopy } = site.meta;
  const nav = [['/shop', 'Каталог'], ['/learn', 'Блог'], ['/about', 'О компании'], ['/contact', 'Контакты'], ['/faq', 'Вопросы и ответы']];
  const main = [`<h1>${escapeHtml(meta.h1 || meta.title)}</h1>`];

  if (ctx.product) {
    const p = ctx.product;
    const image = productImages(PAGES, p)[0];
    if (image) main.push(`<img src="${escapeHtml(image)}" alt="${escapeHtml(cleanText(p.name))}" />`);
    if (Number(p.price) > 0) main.push(`<p>Цена: ${escapeHtml(formatSum(p.price))}</p>`);
    main.push(`<p>${p.isAvailable === false ? 'Нет в наличии' : 'В наличии'}</p>`);
    if (cleanText(p.brand)) main.push(`<p>Бренд: ${escapeHtml(cleanText(p.brand))}</p>`);
    String(p.description || '').split(/\n+/).map(cleanText).filter(Boolean)
      .forEach((para) => main.push(`<p>${escapeHtml(para)}</p>`));
  } else if (ctx.post) {
    (postCopy(ctx.post).body || []).map(cleanText).filter(Boolean)
      .forEach((para) => main.push(`<p>${escapeHtml(para)}</p>`));
  } else {
    main.push(`<p>${escapeHtml(meta.description)}</p>`);
  }

  if (ctx.phone) main.push(`<p>Телефон: ${escapeHtml(ctx.phone)}</p>`);
  if (ctx.stages?.length) {
    main.push(`<h2>Подбор по этапу</h2><ul>${ctx.stages.map((s) => `<li>${link(s.path, s.h1)}</li>`).join('')}</ul>`);
  }
  if (ctx.products?.length) {
    const items = ctx.products.map((p) => (
      `<li>${link(`/product/${p._id}`, cleanText(p.name))}${Number(p.price) > 0 ? ` — ${escapeHtml(formatSum(p.price))}` : ''}</li>`
    ));
    main.push(`<h2>Товары</h2><ul>${items.join('')}</ul>`);
  }
  if (ctx.posts?.length) {
    const items = ctx.posts.map((post) => {
      const copy = postCopy(post);
      return `<li>${link(`/learn/${post.slug}`, cleanText(copy.title))}${copy.excerpt ? ` — ${escapeHtml(cleanText(copy.excerpt))}` : ''}</li>`;
    });
    main.push(`<h2>Статьи</h2><ul>${items.join('')}</ul>`);
  }

  return `<header>${link('/', PAGES.siteName)}<nav>${nav.map(([href, text]) => link(href, text)).join(' ')}</nav></header>`
    + `<main>${main.join('')}</main>`;
}

/** `entries`: `[{ path, lastmod? }]`, duplicates dropped. */
function renderSitemap(entries) {
  const seen = new Set();
  const urls = [];
  for (const { path: urlPath, lastmod } of entries) {
    if (seen.has(urlPath)) continue;
    seen.add(urlPath);
    const date = lastmod ? new Date(lastmod) : null;
    const stamp = date && !Number.isNaN(date.getTime()) ? `<lastmod>${date.toISOString().slice(0, 10)}</lastmod>` : '';
    urls.push(`  <url><loc>${escapeHtml(`${PAGES.origin}${urlPath}`)}</loc>${stamp}</url>`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

module.exports = {
  PAGES,
  escapeHtml,
  injectTemplate,
  isBot,
  loadShared,
  renderHead,
  renderSitemap,
  renderSnapshot,
  structuredData,
};
