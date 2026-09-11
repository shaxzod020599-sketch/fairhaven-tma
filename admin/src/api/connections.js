import { apiRequest } from './client';

export const connectionsApi = {
  connectionDetails: () => apiRequest('/channels/connections'),
  saveConnectionPlace: (body) => apiRequest('/channels/connections/place', { method: 'PUT', body }),
  revealConnection: (id) => apiRequest(`/channels/connections/${encodeURIComponent(id)}/reveal`, { method: 'POST', body: {} }),
  restoreConnection: (id, body) => apiRequest(`/channels/connections/${encodeURIComponent(id)}/secret`, { method: 'PUT', body }),
  syncStatus: () => apiRequest('/channels/sync'),
  triggerSync: () => apiRequest('/channels/sync', { method: 'POST' }),
  settings: () => apiRequest('/channels/settings'),
  saveSettings: (body) => apiRequest('/channels/settings', { method: 'PUT', body }),
  keys: () => apiRequest('/channels/keys'),
  issuePair: (body) => apiRequest('/channels/keys/pair', { method: 'POST', body }),
  issueUzum: ({ label }) => apiRequest('/channels/keys', {
    method: 'POST', body: { channel: 'uzum', kind: 'oauth', label },
  }),
  issueYandex: ({ label }) => apiRequest('/channels/keys', {
    method: 'POST', body: { channel: 'yandex', kind: 'oauth', label },
  }),
  importUzum: (body) => apiRequest('/channels/keys/import', { method: 'POST', body: { ...body, channel: 'uzum' } }),
  revoke: (id) => apiRequest(`/channels/keys/${id}/revoke`, { method: 'POST' }),
  medicalkaPartner: () => apiRequest('/channels/medicalka/partner'),
  saveMedicalkaPartner: (environment, body) => apiRequest(
    `/channels/medicalka/partner/profiles/${environment}`, { method: 'PUT', body },
  ),
  activateMedicalkaPartner: (environment) => apiRequest(
    '/channels/medicalka/partner/activate', { method: 'POST', body: { environment } },
  ),
  setMedicalkaPartnerMode: (environment, processingMode) => apiRequest(
    '/channels/medicalka/partner/mode', {
      method: 'POST', body: { environment, processingMode },
    },
  ),
};
