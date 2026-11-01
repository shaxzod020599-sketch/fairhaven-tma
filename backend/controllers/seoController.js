const fs = require('fs');
const path = require('path');
const Product = require('../models/Product');
const Setting = require('../models/Setting');
const SiteContent = require('../models/SiteContent');
const { SURFACES } = require('../utils/surfaces');
const seo = require('../utils/seoPages');
// Same rule as the shop: only an explicit `approved: false` hides a product.
const { LISTED, PUBLIC_SELECT, catalogFields, toPublicProduct } = require('../utils/publicProduct');
const { NEED_KEYS } = require('../utils/catalog/taxonomy');

const OBJECT_ID = /^[a-f0-9]{24}$/i;

// nginx serves fairhaven.uz assets from its own copy of the build
// (PUBLIC_WEB_DIST); the HTML must come from that same build so its hashed
// script names exist.
function templateFile() {
  const dir = process.env.PUBLIC_WEB_DIST || SURFACES.find((s) => s.key === 'public').dist;
  return path.join(dir, 'index.html');
}

let template = { file: '', mtimeMs: 0, html: '' };
function readTemplate() {
  const file = templateFile();
  const { mtimeMs } = fs.statSync(file);
  if (template.file !== file || template.mtimeMs !== mtimeMs) {
    template = { file, mtimeMs, html: fs.readFileSync(file, 'utf8') };
  }
  return template.html;
}

/** Admin-managed posts (or the built-in defaults), then the health guides. */
async function blogPosts(site) {
  const doc = await SiteContent.findOne({ key: 'main' }).lean();
  const managed = Array.isArray(doc?.data?.blog) ? doc.data.blog : site.defaultPosts;
  return [...managed, ...site.guides].filter((post) => post?.slug && post?.ru?.title);
}

async function supportPhone() {
  const doc = await Setting.findOne({ key: 'support_phone' }).lean();
  return typeof doc?.value === 'string' ? doc.value : '';
}

/**
 * Every listed product in its public shape (display title, brand, needs),
 * newest first. Goals and brands are computed per product, not stored, so
 * goal and brand pages filter this list; the catalogue is about a hundred
 * products.
 */
async function listCatalog() {
  const docs = await Product.find(LISTED).select(`${PUBLIC_SELECT} updatedAt`).sort({ createdAt: -1 }).lean();
  return docs.map((doc) => ({ ...toPublicProduct(doc), updatedAt: doc.updatedAt }));
}

/** Goal pages with their product counts, in the site's order. */
function needsOf(products) {
  return NEED_KEYS.map((key) => ({
    key,
    path: `/shop/${key}`,
    h1: seo.PAGES.needs[key].h1,
    count: products.filter((p) => p.needs.includes(key)).length,
  }));
}

/** Brands with at least one listed product: most products first, then by name. */
function brandsOf(products) {
  const bySlug = new Map();
  for (const p of products) {
    if (!p.brandSlug) continue;
    const brand = bySlug.get(p.brandSlug) || { slug: p.brandSlug, name: p.brandName, count: 0 };
    brand.count += 1;
    bySlug.set(p.brandSlug, brand);
  }
  return [...bySlug.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/**
 * Loads what `pathname` shows and returns its meta, JSON-LD and snapshot,
 * or `{ redirect }` for an old URL that moved.
 */
async function buildPage(site, pathname, bot) {
  const { matchRoute, privatePrefix, buildMeta, needForSlug, legacyRedirect } = site.meta;
  const route = matchRoute(pathname);
  const data = {};
  const ctx = {};

  const moved = legacyRedirect(seo.PAGES, route.path);
  if (moved) return { redirect: moved };

  if (!privatePrefix(seo.PAGES, route.path)) {
    if (route.kind === 'product') {
      if (OBJECT_ID.test(route.param)) {
        const doc = await Product.findOne({ _id: route.param, ...LISTED }).lean();
        // The raw document keeps barcode and sku for the structured data.
        if (doc) data.product = { ...doc, ...catalogFields(doc) };
        ctx.product = data.product;
      }
    } else if (route.kind === 'post') {
      data.post = (await blogPosts(site)).find((post) => post.slug === route.param);
      ctx.post = data.post;
    } else if (route.kind === 'need') {
      const need = needForSlug(seo.PAGES, route.param);
      if (need) {
        ctx.products = (await listCatalog()).filter((p) => p.needs.includes(need));
        data.count = ctx.products.length;
      }
    } else if (route.kind === 'brand') {
      ctx.products = (await listCatalog()).filter((p) => p.brandSlug === route.param);
      if (ctx.products.length) {
        const [first] = ctx.products;
        data.brand = { slug: first.brandSlug, name: first.brandName, count: ctx.products.length };
      } else {
        data.notFound = true;
      }
    } else {
      if (route.path === '/' || (bot && route.path === '/contact')) ctx.phone = await supportPhone();
      if (bot && ['/', '/shop', '/brands'].includes(route.path)) {
        const products = await listCatalog();
        ctx.brands = brandsOf(products);
        if (route.path !== '/brands') {
          ctx.needs = needsOf(products).filter((n) => n.count > 0);
          ctx.products = products;
        }
      }
      if (bot && (route.path === '/' || route.path === '/learn')) ctx.posts = await blogPosts(site);
    }
  }

  const meta = buildMeta(seo.PAGES, route.path, data);
  const listed = route.kind === 'need' || route.kind === 'brand' ? ctx.products : undefined;
  return {
    meta,
    structured: seo.structuredData(site, meta, { product: ctx.product, phone: ctx.phone, products: listed }),
    snapshot: bot ? seo.renderSnapshot(site, meta, meta.status === 200 ? ctx : {}) : '',
  };
}

/**
 * Public-site HTML: the SPA shell with this URL's head tags, structured data
 * and, for crawlers, a plain snapshot. Unknown URLs answer 404.
 */
exports.renderPage = async (req, res, next) => {
  let html;
  try {
    html = readTemplate();
  } catch (err) {
    return next(err);
  }
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.set('Vary', 'User-Agent');
  try {
    const site = await seo.loadShared();
    const page = await buildPage(site, req.path, seo.isBot(req.get('user-agent')));
    if (page.redirect) {
      const query = req.originalUrl.indexOf('?');
      return res.redirect(301, page.redirect + (query === -1 ? '' : req.originalUrl.slice(query)));
    }
    const head = seo.renderHead(site, page.meta, page.structured);
    return res.status(page.meta.status).type('html').send(seo.injectTemplate(html, head, page.snapshot));
  } catch (err) {
    // The plain shell still works for people; only the search extras are lost.
    console.error(`[seo] ${req.path}: ${err.message}`);
    return res.type('html').send(html);
  }
};

/** GET /sitemap.xml — every indexable page, built from the live catalogue. */
exports.sitemap = async (_req, res, next) => {
  try {
    const site = await seo.loadShared();
    const [products, posts] = await Promise.all([listCatalog(), blogPosts(site)]);
    // Goal pages without products are noindex, so they stay out.
    const needs = needsOf(products).filter((n) => n.count > 0);
    const entries = [
      ...Object.keys(seo.PAGES.pages).map((p) => ({ path: p })),
      ...needs.map((n) => ({ path: n.path })),
      ...brandsOf(products).map((b) => ({ path: `/brands/${b.slug}` })),
      ...products.map((p) => ({ path: `/product/${p._id}`, lastmod: p.updatedAt })),
      ...posts.map((post) => ({ path: `/learn/${post.slug}` })),
    ];
    res.set('Cache-Control', 'public, max-age=3600');
    return res.type('application/xml').send(seo.renderSitemap(entries));
  } catch (err) {
    return next(err);
  }
};
