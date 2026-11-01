const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const express = require('express');
const mongoose = require('mongoose');

/**
 * The goal (/shop/<need>) and brand (/brands/<slug>) pages through the real
 * page renderer and sitemap, on an in-memory catalogue: status codes, the
 * 301 from old life-stage URLs, titles and the crawler snapshot.
 */

process.env.NODE_ENV = 'test';

const GOOGLEBOT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const TEMPLATE = '<!doctype html><html><head><!--seo:start--><title>FairHaven</title><!--seo:end--></head>'
  + '<body><div id="root"></div></body></html>';

let mongod;
let server;
let base;
let distDir;
let ids;

async function get(urlPath, userAgent = 'Mozilla/5.0') {
  const res = await fetch(`${base}${urlPath}`, { redirect: 'manual', headers: { 'user-agent': userAgent } });
  return { status: res.status, location: res.headers.get('location'), body: await res.text() };
}

const titleOf = (html) => (html.match(/<title>([^<]*)<\/title>/) || [])[1];

test.before(async () => {
  distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fh-seo-'));
  fs.writeFileSync(path.join(distDir, 'index.html'), TEMPLATE);
  process.env.PUBLIC_WEB_DIST = distDir;

  const { MongoMemoryServer } = require('mongodb-memory-server');
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { dbName: 'seo-routes-test' });
  const Product = require('../models/Product');
  const seoController = require('../controllers/seoController');

  const [zinc, d3, magnesium] = await Product.create([
    { name: 'ЦИНК ПИКОЛИНАТ 22 МГ КАПС. №100 SOLGAR', brand: 'SOLGAR', price: 210_000, category: 'vitamins' },
    { name: 'ВИТАМИН Д3 1000 МЕ КАПС. №100 SOLGAR', brand: 'SOLGAR', price: 180_000, category: 'vitamins' },
    { name: 'МАГНИЙ ГЛИЦИНАТ 120 МГ КАПС. №90 NATURAL FACTORS', brand: 'NATURAL FACTORS', price: 260_000, category: 'vitamins' },
  ]);
  // Hidden products count nowhere: not on the brand page, not in the sitemap.
  await Product.create([
    { name: 'ПРЕНАТАЛ МУЛЬТИ FAIRHAVEN HEALTH', brand: 'Fairhaven Health', price: 300_000, category: 'vitamins', approved: false },
    { name: 'ЖЕЛЕЗО 25 МГ CARLSON', brand: 'CARLSON', price: 90_000, category: 'vitamins', approved: false },
  ]);
  ids = { zinc: String(zinc._id), d3: String(d3._id), magnesium: String(magnesium._id) };

  const app = express();
  app.get('/sitemap.xml', seoController.sitemap);
  app.get('*', seoController.renderPage);
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await mongod.stop();
  fs.rmSync(distDir, { recursive: true, force: true });
});

test('a goal page answers 200 with its count, and lists its products for crawlers', async () => {
  const page = await get('/shop/immunity', GOOGLEBOT);
  assert.equal(page.status, 200);
  assert.equal(titleOf(page.body), 'Витамины для иммунитета и энергии: 2 товара | FairHaven');
  assert.match(page.body, /<link rel="canonical" href="https:\/\/fairhaven.uz\/shop\/immunity" \/>/);
  assert.match(page.body, new RegExp(`<a href="/product/${ids.zinc}">Цинк пиколинат[^<]*· Solgar</a>`));
  assert.match(page.body, new RegExp(`<a href="/product/${ids.d3}">`));
  assert.doesNotMatch(page.body, new RegExp(ids.magnesium));
  assert.match(page.body, /"@type":"ItemList"/);
});

test('a goal without products stays 200 but leaves the index; unknown goals are 404', async () => {
  const empty = await get('/shop/kids');
  assert.equal(empty.status, 200);
  assert.match(empty.body, /<meta name="robots" content="noindex, follow" \/>/);

  const unknown = await get('/shop/nope');
  assert.equal(unknown.status, 404);
  assert.equal(titleOf(unknown.body), 'Страница не найдена | FairHaven');
});

test('old life-stage URLs move permanently to their goal, keeping the query', async () => {
  for (const [from, to] of [
    ['/shop/pregnant', '/shop/pregnancy'],
    ['/shop/nursing', '/shop/pregnancy'],
    ['/shop/fertility-women', '/shop/fertility'],
    ['/shop/fertility-men', '/shop/men'],
    ['/shop/menopause/', '/shop/women'],
  ]) {
    const res = await get(from);
    assert.equal(res.status, 301, from);
    assert.equal(res.location, to, from);
  }
  assert.equal((await get('/shop/pregnant?sort=price')).location, '/shop/pregnancy?sort=price');
});

test('a brand page answers 200 for a brand on sale and 404 otherwise', async () => {
  const solgar = await get('/brands/solgar', GOOGLEBOT);
  assert.equal(solgar.status, 200);
  assert.equal(titleOf(solgar.body), 'Витамины и добавки Solgar: 2 товара | FairHaven');
  assert.match(solgar.body, /<h1>Solgar<\/h1>/);
  assert.match(solgar.body, new RegExp(`<a href="/product/${ids.zinc}">`));
  assert.doesNotMatch(solgar.body, new RegExp(ids.magnesium));

  // Carlson is a known brand, but its only product is hidden.
  for (const url of ['/brands/carlson', '/brands/nope']) {
    const res = await get(url);
    assert.equal(res.status, 404, url);
    assert.match(res.body, /<meta name="robots" content="noindex, nofollow" \/>/, url);
  }
});

test('the brand index lists brands with counts for crawlers', async () => {
  const page = await get('/brands', GOOGLEBOT);
  assert.equal(page.status, 200);
  assert.equal(titleOf(page.body), 'Бренды витаминов и добавок | FairHaven');
  assert.match(page.body, /<li><a href="\/brands\/solgar">Solgar<\/a> · 2 товара<\/li><li><a href="\/brands\/natural-factors">Natural Factors<\/a> · 1 товар<\/li>/);
  assert.doesNotMatch(page.body, /\/brands\/carlson/);
});

test('a product page is titled by display title and brand', async () => {
  const page = await get(`/product/${ids.magnesium}`, GOOGLEBOT);
  assert.equal(page.status, 200);
  assert.match(titleOf(page.body), /^Магний глицинат[^|]* · Natural Factors \| FairHaven$/);
  assert.doesNotMatch(titleOf(page.body), /МАГНИЙ/);
  assert.match(page.body, /<p>Бренд: <a href="\/brands\/natural-factors">Natural Factors<\/a><\/p>/);
});

test('the sitemap has the static pages, goals and brands with products, and products', async () => {
  const res = await fetch(`${base}/sitemap.xml`);
  assert.equal(res.status, 200);
  const xml = await res.text();
  const locs = [...xml.matchAll(/<loc>https:\/\/fairhaven\.uz([^<]*)<\/loc>/g)].map((m) => m[1]);

  for (const url of ['/', '/shop', '/brands', '/learn', '/about', '/contact', '/faq',
    '/shop/immunity', '/shop/sleep', '/brands/solgar', '/brands/natural-factors',
    `/product/${ids.zinc}`, `/product/${ids.d3}`, `/product/${ids.magnesium}`]) {
    assert.ok(locs.includes(url), url);
  }
  for (const url of ['/shop/kids', '/shop/pregnant', '/brands/carlson', '/brands/fairhaven-health']) {
    assert.ok(!locs.includes(url), url);
  }
  assert.ok(locs.some((url) => url.startsWith('/learn/')));
  assert.equal(new Set(locs).size, locs.length);
});
