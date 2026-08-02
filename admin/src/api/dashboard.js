import { apiRequest } from './client';

export const loadDashboard = (period = '7d') => apiRequest(`/dashboard?period=${encodeURIComponent(period)}`);
export const globalSearch = (q) => apiRequest(`/search?q=${encodeURIComponent(q)}`);
