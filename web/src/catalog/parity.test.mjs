// The client copies in this folder must compute exactly what backend/utils/catalog computes, so a page
// looks the same whether or not the API already sends the catalogue fields.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { BRANDS } from './brands.js';
import { normalizeProduct } from './normalize.js';

const backendUtils = new URL('../../../backend/utils/', import.meta.url);
const skip = existsSync(new URL('publicProduct.js', backendUtils)) ? false : 'backend sources not present';
const require = createRequire(import.meta.url);
const backend = (path) => require(fileURLToPath(new URL(path, backendUtils)));

const webFixture = JSON.parse(readFileSync(new URL('./fixtures/products.json', import.meta.url), 'utf8'));
const backendFixturePath = new URL('../../../backend/tests/fixtures/catalogNames.json', import.meta.url);

const FIELDS = ['title', 'titleUz', 'spec', 'specUz', 'brandName', 'brandSlug', 'needs', 'kind'];
const pick = (p) => Object.fromEntries(FIELDS.map((f) => [f, p[f]]));

test('brand registry matches the backend', { skip }, () => {
  assert.deepEqual(BRANDS, backend('catalog/brands.js').BRANDS);
});

test('computed catalogue fields match the backend for every product', { skip }, () => {
  const { autoCatalog } = backend('publicProduct.js');
  const products = [...webFixture];
  if (existsSync(backendFixturePath)) products.push(...JSON.parse(readFileSync(backendFixturePath, 'utf8')).products);
  for (const raw of products) {
    assert.deepEqual(pick(normalizeProduct(raw)), autoCatalog(raw), raw.name);
  }
});
