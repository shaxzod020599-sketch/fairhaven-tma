import { apiRequest } from './client';

export const yandexApi = {
  list(params = {}) { return apiRequest(`/yandex/orders?${new URLSearchParams(params)}`); },
  detail(id) { return apiRequest(`/yandex/orders/${encodeURIComponent(id)}`); },
  products(params = {}) { return apiRequest(`/yandex/products?${new URLSearchParams(params)}`); },
  updateItems(id, { items, expectedItemsRevision, reason = '' }) {
    return apiRequest(`/yandex/orders/${encodeURIComponent(id)}/items`, { method: 'PUT', body: {
      items: items.map(({ billzProductId, quantity }) => ({ billzProductId, quantity })),
      expectedItemsRevision, reason: reason.trim(),
    } });
  },
  decide(id, { action, expectedRevision, expectedItemsRevision, reason = '' }) {
    return apiRequest(`/yandex/orders/${encodeURIComponent(id)}/decision`, { method: 'POST', body: {
      action, expectedRevision, ...(action === 'accept' ? { expectedItemsRevision } : {}), reason: reason.trim(),
    } });
  },
};
