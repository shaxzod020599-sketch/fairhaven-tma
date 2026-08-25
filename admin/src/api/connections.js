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
