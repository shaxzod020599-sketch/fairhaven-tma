const catalog = require('../core/catalog');
const YandexPublishedItem = require('../models/YandexPublishedItem');
const S = require('../adapters/yandex/serializers');

async function current() {
  const [page, defaults] = await Promise.all([
    catalog.listForChannel('yandex', { skip: 0, limit: Number.MAX_SAFE_INTEGER }), S.loadDefaults(),
  ]);
  return page.items.map((entry) => ({ ...entry, item: S.compositionItem(entry, defaults) }))
    .filter((entry) => entry.item).sort((a, b) => a.item.id.localeCompare(b.item.id));
}

async function remember(placeId, items) {
  const Ledger = YandexPublishedItem();
  await Ledger.init();
  if (!items.length) return;
  await Ledger.bulkWrite(items.map(({ id }) => ({ updateOne: {
    filter: { placeId, itemId: id }, update: { $setOnInsert: { placeId, itemId: id } }, upsert: true,
  } })), { ordered: true });
}

async function composition(placeId, { limit, offset }) {
  const entries = await current();
  const items = entries.slice(offset, offset + limit).map((entry) => entry.item);
  await remember(placeId, items);
  return S.composition(items, entries.length);
}

async function availability(placeId) {
  const entries = await current();
  await remember(placeId, entries.map((entry) => entry.item));
  const rows = await YandexPublishedItem().find({ placeId }).select('itemId').lean();
  const stock = new Map(entries.map(({ card, mirror, item }) => [item.id,
    catalog.isAvailable(card, mirror, 'yandex') ? Math.floor(catalog.publishedQuantity(card, mirror, 'yandex')) : 0]));
  return { items: rows.map(({ itemId }) => ({ id: itemId, stock: stock.get(itemId) || 0 }))
    .sort((a, b) => a.id.localeCompare(b.id)) };
}

module.exports = { composition, availability };
