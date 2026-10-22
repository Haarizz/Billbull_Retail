# Standalone POS — deployment

> **Status:** ready for review. **No production server, nginx vhost, certificate or tenant backend has been touched.** Running the steps below on a live server needs explicit rollout authorization.

The POS is a static bundle served at `/pos/` on each tenant's **existing** origin. It needs no new backend, database, port, certificate, CORS entry or Spring profile. The `/api/` and `/uploads/` proxy rules stay exactly as they are.

**Backend prerequisite (permission audit).** This branch adds a `sales.pos` check and branch scope to the existing POS endpoints, and makes adding, changing or removing cash drawers and printers need `pos.devices` / `pos.printers`. There is no schema or data change. Before deploying the backend to a tenant, run the read-only checks in [PERMISSIONS.md](PERMISSIONS.md#before-rollout) and resolve what they return. Otherwise users in those roles will get a 403 when they try to sell or to set up till hardware. The third pass (2026-10-10) adds checks 3–6. Counter, scanner and settings setup move to the `pos.*` keys. A network printer whose address is not a private LAN address on port 9100–9109 is refused, so correct it first. The defaults can be widened with `pos.printer.network.allowed-ports` / `allow-loopback` / `allow-public`; leave `allow-loopback` off outside development. There is still no schema or data change.

## 1. Build (on the server, alongside the usual Retail build)

```bash
cd /root/billbull/billbull-frontend
npm install            # links the @billbull/shared and @billbull/pos workspaces
npm run build          # Retail  → dist/            (unchanged)
npm run build:pos      # POS     → apps/pos/dist/   (new)
```

The POS bundle holds no tenant name, host, port or database, so one build serves every tenant on the server.

## 2. Install the bundle

The bundle goes **outside** `/var/www/billbull`, because the Retail update step runs `rm -rf /var/www/billbull/*`. It sits under a `pos/` folder so nginx can serve it with `root`, which avoids nginx's alias/try_files pitfalls.

```bash
mkdir -p /var/www/billbull-pos/pos
rm -rf /var/www/billbull-pos/pos/*
cp -r /root/billbull/billbull-frontend/apps/pos/dist/* /var/www/billbull-pos/pos/
ls -la /var/www/billbull-pos/pos/          # index.html, assets/
```

## 3. nginx (once per tenant vhost)

Add the four `location` blocks from [`nginx-pos-locations.conf`](nginx-pos-locations.conf) inside each tenant's 443 `server { }` block. Place them before `location / { try_files $uri $uri/ /index.html; }`. Leave `location /`, `/assets/`, `/uploads/` and `/api/` unchanged.

```nginx
location = /pos { return 301 /pos/; }

location = /pos/index.html {
    root /var/www/billbull-pos;
    add_header Cache-Control "no-store, no-cache, must-revalidate" always;
}

location ^~ /pos/assets/ {
    root /var/www/billbull-pos;
    try_files $uri =404;
    add_header Cache-Control "public, max-age=31536000, immutable" always;
}

location ^~ /pos/ {
    root /var/www/billbull-pos;
    try_files $uri /pos/index.html;
}
```

Then:

```bash
nginx -t && systemctl reload nginx
```

### What the snippet was verified to do

These were checked against nginx 1.26.3 locally, with the real Retail and POS builds staged as above and the four blocks included in a vhost shaped like `DEPLOYMENT_GUIDE.md`'s:

| Request | Result |
|---|---|
| `nginx -t` | syntax ok, test successful |
| `/pos` | 301 → `/pos/` |
| `/pos/`, `/pos/login`, `/pos/any/deep/route`, `/pos/index.html` | 200, POS app shell, `Cache-Control: no-store, no-cache, must-revalidate` |
| `/pos/assets/index-<hash>.js` | 200, `application/javascript`, a single `Cache-Control: public, max-age=31536000, immutable` |
| `/pos/assets/missing.js` | 404 (never the app shell) |
| `/`, `/sales/pos`, `/dashboard`, `/assets/<retail>.js` | Retail, unchanged |
| `/api/auth/profile` | proxied to the backend unchanged (401 without a token) |

The built POS `index.html` references `/pos/assets/...`. Its API calls are same-origin `/api/...`, never `/pos/api/...`.

## 4. Smoke check after deploy

1. Open `https://<tenant-host>/pos/`. The till sign-in appears.
2. Sign in as a cashier. The till opens on the POS dashboard, with the branch code in the left rail.
3. `https://<tenant-host>/sales/pos` still works for the same user.
4. In DevTools → Network, requests go to `https://<tenant-host>/api/...`.

## 5. Updating later

Repeat steps 1 and 2. No nginx reload is needed: `index.html` is never cached, and new assets have new hashes.

To update both apps on a server in one go, add these lines after the existing frontend copy in `UPDATE_RUNNING_CLIENTS.md`:

```bash
cd /root/billbull/billbull-frontend && npm run build:pos \
  && mkdir -p /var/www/billbull-pos/pos && rm -rf /var/www/billbull-pos/pos/* \
  && cp -r apps/pos/dist/* /var/www/billbull-pos/pos/
```

## 6. Docker image (if used)

The Retail `billbull-frontend/Dockerfile` now copies both workspace manifests before `npm ci`. A POS image, if one is ever wanted, is the same build with `npm run build:pos` and `apps/pos/dist` served under `/pos/`. None has been built.

## Rollback

POS rollback never touches the backend or database, because both apps use the same API and data.

- **Per till:** point the till's bookmark or shortcut back to `https://<tenant-host>/sales/pos`. The device fingerprint and terminal id are the same on both paths (same origin, same localStorage keys), so the till keeps its terminal, and an open POS session can be continued there.
- **Per tenant:** remove the four `/pos` `location` blocks and run `nginx -t && systemctl reload nginx`. `/pos/` then falls through to Retail, and a signed-in user lands on the Retail app.
- **Server-wide:** additionally `rm -rf /var/www/billbull-pos`.

Do **not** remove `/sales/pos` during rollout or pilot. See `PILOT_AND_ROLLBACK.md`.
