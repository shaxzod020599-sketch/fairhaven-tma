const fs = require('fs');
const path = require('path');
const Product = require('../models/Product');
const Setting = require('../models/Setting');
const SiteContent = require('../models/SiteContent');
const { SURFACES } = require('../utils/surfaces');
const seo = require('../utils/seoPages');

// Same rule as the shop: only an explicit `approved: false` hides a product.
const LISTED = { approved: { $ne: false } };
const LIST_FIELDS = 'name price tags updatedAt';
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

/** Life-stage pages that have at least one product to show. */
async function stagesWithProducts(site) {
  const tags = new Set(await Product.distinct('tags', LISTED));
  return site.stages
    .map((stage) => ({ ...stage, path: `/shop/${stage.slug}` }))
    .filter((stage) => tags.has(stage.tag) && seo.PAGES.pages[stage.path])
    .map((stage) => ({ path: stage.path, h1: seo.PAGES.pages[stage.path].h1 }));
}

async function supportPhone() {
  const doc = await Setting.findOne({ key: 'support_phone' }).lean();
  return typeof doc?.value === 'string' ? doc.value : '';
}

function listProducts(filter = {}) {
  return Product.find({ ...LISTED, ...filter }).select(LIST_FIELDS).sort({ createdAt: -1 }).lean();
}

/** Loads what `pathname` shows and returns its meta, JSON-LD and snapshot. */
async function buildPage(site, pathname, bot) {
  const { matchRoute, privatePrefix, buildMeta } = site.meta;
  const route = matchRoute(pathname);
  const data = {};
  const ctx = {};

  if (!privatePrefix(seo.PAGES, route.path)) {
    if (route.kind === 'product') {
      if (OBJECT_ID.test(route.param)) {
        data.product = await Product.findOne({ _id: route.param, ...LISTED }).lean();
        ctx.product = data.product;
      }
    } else if (route.kind === 'post') {
      data.post = (await blogPosts(site)).find((post) => post.slug === route.param);
      ctx.post = data.post;
    } else {
      const stage = site.stages.find((s) => `/shop/${s.slug}` === route.path);
      if (stage) {
        ctx.products = await listProducts({ tags: stage.tag });
        data.empty = ctx.products.length === 0;
      }
      if (route.path === '/' || (bot && route.path === '/contact')) ctx.phone = await supportPhone();
      if (bot && (route.path === '/' || route.path === '/shop')) {
        [ctx.stages, ctx.products] = await Promise.all([stagesWithProducts(site), listProducts()]);
      }
      if (bot && (route.path === '/' || route.path === '/learn')) ctx.posts = await blogPosts(site);
    }
  }

  const meta = buildMeta(seo.PAGES, route.path, data);
  return {
    meta,
    structured: seo.structuredData(site, meta, { product: ctx.product, phone: ctx.phone }),
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
    const [products, stages, posts] = await Promise.all([
      Product.find(LISTED).select('_id updatedAt').sort({ createdAt: -1 }).lean(),
      stagesWithProducts(site),
      blogPosts(site),
    ]);
    const pages = Object.keys(seo.PAGES.pages).filter((p) => !p.startsWith('/shop/'));
    const entries = [
      ...pages.map((p) => ({ path: p })),
      ...stages.map((s) => ({ path: s.path })),
      ...products.map((p) => ({ path: `/product/${p._id}`, lastmod: p.updatedAt })),
      ...posts.map((post) => ({ path: `/learn/${post.slug}` })),
    ];
    res.set('Cache-Control', 'public, max-age=3600');
    return res.type('application/xml').send(seo.renderSitemap(entries));
  } catch (err) {
    return next(err);
  }
};
