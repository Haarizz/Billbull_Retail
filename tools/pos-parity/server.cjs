// Same-origin stand-in for the production nginx vhost:
//   /pos/*            → apps/pos/dist (SPA fallback /pos/index.html)
//   /api/*, /uploads/* → backend (proxy)
//   /*                → billbull-frontend/dist (SPA fallback /index.html)
// The Origin header is stripped before proxying: on a real tenant the origin is the tenant's own
// allowlisted domain, so this stands in for that without adding a CORS entry for localhost.
// Point the backend at a disposable database, never a live tenant.
// Usage: node server.cjs <billbull-frontend dir> <port> <backendUrl>   (build both apps first)
const http = require('http');
const fs = require('fs');
const path = require('path');

const [frontendRoot, port, backend] = process.argv.slice(2);
const RETAIL = path.join(frontendRoot, 'dist');
const POS = path.join(frontendRoot, 'apps', 'pos', 'dist');
const backendUrl = new URL(backend);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2' };

function serveFile(res, file, cacheControl) {
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': cacheControl });
  fs.createReadStream(file).pipe(res);
}

function serveSpa(req, res, root, mount) {
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).slice(mount.length);
  const file = path.join(root, rel);
  if (file.startsWith(root) && fs.existsSync(file) && fs.statSync(file).isFile()) {
    return serveFile(res, file, rel.startsWith('assets/') ? 'public, max-age=31536000, immutable' : 'no-store');
  }
  return serveFile(res, path.join(root, 'index.html'), 'no-store');
}

http.createServer((req, res) => {
  const p = req.url;
  if (p.startsWith('/api/') || p.startsWith('/uploads/')) {
    const up = http.request({ hostname: backendUrl.hostname, port: backendUrl.port, path: p, method: req.method,
      headers: (({ origin, referer, ...h }) => ({ ...h, host: backendUrl.host, 'x-forwarded-for': '127.0.0.1' }))(req.headers) }, (r) => {
      res.writeHead(r.statusCode, r.headers);
      r.pipe(res);
    });
    up.on('error', (e) => { res.writeHead(502); res.end(String(e)); });
    return req.pipe(up);
  }
  if (p === '/pos') { res.writeHead(301, { Location: '/pos/' }); return res.end(); }
  if (p.startsWith('/pos/')) return serveSpa(req, res, POS, '/pos/');
  return serveSpa(req, res, RETAIL, '/');
}).listen(Number(port), '127.0.0.1', () => console.log(`smoke server on http://127.0.0.1:${port} → ${backend}`));
