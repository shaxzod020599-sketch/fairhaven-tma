import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/',
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    // The panel is reached at http://admin.localhost:5173 so the backend's
    // admin host gate sees its configured hostname. changeOrigin stays off on
    // purpose: the proxy must forward that Host header, not rewrite it.
    allowedHosts: ['admin.localhost'],
    proxy: {
      '/api': { target: 'http://127.0.0.1:3001', changeOrigin: false },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    restoreMocks: true,
    clearMocks: true,
  },
});
