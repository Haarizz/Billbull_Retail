# max.billbull.app → k3s on 77.37.49.42 — DONE (2026-07-16)

**Status: complete and verified.** `max.billbull.app` is live on k3s. Login, existing
data, PDF generation (Playwright), and image upload all confirmed working by hand in
the browser. `billbull-max.service` is stopped and disabled.

This file is now both a record of what was actually done for `max` and a corrected
template for migrating `nest`, `hilite`, `albadar` next — the steps below reflect what
really worked, not the original plan (several assumptions from the first draft were
wrong; each is called out so the same mistakes aren't repeated).

## What actually happened, vs. the original plan

- **Traefik took over ports 80/443 entirely — no alt-port workaround was used.**
  The original Section 3 (disable Traefik, run it on alt ports so nginx could keep
  serving `nest`/`hilite`/`albadar`) was written, but at execution time the decision was
  made to just stop nginx and let Traefik own 80/443 immediately, taking `nest`/`hilite`/
  `albadar` offline deliberately (their JVMs stopped, not migrated). If a future
  migration needs to keep other nginx-served clients alive during a pilot, the alt-port
  approach is still valid and untested — otherwise, skip straight to `systemctl stop
  nginx && systemctl disable nginx` once you're ready to commit this server to k8s.
- **The pod CIDR is `10.42.0.0/24`, not `/16`.** Confirmed via `ip route | grep 10.42`
  showing `10.42.0.0/24 dev cni0`. Use `/24` in `pg_hba.conf`, not the generic `/16`
  guess from k3s's docs.
- **`listen_addresses` was commented out** (`#listen_addresses = 'localhost'` on line 60
  of `/etc/postgresql/16/main/postgresql.conf`), not set to a value — `sed` needs to
  target the exact commented line, a naive `s/localhost/*/` substitution silently
  matches nothing. Always `grep -n listen_addresses` first to see the real line before
  editing.
- **`postgresql.service` reports `active (exited)` even when Postgres is healthy** — on
  Debian/Ubuntu it's a meta-unit (`ExecStart=/bin/true`); check the real per-version
  unit instead: `systemctl status postgresql@16-main`.
- **The Playwright/Chromium Dockerfile step needed two real fixes, not the one
  originally written:**
  1. `java -cp app.jar com.microsoft.playwright.CLI` fails — a Spring Boot fat jar nests
     dependencies under `BOOT-INF/lib/*.jar`, invisible to a plain `-cp`.
  2. `java -jar playwright-1.49.0.jar` also fails — that jar has no `Main-Class` in its
     manifest (verified: `unzip -p playwright-1.49.0.jar META-INF/MANIFEST.MF`).
  3. The fix: `mvn dependency:copy-dependencies -DincludeGroupIds=com.microsoft.playwright`
     to assemble all 3 jars Playwright actually needs (`playwright`, `driver`,
     `driver-bundle` — confirmed via `mvn dependency:tree -Dincludes=com.microsoft.playwright`,
     no jackson/gson involved) into one folder, then `java -cp "playwright-lib/*"
     com.microsoft.playwright.CLI install --with-deps chromium`.
  4. **Trap to avoid:** `-DincludeArtifactIds=playwright` looks like it should work but
     only copies the named artifact itself, not its transitive deps — verified by
     inspecting the copied folder inside the build stage (`docker build --target build`
     + `docker run --rm <tag> ls /app/playwright-lib`) before wasting a full build+
     Chromium-download cycle on a guess. Use `-DincludeGroupIds` instead.
- **`/uploads` was skipped entirely for `max`** — it had zero real uploads (confirmed
  before assuming otherwise). See "Uploads" section below for what to do differently
  for `nest`/`hilite`/`albadar`, which likely do have real data.
- **DNS was already pointing at 77.37.49.42** — no DNS change was needed; the
  Let's Encrypt HTTP-01 challenge resolved immediately once Traefik owned port 80.

## 0. Before touching the server (still valid, do this per client)

- [ ] `sudo systemctl cat billbull-<client>` — get the real `Environment=` lines. For
      `max`, there were none beyond `PLAYWRIGHT_BROWSERS_PATH` — meaning DB creds and
      JWT secret were coming from the checked-in `application-<profile>.properties` /
      base `application.properties` fallback, not a systemd override. Don't assume an
      override exists; check.
- [ ] `systemctl show billbull-<client> -p WorkingDirectory` — confirms where relative
      `uploads/` resolves. For all 4 clients on this server it was the same shared path
      (`/root/Billbull/Billbull_Retail/billbull-backend`) — confirm this is still true
      per client before assuming.
- [ ] Confirm the DB name from `application-<profile>.properties`
      (`spring.datasource.url`), and independently verify the password against the live
      systemd unit — the checked-in file's value is not proof of what's actually live if
      anyone rotated it.

## 1. Build images on the server (pilot approach — no registry)

```bash
docker --version || (curl -fsSL https://get.docker.com | sh)

cd ~/Billbull/Billbull_Retail
git pull origin main   # make sure you're on the latest Dockerfile — see fixes above

cd billbull-backend
docker build -t billbull-backend:pilot .   # ~2 min first time, seconds after (layer cache)

cd ../billbull-frontend
docker build -t billbull-frontend:pilot .
```

If the backend build fails at the Chromium install step, don't guess at another Maven
flag — verify what actually landed in the intermediate stage first:

```bash
docker build --target build -t debug-build-stage .
docker run --rm debug-build-stage ls -la /app/playwright-lib
```

Should show exactly 3 jars: `playwright-1.49.0.jar`, `driver-1.49.0.jar`,
`driver-bundle-1.49.0.jar`.

Import into k3s's containerd (skips needing a registry):

```bash
docker save billbull-backend:pilot | sudo k3s ctr images import -
docker save billbull-frontend:pilot | sudo k3s ctr images import -
sudo k3s ctr images ls | grep billbull
```

The manifests already reference `billbull-backend:pilot` / `billbull-frontend:pilot`
(no registry prefix) with `imagePullPolicy: Never` — this only works because the image
was imported locally on this exact node.

## 2. Install k3s (skip if already installed on this server)

```bash
curl -sfL https://get.k3s.io | sh -
sudo systemctl status k3s
mkdir -p ~/.kube
sudo cp /etc/rancher/k3s/k3s.yaml ~/.kube/config
sudo chown $(id -u):$(id -g) ~/.kube/config
kubectl get nodes
```

## 3. Hand ports 80/443 to Traefik (skip if already done)

Only do this once you're ready to take any remaining nginx-served clients on this
server offline (or have already migrated them to k8s Ingress) — this is a hard cutover,
not incremental:

```bash
sudo systemctl stop nginx
sudo systemctl disable nginx
curl -sI http://127.0.0.1:80   # confirm Traefik answers (its own 404 page, not nginx's)
```

`ss -tlnp | grep :80` will NOT show Traefik — klipper-lb (k3s's ServiceLB) does
port-forwarding via iptables/nftables inside its own pod netns, not a host-visible
`bind()`. Use `curl` against `127.0.0.1`, not `ss`, to check whether it's live.

## 4. cert-manager + ClusterIssuer (skip if already installed cluster-wide)

```bash
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/latest/download/cert-manager.yaml
kubectl get pods -n cert-manager --watch   # wait for all 3 Running, Ctrl+C

kubectl apply -f k8s/max/cluster-issuer.yaml   # cluster-wide, only needed once total
kubectl get clusterissuer letsencrypt-prod     # wait for READY=True
```

## 5. Postgres — open to the pod network (once per server, not per client)

```bash
sudo -u postgres psql -c "SHOW config_file;"      # confirm exact path
grep -n listen_addresses /etc/postgresql/16/main/postgresql.conf   # find the real line number/format first

# uncomment + widen (adjust line number to match what grep found):
sudo sed -i "60s/^#listen_addresses = 'localhost'/listen_addresses = '*'/" /etc/postgresql/16/main/postgresql.conf

sudo systemctl restart postgresql
sudo systemctl status postgresql@16-main --no-pager   # NOT `postgresql` — that's a meta-unit, always shows "exited"
sudo ss -tlnp | grep 5432   # should show 0.0.0.0:5432, not just 127.0.0.1
```

Add one `pg_hba.conf` line **per client DB** (repeat this part for nest/hilite/albadar,
substituting the DB name):

```bash
echo "host    billbull_max    postgres    10.42.0.0/24    md5" | sudo tee -a /etc/postgresql/16/main/pg_hba.conf
sudo systemctl restart postgresql
```

## 6. Per-client: namespace, ConfigMap, PVC, Secret

(Namespace only needs creating once — `billbull` is shared across all clients on this
server, same as today's shared nginx/server model.)

```bash
cd ~/Billbull/Billbull_Retail
kubectl apply -f k8s/max/namespace.yaml
kubectl apply -f k8s/max/configmap.yaml
kubectl apply -f k8s/max/pvc.yaml

cp k8s/max/secret.template.yaml k8s/max/secret.yaml
nano k8s/max/secret.yaml   # fill in real DB URL/user/password + JWT_SECRET — see step 0
kubectl apply -f k8s/max/secret.yaml
git status --short k8s/max/   # MUST show nothing — secret.yaml is gitignored, confirm before moving on
```

## 7. Uploads

For `max`: skipped, zero real uploads existed. **For nest/hilite/albadar, do not
assume the same** — check each client's actual upload count/size first
(`du -sh` won't tell you which files are whose since they're commingled in one shared
folder; query each client's DB for referenced file paths instead, or just re-upload the
real files by hand through the app once it's live on k8s if the count is small).

## 8. Deploy backend, then frontend + Ingress

```bash
kubectl apply -f k8s/max/deployment.yaml
kubectl get pods -n billbull -l app=max-backend --watch   # Ctrl+C once Running

kubectl logs -n billbull deploy/max-backend --tail=200 | grep -iE "error|exception|failed"
# should return nothing

kubectl apply -f k8s/max/frontend.yaml   # only needed once — shared across all clients
kubectl apply -f k8s/max/ingress.yaml
kubectl get certificate -n billbull max-tls   # wait for READY=True
```

## 9. Verify — visit the real domain directly

DNS was already pointing at this server for `max`, so no `/etc/hosts` trick was needed
— just visit `https://<client>.billbull.app` directly once the certificate is `READY`.

- [ ] Page loads, valid padlock
- [ ] Login works
- [ ] Existing data visible
- [ ] PDF generation works (invoice/report)
- [ ] Image upload works

## 10. Retire the old systemd service

```bash
sudo systemctl stop billbull-<client>     # already stopped if you took it offline in step 3
sudo systemctl disable billbull-<client>
```

## Rollback

Nothing in steps 1–8 touches the old systemd unit or its local `uploads/` directory —
if verification fails, the fastest rollback is `sudo systemctl enable --now
billbull-<client>` and, if nginx was already stopped for this migration,
`sudo systemctl enable --now nginx` (note: this only restores clients whose nginx
`server{}` blocks are unchanged — it does not undo any DNS changes, but none were made
for `max`).
