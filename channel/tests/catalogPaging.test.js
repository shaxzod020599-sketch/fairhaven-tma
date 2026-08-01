const assert = require('node:assert/strict');
const test = require('node:test');

process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017';
process.env.BILLZ_SECRET_TOKEN = process.env.BILLZ_SECRET_TOKEN || 'test-secret';
process.env.BILLZ_SHOP_ID = process.env.BILLZ_SHOP_ID || 'shop-a';
process.env.BILLZ_PAGE_SIZE = '10';

const billz = require('../src/billz/client');
const { fetchAllProducts } = require('../src/sync/catalog');

/**
 * Paging is the single most dangerous part of the sync.
 *
 * Whatever this returns is treated as the complete catalogue, and anything
 * missing from it is flagged as deleted in Billz — which removes the product
 * from every channel. So a short read must fail loudly rather than quietly
 * become "the catalogue shrank".
 */

function withStubbedPages(pages) {
  const original = billz.listProducts;
  const calls = [];
  billz.listProducts = async ({ page, limit }) => {
    calls.push({ page, limit });
    return pages(page);
  };
  return { calls, restore: () => { billz.listProducts = original; } };
}

const productPage = (n, total) => ({
  total,
  products: Array.from({ length: n }, (_, i) => ({ id: `p-${Math.random()}-${i}` })),
});

test('a zero count does not end the walk after page one', async () => {
  // Billz returning count: 0 alongside a full page used to make the loop bound
  // zero and skip the completeness check, so page one became "the catalogue"
  // and every product after it was flagged deleted.
  const stub = withStubbedPages((page) => {
    if (page === 1) return productPage(10, 0);
    if (page === 2) return productPage(10, 0);
    return productPage(3, 0);
  });
  try {
    const all = await fetchAllProducts();
    assert.equal(all.length, 23, 'should have kept paging past page one');
    assert.equal(stub.calls.length, 3);
  } finally {
    stub.restore();
  }
});

test('a short page ends the walk', async () => {
  const stub = withStubbedPages((page) => (page === 1 ? productPage(4, 4) : productPage(0, 4)));
  try {
    assert.equal((await fetchAllProducts()).length, 4);
    assert.equal(stub.calls.length, 1, 'must not request a page it does not need');
  } finally {
    stub.restore();
  }
});

test('an empty catalogue is not an error', async () => {
  const stub = withStubbedPages(() => productPage(0, 0));
  try {
    assert.deepEqual(await fetchAllProducts(), []);
  } finally {
    stub.restore();
  }
});

test('fetching fewer products than Billz reports is refused', async () => {
  // Better to fail the sync than to write a partial catalogue: the missing
  // products would be marked deleted and vanish from every channel.
  const stub = withStubbedPages((page) => (page === 1 ? productPage(4, 90) : productPage(0, 90)));
  try {
    await assert.rejects(fetchAllProducts(), /incomplete catalogue: fetched 4 of 90/);
  } finally {
    stub.restore();
  }
});

test('paging that never ends is aborted rather than looping forever', async () => {
  const stub = withStubbedPages(() => productPage(10, 0));
  try {
    await assert.rejects(fetchAllProducts(), /exceeded 500 pages/);
  } finally {
    stub.restore();
  }
});

test('every page is requested with the configured size', async () => {
  const stub = withStubbedPages((page) => (page < 3 ? productPage(10, 25) : productPage(5, 25)));
  try {
    await fetchAllProducts();
    assert.deepEqual(stub.calls.map((c) => c.page), [1, 2, 3]);
    assert.ok(stub.calls.every((c) => c.limit === 10));
  } finally {
    stub.restore();
  }
});
