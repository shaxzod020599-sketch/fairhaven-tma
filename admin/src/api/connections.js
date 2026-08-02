import { apiRequest } from './client';

export const connectionsApi = {
  syncStatus: () => apiRequest('/channels/sync'),
  triggerSync: () => apiRequest('/channels/sync', { method: 'POST' }),
  settings: () => apiRequest('/channels/settings'),
  saveSettings: (body) => apiRequest('/channels/settings', { method: 'PUT', body }),
  keys: () => apiRequest('/channels/keys'),
  issuePair: (body) => apiRequest('/channels/keys/pair', { method: 'POST', body }),
  importUzum: (body) => apiRequest('/channels/keys/import', { method: 'POST', body: { ...body, channel: 'uzum' } }),
  revoke: (id) => apiRequest(`/channels/keys/${id}/revoke`, { method: 'POST' }),
};
