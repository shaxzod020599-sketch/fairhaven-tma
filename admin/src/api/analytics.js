import { apiRequest, downloadRequest } from './client';

function query(path, params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded ? `${path}?${encoded}` : path;
}

function apiParams(params = {}) {
  const { period, ...rest } = params;
  if (!period || rest.preset) return rest;
  return { ...rest, preset: period };
}

export const analyticsApi = {
  summary: (params) => apiRequest(query('/sales/summary', apiParams(params))),
  history: (params) => apiRequest(query('/sales/history', apiParams(params))),
  billzSummary: (params) => apiRequest(query('/billz/summary', apiParams(params))),
  billzHistory: (params) => apiRequest(query('/billz/history', apiParams(params))),
  exportSales: (params) => downloadRequest(query('/sales/export', apiParams(params))),
  exportBillz: (params) => downloadRequest(query('/billz/export', apiParams(params))),
};

export { apiParams as analyticsApiParams, query as analyticsQuery };
