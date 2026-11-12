import { apiRequest, downloadRequest } from './client';

const code = (value) => encodeURIComponent(value);

export const partnersApi = {
  list: () => apiRequest('/partners'),
  guide: () => downloadRequest('/partners/guide.pdf'),
  create: (body) => apiRequest('/partners', { method: 'POST', body }),
  update: (partner, body) => apiRequest(`/partners/${code(partner)}`, { method: 'PATCH', body }),
  issueKeys: (partner) => apiRequest(`/partners/${code(partner)}/keys`, { method: 'POST', body: {} }),
  webhookSecret: (partner) => apiRequest(`/partners/${code(partner)}/webhook-secret`),
  rotateWebhookSecret: (partner) => apiRequest(`/partners/${code(partner)}/webhook-secret`, { method: 'POST', body: {} }),
  testWebhook: (partner) => apiRequest(`/partners/${code(partner)}/webhook/test`, { method: 'POST', body: {} }),
  orders: (partner) => apiRequest(`/partners/${code(partner)}/orders?limit=30`),
  decide: (id, action) => apiRequest(`/partners/orders/${code(id)}/decision`, { method: 'POST', body: { action } }),
  cancel: (id) => apiRequest(`/partners/orders/${code(id)}/cancel`, { method: 'POST', body: {} }),
};
