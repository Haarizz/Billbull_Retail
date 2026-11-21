/* BillBull Standalone POS service worker (M3 offline MVP).
 *
 * Caches the till's application shell so /pos/ opens when the server cannot be reached. It never
 * touches /api/ or /uploads/: data the till keeps offline lives in IndexedDB, written by the app.
 *
 *   install   precache every file of the current build (sw-manifest.json, emitted at build time)
 *   activate  take control of open tills
 *   fetch     navigations: network first (fresh deploys win), the cached shell when offline;
 *             after every successful online navigation the precache is re-synced with the
 *             server's current manifest, so a redeploy is cached in full before the next outage
 *             (this file itself does not change between builds, so it is not reinstalled);
 *             hashed assets: cache first; other /pos/ files: network first, cache as fallback
 */
const PREFIX = 'bb-pos-shell-';
const BASE = new URL(self.registration.scope).pathname; // '/pos/'
const NAV_TIMEOUT_MS = 4000;

let syncing = null;
async function syncPrecache() {
  if (syncing) return syncing;
  syncing = (async () => {
    const res = await fetch(`${BASE}sw-manifest.json`, { cache: 'no-store' });
    if (!res.ok) return;
    const manifest = await res.json();
    const name = PREFIX + manifest.version;
    const names = await caches.keys();
    if (!names.includes(name)) {
      const cache = await caches.open(name);
      // The shell itself is precached explicitly: the build manifest lists hashed files only.
      await cache.addAll([BASE, `${BASE}index.html`, ...manifest.files].filter((v, i, a) => a.indexOf(v) === i)
        .map((f) => new Request(f, { cache: 'reload' })));
    }
    // Only once the new cache is complete are older builds dropped.
    await Promise.all((await caches.keys()).filter((n) => n.startsWith(PREFIX) && n !== name).map((n) => caches.delete(n)));
  })().finally(() => { syncing = null; });
  return syncing;
}

self.addEventListener('install', (event) => {
  event.waitUntil(syncPrecache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

const withTimeout = (promise, ms) => new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('timeout')), ms);
  promise.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
});

const cachedShell = async () => (await caches.match(`${BASE}index.html`)) || (await caches.match(BASE));

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await withTimeout(fetch(req), NAV_TIMEOUT_MS);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        event.waitUntil(syncPrecache().catch(() => {}));
        return res;
      } catch {
        return (await cachedShell()) || Response.error();
      }
    })());
    return;
  }

  if (url.pathname.startsWith(`${BASE}assets/`)) {
    event.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      return fetch(req);
    })());
    return;
  }

  event.respondWith((async () => {
    try {
      return await fetch(req);
    } catch (err) {
      const cached = await caches.match(req, { ignoreSearch: true });
      if (cached) return cached;
      throw err;
    }
  })());
});
