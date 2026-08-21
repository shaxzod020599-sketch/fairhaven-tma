import { apiRequest } from './client';

export const medicalkaApi = {
  list(params = {}) {
    const query = new URLSearchParams(
      Object.entries(params).filter(([, value]) => value !== '' && value != null),
    );
    return apiRequest(`/medicalka/approvals?${query}`);
  },
  detail(id) {
    return apiRequest(`/medicalka/approvals/${id}`);
  },
  respond(id, { action, comment = '' }) {
    return apiRequest(`/medicalka/approvals/${id}/respond`, {
      method: 'POST', body: { action, comment },
    });
  },
  listSubOrders(params = {}) {
    const query = new URLSearchParams(
      Object.entries(params).filter(([, value]) => value !== '' && value != null),
    );
    return apiRequest(`/medicalka/sub-orders?${query}`);
  },
  transitionSubOrder(id, status) {
    return apiRequest(`/medicalka/sub-orders/${id}/status`, {
      method: 'POST', body: { status },
    });
  },
  cancelSubOrder(id, reason) {
    return apiRequest(`/medicalka/sub-orders/${id}/cancel`, {
      method: 'POST', body: { reason },
    });
  },
  addSubOrderLabel(id, { itemId, label }) {
    return apiRequest(`/medicalka/sub-orders/${id}/labels`, {
      method: 'POST', body: { itemId, label },
    });
  },
};
