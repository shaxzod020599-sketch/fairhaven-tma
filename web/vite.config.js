import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Standalone public website — separate build from the Telegram mini-app.
// Consumes the same backend API (/api). Mini-app (frontend/) is untouched.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/legal': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        // React and the router change far less often than the site, so they get their own long-cached file.
        // Motion stays out of this split: its animation features load lazily (motion/features.js).
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/node_modules\/(react|react-dom|scheduler|react-router|react-router-dom|@remix-run)\//.test(id)) return 'react';
          return undefined;
        },
      },
    },
  },
});
