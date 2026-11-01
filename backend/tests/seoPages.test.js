const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const seo = require('../utils/seoPages');

const PRODUCT = {
  _id: '65a1b2c3d4e5f60718293a4b',
  name: 'FertilAid for Women',
  brand: 'Fairhaven Health',
  price: 450000,
  description: 'Комплекс для женской фертильности.',
  imageUrl: '/uploads/fertilaid.jpg',
  barcode: '0811810010110',
  isAvailable: true,
};

// Same shape as the public API: display title and canonical brand next to the raw fields.
const DISPLAYED = {
  ...PRODUCT,
  name: 'МАГНИЙ ГЛИЦИНАТ 120 МГ КАПС. №90 NATURAL FACTORS',
  brand: 'NATURAL FACTORS',
  title: 'Магний глицинат 120 мг · 90 капсул',
  brandName: 'Natural Factors',
  brandSlug: 'natural-factors',
  spec: '120 мг · 90 капсул',
  description: 'Хелатная форма — мягкая для желудка. Курс 1–3 месяца.',
};

const DASHES = /[–—]/;

test('a product page gets its own title, canonical and Product data in UZS', async () => {
  const site = await seo.loadShared();
  const meta = site.meta.buildMeta(seo.PAGES, `/product/${PRODUCT._id}/`, { product: PRODUCT });

  assert.equal(meta.status, 200);
  assert.equal(meta.title, 'FertilAid for Women · Fairhaven Health | FairHaven');
  assert.equal(meta.canonical, `https://fairhaven.uz/product/${PRODUCT._id}`);
  assert.equal(meta.image, 'https://fairhaven.uz/uploads/fertilaid.jpg');
  assert.match(meta.description, /^FertilAid for Women, Fairhaven Health, 450 000 сум\. Комплекс/);

  const [product, crumbs] = seo.structuredData(site, meta, { product: PRODUCT });
  assert.equal(product['@type'], 'Product');
  assert.equal(product.offers.priceCurrency, 'UZS');
  assert.equal(product.offers.price, 450000);
  assert.equal(product.offers.availability, 'https://schema.org/InStock');
  assert.equal(product.gtin, '0811810010110');
  assert.deepEqual(crumbs.itemListElement.map((item) => item.name), ['Главная', 'Каталог', 'FertilAid for Women']);

  const sold = seo.structuredData(site, meta, { product: { ...PRODUCT, isAvailable: false } })[0];
  assert.equal(sold.offers.availability, 'https://schema.org/OutOfStock');
});

test('a product is named by its display title and brand, never the raw name', async () => {
  const site = await seo.loadShared();
  const meta = site.meta.buildMeta(seo.PAGES, `/product/${PRODUCT._id}`, { product: DISPLAYED });

  assert.equal(meta.title, 'Магний глицинат 120 мг · 90 капсул · Natural Factors | FairHaven');
  assert.equal(meta.h1, 'Магний глицинат 120 мг · 90 капсул');
  assert.doesNotMatch(meta.title + meta.description, DASHES);
  assert.match(meta.description, /Хелатная форма, мягкая для желудка\. Курс 1-3 месяца\./);

  const [product] = seo.structuredData(site, meta, { product: DISPLAYED });
  assert.equal(product.name, 'Магний глицинат 120 мг · 90 капсул');
  assert.deepEqual(product.brand, { '@type': 'Brand', name: 'Natural Factors' });

  const snapshot = seo.renderSnapshot(site, meta, { product: DISPLAYED });
  assert.match(snapshot, /<p>Бренд: <a href="\/brands\/natural-factors">Natural Factors<\/a><\/p>/);
  assert.match(snapshot, /<p>120 мг · 90 капсул<\/p>/);
  assert.doesNotMatch(snapshot, /МАГНИЙ ГЛИЦИНАТ/);

  // A brand already in the title is not repeated.
  const own = site.meta.buildMeta(seo.PAGES, `/product/${PRODUCT._id}`, {
    product: { ...DISPLAYED, title: 'Natural Factors Магний' },
  });
  assert.equal(own.title, 'Natural Factors Магний | FairHaven');
});

test('the store is FairHaven in every title and in the head tags', async () => {
  const site = await seo.loadShared();
  const urls = [...Object.keys(seo.PAGES.pages), ...Object.keys(seo.PAGES.noindex), '/nope'];
  for (const url of urls) {
    const meta = site.meta.buildMeta(seo.PAGES, url, {});
    assert.match(meta.title, /(^| \| )FairHaven$/, url);
    assert.doesNotMatch(meta.title + meta.description, DASHES, url);
    assert.equal(meta.siteName, 'FairHaven', url);
  }
  const home = site.meta.buildMeta(seo.PAGES, '/', {});
  const tags = Object.fromEntries(site.meta.headTags(home).map(([, , key, value]) => [key, value]));
  assert.equal(tags['og:site_name'], 'FairHaven');
  const [store, website] = seo.structuredData(site, home, { phone: '+998 87 801 21 21' });
  assert.equal(store['@type'], 'OnlineStore');
  assert.equal(store.name, 'FairHaven');
  assert.equal(website.name, 'FairHaven');
});

test('goal pages: the 12 needs, counts in the title, old stage slugs mapped', async () => {
  const site = await seo.loadShared();
  const { NEED_KEYS } = require('../utils/catalog/taxonomy');
  assert.deepEqual(Object.keys(seo.PAGES.needs), NEED_KEYS);
  for (const need of Object.values(seo.PAGES.legacyStages)) assert.ok(NEED_KEYS.includes(need), need);

  const meta = site.meta.buildMeta(seo.PAGES, '/shop/immunity', { need: 'immunity', count: 24 });
  assert.equal(meta.status, 200);
  assert.equal(meta.title, 'Витамины для иммунитета и энергии: 24 товара | FairHaven');
  assert.equal(meta.h1, 'Витамины для иммунитета и энергии');
  assert.equal(meta.canonical, 'https://fairhaven.uz/shop/immunity');
  assert.match(meta.description, /В подборке 24 товара\./);
  assert.match(meta.robots, /^index/);

  for (const [count, words] of [[1, '1 товар'], [4, '4 товара'], [5, '5 товаров'], [11, '11 товаров'], [21, '21 товар'], [112, '112 товаров']]) {
    assert.equal(site.meta.itemCount(count), words);
  }
  // While the count is unknown the title has none; an empty goal leaves the index.
  assert.equal(site.meta.buildMeta(seo.PAGES, '/shop/kids', {}).title, 'Витамины для детей | FairHaven');
  assert.equal(site.meta.buildMeta(seo.PAGES, '/shop/kids', { count: 0 }).robots, 'noindex, follow');

  assert.equal(site.meta.legacyRedirect(seo.PAGES, '/shop/pregnant/'), '/shop/pregnancy');
  assert.equal(site.meta.legacyRedirect(seo.PAGES, '/shop/fertility-men'), '/shop/men');
  assert.equal(site.meta.legacyRedirect(seo.PAGES, '/shop/immunity'), '');
  assert.equal(site.meta.legacyRedirect(seo.PAGES, '/shop/nope'), '');
  assert.equal(site.meta.needForSlug(seo.PAGES, 'menopause'), 'women');
  assert.equal(site.meta.buildMeta(seo.PAGES, '/shop/nope', {}).status, 404);
});

test('brand pages: name and count from data, 404 without products', async () => {
  const site = await seo.loadShared();
  const meta = site.meta.buildMeta(seo.PAGES, '/brands/solgar', { brand: { slug: 'solgar', name: 'Solgar', count: 14 } });
  assert.equal(meta.status, 200);
  assert.equal(meta.title, 'Витамины и добавки Solgar: 14 товаров | FairHaven');
  assert.equal(meta.h1, 'Solgar');
  assert.equal(meta.canonical, 'https://fairhaven.uz/brands/solgar');
  assert.match(meta.description, /В каталоге 14 товаров\./);

  const fh = site.meta.buildMeta(seo.PAGES, '/brands/fairhaven-health', {
    brand: { slug: 'fairhaven-health', name: 'Fairhaven Health', count: 26 },
  });
  assert.match(fh.description, /^Официальный дистрибьютор Fairhaven Health в Узбекистане/);

  for (const data of [{}, { brand: { slug: 'nope', name: 'Nope', count: 0 } }, { notFound: true }]) {
    const missing = site.meta.buildMeta(seo.PAGES, '/brands/nope', data);
    assert.equal(missing.status, 404);
    assert.equal(missing.canonical, '');
  }

  const index = site.meta.buildMeta(seo.PAGES, '/brands', {});
  assert.equal(index.status, 200);
  assert.equal(index.title, 'Бренды витаминов и добавок | FairHaven');
});

test('goal and brand snapshots list their products with links; JSON-LD has the list', async () => {
  const site = await seo.loadShared();
  const products = [DISPLAYED, { ...PRODUCT, _id: '65a1b2c3d4e5f60718293a4c', title: 'FertilAid для женщин', brandName: 'Fairhaven Health' }];
  const meta = site.meta.buildMeta(seo.PAGES, '/brands/natural-factors', {
    brand: { slug: 'natural-factors', name: 'Natural Factors', count: 2 },
  });
  const html = seo.renderSnapshot(site, meta, { products });
  assert.match(html, /<h1>Natural Factors<\/h1>/);
  assert.match(html, /<li><a href="\/product\/65a1b2c3d4e5f60718293a4b">Магний глицинат 120 мг · 90 капсул · Natural Factors<\/a> · 450 000 сум<\/li>/);
  assert.match(html, /FertilAid для женщин · Fairhaven Health/);

  const [list, crumbs] = seo.structuredData(site, meta, { products });
  assert.equal(list['@type'], 'ItemList');
  assert.equal(list.numberOfItems, 2);
  assert.equal(list.itemListElement[0].url, 'https://fairhaven.uz/product/65a1b2c3d4e5f60718293a4b');
  assert.deepEqual(crumbs.itemListElement.map((item) => item.name), ['Главная', 'Бренды', 'Natural Factors']);

  const index = site.meta.buildMeta(seo.PAGES, '/brands', {});
  const brands = seo.renderSnapshot(site, index, { brands: [{ slug: 'solgar', name: 'Solgar', count: 14 }] });
  assert.match(brands, /<li><a href="\/brands\/solgar">Solgar<\/a> · 14 товаров<\/li>/);
});

test('unknown pages and products answer 404 with noindex and no canonical', async () => {
  const site = await seo.loadShared();
  for (const [url, data] of [['/nope', {}], [`/product/${PRODUCT._id}`, {}], ['/learn/missing', {}], ['/shop/nope', {}], ['/brands/nope', {}]]) {
    const meta = site.meta.buildMeta(seo.PAGES, url, data);
    assert.equal(meta.status, 404, url);
    assert.equal(meta.canonical, '', url);
    assert.match(meta.robots, /^noindex/, url);
    assert.deepEqual(seo.structuredData(site, meta), [], url);
  }
});

test('private pages and empty goal pages stay out of the index', async () => {
  const site = await seo.loadShared();
  const order = site.meta.buildMeta(seo.PAGES, '/order/abc', {});
  assert.equal(order.status, 200);
  assert.equal(order.robots, 'noindex, nofollow');
  assert.equal(order.canonical, '');

  // The old Shop page call ({ empty }) on an old stage URL still resolves.
  const empty = site.meta.buildMeta(seo.PAGES, '/shop/nursing', { empty: true });
  assert.equal(empty.robots, 'noindex, follow');
  const full = site.meta.buildMeta(seo.PAGES, '/shop/nursing', {});
  assert.match(full.robots, /^index/);
  assert.equal(full.canonical, 'https://fairhaven.uz/shop/pregnancy');
});

test('built-in guides and default posts are blog pages', async () => {
  const site = await seo.loadShared();
  const post = site.guides.find((g) => g.slug === 'fertility-guide');
  const meta = site.meta.buildMeta(seo.PAGES, '/learn/fertility-guide', { post });
  assert.equal(meta.status, 200);
  assert.equal(meta.type, 'article');
  assert.match(meta.title, /^Как подготовиться к зачатию.* \| FairHaven$/);
  assert.equal(seo.structuredData(site, meta)[0]['@type'], 'BlogPosting');
  assert.ok(site.defaultPosts.length > 0);
});

test('head and snapshot are injected into the template safely', async () => {
  const site = await seo.loadShared();
  const product = { ...PRODUCT, name: 'Evil </script><b>"x"</b> $& $1 a<b' };
  const meta = site.meta.buildMeta(seo.PAGES, `/product/${PRODUCT._id}`, { product });
  const head = seo.renderHead(site, meta, seo.structuredData(site, meta, { product }));
  const template = '<head><!--seo:start--><title>old</title><!--seo:end--></head><body><div id="root"></div></body>';
  const html = seo.injectTemplate(template, head, seo.renderSnapshot(site, meta, { product }));

  assert.doesNotMatch(html, /<title>old<\/title>/);
  // Markup in a product name is dropped; whatever text is left gets escaped.
  assert.doesNotMatch(html, /<b>|Evil <\/script>/);
  assert.match(html, /<title>Evil &quot;x&quot; \$&amp; \$1 a&lt;b · Fairhaven Health \| FairHaven<\/title>/);
  assert.match(html, /"name":"Evil \\"x\\" \$& \$1 a\\u003cb"/);
  assert.match(html, /<div id="root"><header>.*<h1>Evil &quot;x&quot; \$&amp; \$1 a&lt;b<\/h1>/);
  assert.match(html, /<p>Цена: 450 000 сум<\/p>/);
});

test('the site template keeps the markers the server replaces', () => {
  const html = fs.readFileSync(path.resolve(__dirname, '../../web/index.html'), 'utf8');
  assert.ok(html.indexOf('<!--seo:start-->') < html.indexOf('<!--seo:end-->'));
  assert.match(html, /<div id="root"><\/div>/);
  assert.doesNotMatch(html, /rel="canonical"/);
});

test('sitemap lists each URL once with a date when known', () => {
  const xml = seo.renderSitemap([
    { path: '/' },
    { path: '/product/1', lastmod: new Date('2026-10-30T12:00:00Z') },
    { path: '/product/1' },
    { path: '/learn/a&b' },
  ]);
  assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8"\?>/);
  assert.equal((xml.match(/<url>/g) || []).length, 3);
  assert.match(xml, /<loc>https:\/\/fairhaven.uz\/product\/1<\/loc><lastmod>2026-10-30<\/lastmod>/);
  assert.match(xml, /a&amp;b/);
});

test('crawlers are told apart from in-app browsers', () => {
  for (const ua of [
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)',
    'TelegramBot (like TwitterBot)',
    'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
    'Mozilla/5.0 (compatible; Google-InspectionTool/1.0;)',
  ]) assert.equal(seo.isBot(ua), true, ua);
  for (const ua of [
    'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36 Telegram-Android/11.2.0',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 YaBrowser/24.7 YandexSearch/8.1 Mobile Safari/537.36',
    '',
  ]) assert.equal(seo.isBot(ua), false, ua);
});
