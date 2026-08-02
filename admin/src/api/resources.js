import { apiRequest } from './client';

const qs = (path, params = {}) => `${path}?${new URLSearchParams(Object.entries(params).filter(([, value]) => value !== '' && value != null))}`;

export const customersApi = {
  list: (params) => apiRequest(qs('/users', params)),
  detail: (telegramId) => apiRequest(`/users/${telegramId}`),
  update: (telegramId, body) => apiRequest(`/users/${telegramId}`, { method: 'PATCH', body }),
  setBlocked: (telegramId, blocked) => apiRequest(`/users/${telegramId}/block`, { method: 'PATCH', body: { blocked } }),
};

export const adminsApi = {
  list: () => apiRequest('/admins'),
  search: (search) => apiRequest(qs('/users', { search, role: 'user', registered: true, page: 1, limit: 20 })),
  promote: (user) => apiRequest('/admins', { method: 'POST', body: { telegramId: user.telegramId, firstName: user.firstName, lastName: user.lastName } }),
  demote: (telegramId) => apiRequest(`/admins/${telegramId}`, { method: 'DELETE' }),
};

export const promosApi = {
  list: (params = {}) => apiRequest(qs('/promos', params)),
  create: (body) => apiRequest('/promos', { method: 'POST', body }),
  update: (id, body) => apiRequest(`/promos/${id}`, { method: 'PATCH', body }),
  remove: (id) => apiRequest(`/promos/${id}`, { method: 'DELETE' }),
  toggle: (id) => apiRequest(`/promos/${id}/toggle`, { method: 'PATCH' }),
};

export const collectionsApi = {
  list: () => apiRequest('/collections'),
  create: (body) => apiRequest('/collections', { method: 'POST', body }),
  update: (id, body) => apiRequest(`/collections/${id}`, { method: 'PATCH', body }),
  remove: (id) => apiRequest(`/collections/${id}`, { method: 'DELETE' }),
  products: (search) => apiRequest(qs('/products', { search, page: 1, limit: 50 })),
};

export const settingsApi = {
  list: () => apiRequest('/settings'),
  save: (body) => apiRequest('/settings', { method: 'PUT', body }),
  remove: (key) => apiRequest(`/settings/${encodeURIComponent(key)}`, { method: 'DELETE' }),
};

export const galleryApi = {
  list: () => apiRequest('/uploads'),
  upload: (dataUrl) => apiRequest('/uploads', { method: 'POST', body: { dataUrl } }),
  remove: (filename) => apiRequest(`/uploads/${encodeURIComponent(filename)}`, { method: 'DELETE' }),
};
