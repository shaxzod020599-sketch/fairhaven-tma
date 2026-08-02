import { apiRequest } from './client';

export const activityApi = {
  list: (params = {}) => {
    const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== '' && value != null));
    return apiRequest(`/activity?${query}`);
  },
  broadcasts: () => apiRequest('/broadcasts'),
  previewSegment: (segment) => apiRequest('/broadcasts/preview', { method: 'POST', body: { segment } }),
  createBroadcast: (body) => apiRequest('/broadcasts', { method: 'POST', body }),
  testBroadcast: (id) => apiRequest(`/broadcasts/${id}/test`, { method: 'POST' }),
  sendBroadcast: (id) => apiRequest(`/broadcasts/${id}/send`, { method: 'POST', body: { confirm: true } }),
};
