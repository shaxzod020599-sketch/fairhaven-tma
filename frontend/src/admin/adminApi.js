import { getTelegramInitData } from '../utils/telegram';

const API = '/api/admin';
const PUBLIC = '/api';

/**
 * Every admin call authenticates with Telegram's signed initData and nothing
 * else. There was once a pair of helpers here for a locally-stored Telegram id;
 * they only ever removed a key nothing wrote, and the login form that called
 * them could not succeed. Accepting a typed id would have been no proof of
 * identity at all, so the form is gone rather than repaired.
 */
async function adminRequest(endpoint, options = {}) {
  const initData = getTelegramInitData();
  const headers = {
    'Content-Type': 'application/json',
    ...(initData ? { 'X-Telegram-Init-Data': initData } : {}),
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

// ──────────────────────── Sales channels (Medicalka, Uzum)
export const listChannelProducts = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return adminRequest(`/channels/products${qs ? `?${qs}` : ''}`);
};
export const channelSummary = () => adminRequest('/channels/summary');
export const updateProductChannel = (id, channel, body) =>
  adminRequest(`/channels/products/${id}/${channel}`, { method: 'PATCH', body });
export const updateProductChannelMeta = (id, body) =>
  adminRequest(`/channels/products/${id}/meta`, { method: 'PATCH', body });
export const linkProductToBillz = (id, billzProductId) =>
  adminRequest(`/channels/products/${id}/link`, { method: 'PATCH', body: { billzProductId } });
export const bulkUpdateChannel = (channel, body) =>
  adminRequest(`/channels/bulk/${channel}`, { method: 'POST', body });
export const searchBillzProducts = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return adminRequest(`/channels/billz${qs ? `?${qs}` : ''}`);
};
export const channelSyncStatus = () => adminRequest('/channels/sync');
export const triggerChannelSync = () => adminRequest('/channels/sync', { method: 'POST' });
export const channelSettings = () => adminRequest('/channels/settings');
export const updateChannelSettings = (body) =>
  adminRequest('/channels/settings', { method: 'PUT', body });

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
