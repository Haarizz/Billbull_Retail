import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { createHash } from 'node:crypto';

const appRoot = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(appRoot, '../..');

export const POS_BASE = '/pos/';
export const POS_DEV_PORT = 5174;
// M3 offline MVP: lists every file of the build for the service worker (public/sw.js) to precache,
// so the till's shell and all of its lazily loaded chunks open with the server unreachable.
const swManifest = () => ({
  name: 'billbull-pos-sw-manifest',
  apply: 'build',
  generateBundle(_options, bundle) {
    const files = Object.keys(bundle).sort().map((f) => POS_BASE + f);
    const version = createHash('sha256').update(files.join(',')).digest('hex').slice(0, 16);
    this.emitFile({ type: 'asset', fileName: 'sw-manifest.json', source: JSON.stringify({ version, files: [POS_BASE, ...files] }) });
  },
});

const devBackend = process.env.BILLBULL_DEV_BACKEND || 'http://localhost:8080';

// Customer document links (/d/<token>, e.g. a WhatsApp receipt link) are a Retail page. In
// production nginx sends /d/ to Retail on the same origin; in dev the till runs on its own port,
// so hand those requests to the Retail dev server instead of Vite's "did you mean /pos/" notice.
const RETAIL_DEV_ORIGIN = process.env.BILLBULL_RETAIL_DEV_ORIGIN || 'http://localhost:5173';
const retailDocumentLinks = () => {
  const redirect = (req, res, next) => {
    if (!req.url || !req.url.startsWith('/d/')) return next();
    res.statusCode = 302;
    res.setHeader('Location', `${RETAIL_DEV_ORIGIN}${req.url}`);
    res.end();
  };
  return {
    name: 'billbull-retail-document-links',
    configureServer(server) { server.middlewares.use(redirect); },
    configurePreviewServer(server) { server.middlewares.use(redirect); },
  };
};

// The browser's Origin (localhost:5174) is not in the backend CORS allow-list, so Spring would
// 403 every proxied call. Drop it: to the backend the request then looks same-origin, as in prod.
const devProxy = {
  target: devBackend,
  changeOrigin: true,
  configure: (proxy) => {
    proxy.on('proxyReq', (proxyReq) => proxyReq.removeHeader('origin'));
  },
};

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
    plugins: [react(), tailwindcss(), swManifest(), retailDocumentLinks()],
    resolve: {
      // One React runtime: everything resolves from billbull-frontend/node_modules.
      dedupe: ['react', 'react-dom', 'react-router-dom'],
    },
    server: {
      port: POS_DEV_PORT,
      strictPort: true,
      proxy: {
        '/api': devProxy,
        '/uploads': devProxy,
      },
    },
    preview: {
      port: POS_DEV_PORT,
      strictPort: true,
      proxy: {
        '/api': devProxy,
        '/uploads': devProxy,
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
