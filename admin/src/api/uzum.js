import { apiRequest } from './client';
export const uzumApi = {
  list(params = {}) { return apiRequest(`/uzum/orders?${new URLSearchParams(params)}`); },
  decide(id, body) { return apiRequest(`/uzum/orders/${encodeURIComponent(id)}/decision`, { method: 'POST', body }); },
};
