import { apiRequest, downloadRequest } from './client';

function query(path, params) {
  const search = new URLSearchParams(Object.entries(params || {}).filter(([, value]) => value !== '' && value != null));
  return `${path}?${search}`;
}

export const productsApi = {
  list: (params) => apiRequest(query('/channels/products', params)),
  summary: () => apiRequest('/channels/summary'),
  create: (body) => apiRequest('/products', { method: 'POST', body }),
  update: (id, body) => apiRequest(`/products/${id}`, { method: 'PATCH', body }),
  remove: (id) => apiRequest(`/products/${id}`, { method: 'DELETE' }),
  updateMeta: (id, body) => apiRequest(`/channels/products/${id}/meta`, { method: 'PATCH', body }),
  updateChannel: (id, channel, body) => apiRequest(`/channels/products/${id}/${channel}`, { method: 'PATCH', body }),
  link: (id, billzProductId) => apiRequest(`/channels/products/${id}/link`, { method: 'PATCH', body: { billzProductId } }),
  searchBillz: (params) => apiRequest(query('/channels/billz', params)),
  exportExcel: () => downloadRequest('/products/export'),
  importExcel: (file, apply = false) => {
    const body = new FormData();
    body.append('file', file);
    return apiRequest(`/products/import?apply=${apply ? '1' : '0'}`, { method: 'POST', body });
  },
};
