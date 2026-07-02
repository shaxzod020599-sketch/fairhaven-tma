/**
 * API client for the standalone web site.
 * Same backend (/api) the Telegram mini-app uses — no auth needed for reads.
 * Guest checkout writes orders WITHOUT a telegram user (guest branch in
 * backend orderController.create).
 */

const API_BASE = '/api';

async function request(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const config = {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  };
  if (config.body && typeof config.body === 'object') {
    config.body = JSON.stringify(config.body);
  }

  const response = await fetch(url, config);
  const data = await response.json().catch(() => ({}));

  if (!response.ok && options.allowError !== true) {
    const err = new Error(data.error || data.message || 'Request failed');
    err.payload = data;
    err.status = response.status;
    throw err;
  }
  return data;
}

/* ---------------- Products ---------------- */
export function fetchProducts(params = {}) {
  const query = new URLSearchParams(params).toString();
  return request(`/products${query ? `?${query}` : ''}`);
}

export function fetchPopularProducts(limit = 8) {
  return request(`/products/popular?limit=${limit}`);
}

export function fetchProductById(id) {
  return request(`/products/${id}`);
}

export function fetchCategories() {
  return request('/products/categories');
}

/* ---------------- Orders ---------------- */
export function createOrder(orderData) {
  return request('/orders', { method: 'POST', body: orderData });
}

export function fetchOrder(orderId) {
  return request(`/orders/${orderId}`);
}

export function validatePromo({ code, subtotal }) {
  // No telegramId — guest path. Backend treats missing telegramId as first-order.
  return request('/orders/validate-promo', {
    method: 'POST',
    body: { code, subtotal },
    allowError: true,
  });
}

/* ---------------- Public (collections & settings) ---------------- */
export function fetchPublicCollections() {
  return request('/public/collections');
}

export function fetchPublicSettings() {
  return request('/public/settings');
}
