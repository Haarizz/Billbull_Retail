import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const appRoot = path.dirname(fileURLToPath(import.meta.url));

export const ADMIN_DEV_PORT = 5175;

// The control plane's API (billbull-platform). In production nginx serves this bundle and
// proxies /api/ to the platform service on the same origin (admin.billbull.app).
const platformBackend = process.env.BILLBULL_PLATFORM_BACKEND || 'http://localhost:8095';

const devProxy = {
  target: platformBackend,
  changeOrigin: true,
  // Same-origin to the platform, as in production, so it needs no CORS entry for the dev port.
  configure: (proxy) => {
    proxy.on('proxyReq', (proxyReq) => proxyReq.removeHeader('origin'));
  },
};

export default defineConfig({
  root: appRoot,
  base: '/',
  envDir: appRoot,
  plugins: [react(), tailwindcss()],
  resolve: {
    dedupe: ['react', 'react-dom', 'react-router-dom'],
  },
  server: {
    port: ADMIN_DEV_PORT,
    strictPort: true,
    proxy: { '/api': devProxy },
  },
  preview: {
    port: ADMIN_DEV_PORT,
    strictPort: true,
    proxy: { '/api': devProxy },
  },
  build: {
    outDir: path.resolve(appRoot, 'dist'),
    emptyOutDir: true,
    sourcemap: false,
  },
});
