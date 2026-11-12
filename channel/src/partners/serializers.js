const media = require('../media/images');

/**
 * What a partner receives. Money is a whole number of UZS (soʻm), quantities
 * are whole pieces, timestamps are ISO 8601 in UTC.
 */

const CATEGORY_NAMES = {
  cosmetics: 'Косметика',
  parapharmaceuticals: 'Парафармацевтика',
  supplements: 'Добавки',
  vitamins: 'Витамины',
  hygiene: 'Гигиена',
  drinks: 'Напитки',
};

const money = (value) => Math.max(0, Math.round(Number(value) || 0));
const iso = (value) => {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(+date) ? date.toISOString() : null;
};

function product({ card, mirror, id, price, oldPrice, quantity, defaults = {} }) {
  const qty = Math.max(0, Math.floor(Number(quantity) || 0));
  return {
    id,
    name: card.name || mirror?.name || '',
    name_uz: card.nameUz || '',
    brand: card.brand || mirror?.brandName || '',
    category: card.category || '',
    category_name: CATEGORY_NAMES[card.category] || mirror?.categoryName || '',
    barcode: card.barcode || mirror?.barcode || '',
    sku: card.sku || mirror?.sku || '',
    description: card.description || '',
    description_uz: card.descriptionUz || '',
    images: media.imagesFor(card),
    mxik: String(card.mxikCode || defaults.mxikCode || '').trim(),
    package_code: String(card.packageCode || defaults.packageCode || '').trim(),
    unit: 'pcs',
    price: money(price),
    old_price: money(oldPrice) > money(price) ? money(oldPrice) : null,
    quantity: qty,
    available: qty > 0,
    updated_at: iso(card.updatedAt || mirror?.syncedAt),
  };
}

function stockRow({ id, price, quantity }) {
  const qty = Math.max(0, Math.floor(Number(quantity) || 0));
  return { product_id: id, quantity: qty, available: qty > 0, price: money(price) };
}

function order(doc) {
  return {
    id: doc.number,
    order_id: doc.externalId,
    status: doc.status,
    reason: doc.reason || null,
    test: Boolean(doc.test),
    items: (doc.items || []).map((item) => ({
      product_id: item.productId,
      name: item.name,
      quantity: item.quantity,
      price: money(item.unitPrice),
      total: money(item.lineTotal),
    })),
    total: money(doc.total),
    customer: { name: doc.customer?.name || '', phone: doc.customer?.phone || '' },
    delivery: {
      type: doc.delivery?.type || 'courier',
      address: doc.delivery?.address || '',
      comment: doc.delivery?.comment || '',
    },
    comment: doc.comment || '',
    decision_deadline: doc.status === 'new' ? iso(doc.deadlineAt) : null,
    created_at: iso(doc.createdAt),
    updated_at: iso(doc.updatedAt),
    history: (doc.history || []).map((row) => ({
      status: row.status, at: iso(row.at), reason: row.reason || null,
    })),
  };
}

function page(items, total, { limit, offset }) {
  return { items, total, limit, offset };
}

module.exports = { product, stockRow, order, page, CATEGORY_NAMES };
