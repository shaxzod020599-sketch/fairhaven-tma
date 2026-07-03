/**
 * API client for the standalone web site.
 * Reads share the same /api the mini-app uses; writes go through the
 * web-specific /api/web/* surface (guest checkout + Telegram-bot login).
 * The session cookie is httpOnly — always send credentials.
 */

const API_BASE = '/api';

async function request(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const config = {
    credentials: 'include',
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

/* ---------------- Web orders ---------------- */
export function createOrder(orderData) {
  return request('/web/orders', { method: 'POST', body: orderData });
}

export function fetchOrder(orderId, accessToken = '') {
  const q = accessToken ? `?t=${encodeURIComponent(accessToken)}` : '';
  return request(`/web/orders/${orderId}${q}`);
}

export function fetchMyOrders() {
  return request('/web/my/orders');
}

export function validatePromo({ code, subtotal }) {
  return request('/web/promo/validate', {
    method: 'POST',
    body: { code, subtotal },
    allowError: true,
  });
}

/* ---------------- Telegram-bot web auth ---------------- */
export function authStart() {
  return request('/web/auth/start', { method: 'POST' });
}

export function authStatus(token) {
  return request(`/web/auth/status?token=${encodeURIComponent(token)}`, {
    allowError: true,
  });
}

export function authMe() {
  return request('/web/auth/me', { allowError: true });
}

export function authLogout() {
  return request('/web/auth/logout', { method: 'POST' });
}

/* ---------------- Public (collections & settings) ---------------- */
export function fetchPublicCollections() {
  return request('/public/collections');
}

export function fetchPublicSettings() {
  return request('/public/settings');
}

/* ---------------- Editable site content ---------------- */
export function fetchSiteContent() {
  return request('/public/site-content', { allowError: true });
}

export function saveSiteContent(data) {
  return request('/web/admin/site-content', { method: 'PUT', body: { data } });
}

export function adminUploadImage(dataUrl) {
  return request('/web/admin/upload', { method: 'POST', body: { dataUrl } });
}
