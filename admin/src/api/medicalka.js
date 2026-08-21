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
};
