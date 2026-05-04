import { getTelegramUser } from '../utils/telegram';

const API = '/api/admin';
const PUBLIC = '/api';

function getAdminTgId() {
  const tg = getTelegramUser();
  if (tg?.id) return tg.id;
  try {
    const saved = localStorage.getItem('fh-admin-tgid');
    if (saved) return Number(saved);
  } catch (_) {}
  return null;
}

export function setAdminTgId(id) {
  try { localStorage.setItem('fh-admin-tgid', String(id)); } catch (_) {}
}

export function clearAdminTgId() {
  try { localStorage.removeItem('fh-admin-tgid'); } catch (_) {}
}

async function adminRequest(endpoint, options = {}) {
  const tgId = getAdminTgId();
  const headers = {
    'Content-Type': 'application/json',
    ...(tgId ? { 'X-Admin-Telegram-Id': String(tgId) } : {}),
    ...(options.headers || {}),
  };
  const config = { ...options, headers };
  if (config.body && typeof config.body === 'object') {
    config.body = JSON.stringify(config.body);
  }

  const res = await fetch(`${API}${endpoint}`, config);
  const data = await res.json().catch(() => ({ success: false, error: 'bad_json' }));
  if (!res.ok || data.success === false) {
    const err = new Error(data.error || data.message || 'Ошибка запроса');
    err.status = res.status;
    err.code = data.error;
    throw err;
  }
  return data;
}

// ──────────────────────── WhoAmI / Dashboard
export const whoami = () => adminRequest('/whoami');
export const stats = () => adminRequest('/stats');

// ──────────────────────── Orders
export const listOrders = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return adminRequest(`/orders${qs ? `?${qs}` : ''}`);
};
export const updateOrderStatus = (id, status) =>
  adminRequest(`/orders/${id}/status`, { method: 'PATCH', body: { status } });
export const revertOrder = (id) =>
  adminRequest(`/orders/${id}/revert`, { method: 'POST' });

// ──────────────────────── Products
export const listProductsAdmin = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return adminRequest(`/products${qs ? `?${qs}` : ''}`);
};
export const createProduct = (body) =>
  adminRequest('/products', { method: 'POST', body });
export const updateProduct = (id, body) =>
  adminRequest(`/products/${id}`, { method: 'PATCH', body });
export const deleteProduct = (id) =>
  adminRequest(`/products/${id}`, { method: 'DELETE' });
export const toggleProduct = (id) =>
  adminRequest(`/products/${id}/toggle`, { method: 'PATCH' });

// ──────────────────────── Admins
export const listAdmins = () => adminRequest('/admins');
export const promoteAdmin = (body) =>
  adminRequest('/admins', { method: 'POST', body });
export const demoteAdmin = (telegramId) =>
  adminRequest(`/admins/${telegramId}`, { method: 'DELETE' });

// ──────────────────────── Customers
export const listUsers = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return adminRequest(`/users${qs ? `?${qs}` : ''}`);
};
export const getUserDetail = (telegramId) =>
  adminRequest(`/users/${telegramId}`);

// ──────────────────────── Collections
export const listCollectionsAdmin = () => adminRequest('/collections');
export const createCollection = (body) =>
  adminRequest('/collections', { method: 'POST', body });
export const updateCollectionAdmin = (id, body) =>
  adminRequest(`/collections/${id}`, { method: 'PATCH', body });
export const deleteCollection = (id) =>
  adminRequest(`/collections/${id}`, { method: 'DELETE' });

// ──────────────────────── Settings
export const listSettings = () => adminRequest('/settings');
export const upsertSetting = (body) =>
  adminRequest('/settings', { method: 'PUT', body });

// ──────────────────────── Promo codes
export const listPromos = () => adminRequest('/promos');
export const createPromo = (body) =>
  adminRequest('/promos', { method: 'POST', body });
export const updatePromo = (id, body) =>
  adminRequest(`/promos/${id}`, { method: 'PATCH', body });
export const deletePromo = (id) =>
  adminRequest(`/promos/${id}`, { method: 'DELETE' });
export const togglePromo = (id) =>
  adminRequest(`/promos/${id}/toggle`, { method: 'PATCH' });

// ──────────────────────── Uploads
export const uploadImage = (dataUrl) =>
  adminRequest('/uploads', { method: 'POST', body: { dataUrl } });
export const listUploads = () => adminRequest('/uploads');
export const deleteUpload = (filename) =>
  adminRequest(`/uploads/${encodeURIComponent(filename)}`, { method: 'DELETE' });

// ──────────────────────── Public (no auth) — used for preview
export async function publicRequest(endpoint) {
  const res = await fetch(`${PUBLIC}${endpoint}`);
  const data = await res.json().catch(() => ({ success: false }));
  if (!res.ok) throw new Error(data.error || 'request_failed');
  return data;
}

export const fetchAllProductsAdmin = () => adminRequest('/products');
