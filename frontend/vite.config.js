import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Unique build id — changes every build, used by the client cache-bust check
const BUILD_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'fairhaven-inject-build-id',
      transformIndexHtml(html) {
        return html.replace(/__BUILD_ID__/g, BUILD_ID);
      },
    },
  ],
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
