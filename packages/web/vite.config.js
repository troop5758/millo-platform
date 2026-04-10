import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Dev: proxy API-served legal static HTML (footer uses `/legal/*.html` relative to the dev server). */
const API_DEV_TARGET = process.env.VITE_DEV_API_PROXY || 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@millo-config': path.resolve(__dirname, '../../config'),
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        // Object form breaks Rolldown (Vite 6+): it expects a function here.
        manualChunks(id) {
          const n = id.split('\\').join('/');
          if (n.includes('/node_modules/react-dom')) return 'vendor';
          if (n.includes('/node_modules/react/')) return 'vendor';
          if (/\/node_modules\/react(\/|$|\.)/.test(n)) return 'vendor';
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/legal': { target: API_DEV_TARGET, changeOrigin: true },
    },
  },
});
