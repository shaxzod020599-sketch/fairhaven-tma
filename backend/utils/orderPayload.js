const Product = require('../models/Product');
const { ensureObjectId, toSafeString } = require('./validators');

function normalizeLocation(location) {
  if (!location || typeof location !== 'object') {
    throw new Error('Location is required');
  }

  const lat = Number(location.lat);
  const lng = Number(location.lng);
  const addressString = toSafeString(location.addressString || location.address, { max: 500 });

  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw new Error('Invalid latitude');
  }
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    throw new Error('Invalid longitude');
  }
  if (!addressString) {
    throw new Error('Address is required');
  }

  return { lat, lng, addressString };
}

async function buildOrderData({ items, location, customerName, customerPhone, notes }) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('Order must have at least one item');
  }
  if (items.length > 100) {
    throw new Error('Order item limit exceeded');
  }

  const normalizedItems = items.map((item) => {
    const productId = item?.productId;
    const quantity = Number(item?.quantity ?? item?.qty);

    if (!ensureObjectId(productId)) {
      throw new Error('Invalid productId');
    }
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 100) {
      throw new Error('Invalid quantity');
    }

    return { productId, quantity };
  });

  const uniqueIds = [...new Set(normalizedItems.map((item) => item.productId))];
  const products = await Product.find({ _id: { $in: uniqueIds } }).select('name price isAvailable').lean();
  const productMap = new Map(products.map((product) => [String(product._id), product]));
  const missingIds = uniqueIds.filter((id) => !productMap.has(id));
  if (missingIds.length > 0) {
    throw new Error(`Missing products: ${missingIds.join(', ')}`);
  }

  const orderItems = normalizedItems.map((item) => {
    const product = productMap.get(item.productId);
    if (!product.isAvailable) {
      throw new Error(`Product is unavailable: ${product.name}`);
    }

    return {
      productId: product._id,
      name: product.name,
      price: product.price,
      quantity: item.quantity,
    };
  });

  const totalAmount = orderItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

  return {
    items: orderItems,
    totalAmount,
    location: normalizeLocation(location),
    customerName: toSafeString(customerName, { max: 120 }),
    customerPhone: toSafeString(customerPhone, { max: 40 }),
    notes: toSafeString(notes, { max: 1000 }),
  };
}

module.exports = {
  buildOrderData,
};
