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

test('a product page gets its own title, canonical and Product data in UZS', async () => {
  const site = await seo.loadShared();
  const meta = site.meta.buildMeta(seo.PAGES, `/product/${PRODUCT._id}/`, { product: PRODUCT });

  assert.equal(meta.status, 200);
  assert.equal(meta.title, 'FertilAid for Women, Fairhaven Health — купить в Ташкенте');
  assert.equal(meta.canonical, `https://fairhaven.uz/product/${PRODUCT._id}`);
  assert.equal(meta.image, 'https://fairhaven.uz/uploads/fertilaid.jpg');
  assert.match(meta.description, /^FertilAid for Women, Fairhaven Health — 450 000 сум\. Комплекс/);

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

test('unknown pages and products answer 404 with noindex and no canonical', async () => {
  const site = await seo.loadShared();
  for (const [url, data] of [['/nope', {}], [`/product/${PRODUCT._id}`, {}], ['/learn/missing', {}]]) {
    const meta = site.meta.buildMeta(seo.PAGES, url, data);
    assert.equal(meta.status, 404, url);
    assert.equal(meta.canonical, '', url);
    assert.match(meta.robots, /^noindex/, url);
    assert.deepEqual(seo.structuredData(site, meta), [], url);
  }
});

test('private pages and empty life-stage pages stay out of the index', async () => {
  const site = await seo.loadShared();
  const order = site.meta.buildMeta(seo.PAGES, '/order/abc', {});
  assert.equal(order.status, 200);
  assert.equal(order.robots, 'noindex, nofollow');
  assert.equal(order.canonical, '');

  const empty = site.meta.buildMeta(seo.PAGES, '/shop/nursing', { empty: true });
  assert.equal(empty.robots, 'noindex, follow');
  const full = site.meta.buildMeta(seo.PAGES, '/shop/nursing', {});
  assert.match(full.robots, /^index/);
  assert.equal(full.canonical, 'https://fairhaven.uz/shop/nursing');
});

test('every life stage of the site has its own copy', async () => {
  const site = await seo.loadShared();
  for (const stage of site.stages) {
    assert.ok(seo.PAGES.pages[`/shop/${stage.slug}`], stage.slug);
  }
});

test('built-in guides and default posts are blog pages', async () => {
  const site = await seo.loadShared();
  const post = site.guides.find((g) => g.slug === 'fertility-guide');
  const meta = site.meta.buildMeta(seo.PAGES, '/learn/fertility-guide', { post });
  assert.equal(meta.status, 200);
  assert.equal(meta.type, 'article');
  assert.match(meta.title, /^Как подготовиться к зачатию.* — Блог Fairhaven Health$/);
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
  assert.match(html, /<title>Evil &quot;x&quot; \$&amp; \$1 a&lt;b, Fairhaven Health/);
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
