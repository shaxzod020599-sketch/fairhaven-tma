const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/yandex-serializer-test';
process.env.BILLZ_SECRET_TOKEN = 'test-secret';
process.env.BILLZ_SHOP_ID = 'test-shop';
process.env.PUBLIC_IMAGE_BASE_URL = 'https://images.example.test';
const uploads = fs.mkdtempSync(path.join(os.tmpdir(), 'yandex-serializers-'));
process.env.UPLOADS_DIR = uploads;
fs.writeFileSync(path.join(uploads, 'item.jpg'), 'local-image-fixture');
test.after(() => fs.rmSync(uploads, { recursive: true, force: true }));
const S = require('../src/adapters/yandex/serializers');
const defaults = { mxikCode: '03049990001000000', packageCode: '1234567' };
const entry = {
  card: { name: 'Витамин', category: 'vitamins', sku: 'SKU-1', barcode: '4601234567893', imageUrl: '/uploads/item.jpg',
    channels: { yandex: { enabled: true, price: 100 } } },
  mirror: { billzProductId: 'p1', measurementUnit: 'шт' },
};

test('Yandex composition names all shop categories in Russian and preserves their ids', () => {
  const categories = [
    { id: 'cosmetics', name: 'Косметика' },
    { id: 'parapharmaceuticals', name: 'Парафармацевтика' },
    { id: 'supplements', name: 'Добавки' },
    { id: 'vitamins', name: 'Витамины' },
    { id: 'hygiene', name: 'Гигиена' },
    { id: 'drinks', name: 'Напитки' },
  ];
  const items = categories.map(({ id }) => S.compositionItem({ ...entry, card: { ...entry.card, category: id } }, defaults));
  assert.deepEqual(S.composition(items, items.length).categories, categories);
  assert.deepEqual(items.map(({ categoryId }) => categoryId), categories.map(({ id }) => id));
});

for (const [name, own, shop, expected] of [
  ['channel override', 150, 200, 150],
  ['shop fallback', 0, 200, 200],
  ['unset override', undefined, 200, 200],
  ['shop price equal to channel price', 0, 100, undefined],
  ['shop price below channel price', 0, 90, undefined],
  ['no old price', 0, 0, undefined],
  ['equal override prevents fallback', 100, 200, undefined],
  ['lower override prevents fallback', 90, 200, undefined],
]) {
  test(`Yandex composition and prices old price: ${name}`, () => {
    const card = { ...entry.card, oldPrice: shop,
      channels: { yandex: { ...entry.card.channels.yandex, oldPrice: own } } };
    const item = S.compositionItem({ ...entry, card }, defaults);
    assert.ok(item);
    assert.equal(item.price, 100);
    assert.equal(item.oldPrice, expected);
    assert.equal(Object.hasOwn(item, 'oldPrice'), expected !== undefined);
    assert.deepEqual(S.prices([item], -1), {
      items: [{ id: 'p1', price: 100, vat: -1, ...(expected !== undefined ? { oldPrice: expected } : {}) }],
    });
  });
}
