import { apiRequest, clearCsrfToken } from './client';

export const whoAmI = () => apiRequest('/auth/whoami');
export const startLogin = () => apiRequest('/auth/login/start', { method: 'POST' });
export const pollLogin = (pollToken) => apiRequest('/auth/login/poll', { method: 'POST', body: { pollToken } });
export const devLogin = () => apiRequest('/auth/dev', { method: 'POST' });

export async function logout() {
  try {
    await apiRequest('/auth/logout', { method: 'POST' });
  } finally {
    clearCsrfToken();
  }
}
