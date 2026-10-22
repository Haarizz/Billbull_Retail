import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const appRoot = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(appRoot, '../..');

export const POS_BASE = '/pos/';
export const POS_DEV_PORT = 5174;
const devBackend = process.env.BILLBULL_DEV_BACKEND || 'http://localhost:8080';

// Standalone POS till. Served from /pos/ on the tenant's existing origin; API calls stay
// same-origin /api/** (axiosConfig falls back to window.location.origin when VITE_API_BASE_URL
// is empty, as in .env.production). Env files are Retail's (envDir) so both apps build with the
// same flags, e.g. VITE_USE_NEW_POS_PRINT_TEMPLATE.
export default defineConfig(({ command }) => {
  if (command === 'serve' && process.env.VITE_API_BASE_URL === undefined) {
    // Dev: talk to this dev server and let it proxy /api and /uploads to the backend, so the
    // browser stays same-origin exactly as in production and the backend needs no CORS entry for
    // the POS dev port. Pre-set VITE_API_BASE_URL in the shell to bypass the proxy.
    process.env.VITE_API_BASE_URL = `http://localhost:${POS_DEV_PORT}`;
  }

  return {
    root: appRoot,
    base: POS_BASE,
    envDir: frontendRoot,
    plugins: [react(), tailwindcss()],
    resolve: {
      // One React runtime: everything resolves from billbull-frontend/node_modules.
      dedupe: ['react', 'react-dom', 'react-router-dom'],
    },
    server: {
      port: POS_DEV_PORT,
      strictPort: true,
      proxy: {
        '/api': { target: devBackend, changeOrigin: true },
        '/uploads': { target: devBackend, changeOrigin: true },
      },
    },
    preview: {
      port: POS_DEV_PORT,
      strictPort: true,
      proxy: {
        '/api': { target: devBackend, changeOrigin: true },
        '/uploads': { target: devBackend, changeOrigin: true },
      },
    },
    build: {
      outDir: path.resolve(appRoot, 'dist'),
      emptyOutDir: true,
      chunkSizeWarningLimit: 1500,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('recharts')) return 'vendor-recharts';
            if (id.includes('jspdf') || id.includes('html2canvas')) return 'vendor-print';
            if (id.includes('qrcode') || id.includes('pngjs') || id.includes('buffer')) return 'vendor-qrcode';
            if (id.includes('lucide-react')) return 'vendor-icons';
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) return 'vendor-react';
            return undefined;
          },
        },
      },
    },
  };
});
