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
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }

  return data;
}

// Products
export function fetchProducts(params = {}) {
  const query = new URLSearchParams(params).toString();
  return request(`/products${query ? `?${query}` : ''}`);
}

export function fetchPopularProducts(limit = 3) {
  return request(`/products/popular?limit=${limit}`);
}

export function fetchProductById(id) {
  return request(`/products/${id}`);
}

export function fetchCategories() {
  return request('/products/categories');
}

// Orders
export function createOrder(orderData) {
  return request('/orders', { method: 'POST', body: orderData });
}

export function fetchOrder(orderId) {
  return request(`/orders/${orderId}`);
}

export function fetchOrders(params = {}) {
  const query = new URLSearchParams(params).toString();
  return request(`/orders${query ? `?${query}` : ''}`);
}

export function fetchOrdersByUser(telegramId) {
  return request(`/orders/user/${telegramId}`);
}

// Users
export function upsertUser(userData) {
  return request('/users', { method: 'POST', body: userData });
}

export function fetchUser(telegramId) {
  return request(`/users/${telegramId}`);
}

export function updateUser(telegramId, data) {
  return request(`/users/${telegramId}`, { method: 'PUT', body: data });
}
