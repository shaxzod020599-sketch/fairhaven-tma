import { apiRequest } from './client';

export const ordersApi = {
  list(params = {}) {
    const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== '' && value != null));
    return apiRequest(`/orders?${query}`);
  },
  detail(id) {
    return apiRequest(`/orders/${id}`);
  },
  transition(id, { to, reason = '' }) {
    return apiRequest(`/orders/${id}/transition`, { method: 'POST', body: { to, reason } });
  },
  addNote(id, text) {
    return apiRequest(`/orders/${id}/notes`, { method: 'POST', body: { text } });
  },
  claim(id, body = {}) {
    return apiRequest(`/orders/${id}/claim`, { method: 'POST', body });
  },
  revert(id) {
    return apiRequest(`/orders/${id}/revert`, { method: 'POST' });
  },
};
