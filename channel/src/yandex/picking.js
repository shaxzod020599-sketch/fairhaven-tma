const catalog = require('../core/catalog');
const { compositionItem, loadDefaults } = require('../adapters/yandex/serializers');

function failure(code = 'yandex_invalid_items', status = 422) {
  return Object.assign(new Error(code), { code, status });
}
function validateItems(items) {
  if (!Array.isArray(items) || items.length > 100) throw failure();
  const ids = new Set();
  for (const item of items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)
      || Object.keys(item).some((key) => !['billzProductId', 'quantity'].includes(key))
      || typeof item.billzProductId !== 'string' || !item.billzProductId.trim() || item.billzProductId.length > 64
      || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 10000
      || ids.has(item.billzProductId)) throw failure();
    ids.add(item.billzProductId);
  }
}
async function eligible(id, quantity) {
  const entry = await catalog.findForChannel('yandex', id);
  const published = entry && compositionItem(entry, await loadDefaults());
  // An operator's forced-in publication is not proof of physical stock.
  const availableQuantity = entry && catalog.isAvailable(entry.card, entry.mirror, 'yandex')
    ? Math.floor(catalog.sellableStock(entry.card, entry.mirror, 'yandex')) : 0;
  if (!published || availableQuantity < quantity) throw failure('yandex_unavailable', 409);
  return { billzProductId: id, name: published.name, unitPrice: published.price, availableQuantity };
}
function total(items) {
  const value = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  if (!Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER / 100
    || items.some((i) => !Number.isFinite(i.unitPrice) || i.unitPrice <= 0)) throw failure();
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
async function resolve(row, requested) {
  validateItems(requested);
  const original = new Map((row.yandex.requestSnapshot.items || []).map((item) => [item.id, item]));
  const items = [];
  for (const item of requested) {
    const entry = await eligible(item.billzProductId, item.quantity);
    const quote = original.get(item.billzProductId);
    items.push({ billzProductId: item.billzProductId, quantity: item.quantity,
      name: quote?.name || entry.name, unitPrice: quote ? quote.price : entry.unitPrice });
  }
  return { items, totalAmount: total(items) };
}
async function checkAvailability(row) {
  validateItems(row.items.map(({ billzProductId, quantity }) => ({ billzProductId, quantity })));
  if (!row.items.length) throw failure('yandex_empty_items', 409);
  if (Math.abs(total(row.items) - row.totalAmount) > 0.005) throw failure('yandex_invalid_total', 409);
  for (const item of row.items) await eligible(item.billzProductId, item.quantity);
}
async function products({ search = '', limit = 30 } = {}) {
  if (typeof search !== 'string' || search.length > 120 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw failure('yandex_invalid_query');
  }
  const page = await catalog.listForChannel('yandex', { search: search.trim(), limit: Number.MAX_SAFE_INTEGER });
  const defaults = await loadDefaults();
  const items = [];
  for (const entry of page.items) {
    const item = compositionItem(entry, defaults);
    const availableQuantity = Math.floor(catalog.sellableStock(entry.card, entry.mirror, 'yandex'));
    if (!item || availableQuantity < 1 || !catalog.isAvailable(entry.card, entry.mirror, 'yandex')) continue;
    items.push({ billzProductId: item.id, name: item.name, unitPrice: item.price, availableQuantity });
    if (items.length === limit) break;
  }
  return { items };
}
module.exports = { validateItems, resolve, checkAvailability, products };
