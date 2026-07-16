# Pilot migration: max.billbull.app → k3s on 77.37.49.42

Manifests referenced below live in `k8s/max/` in this repo. Server also runs
`nest`, `hilite`, `albadar` on nginx/systemd — those are untouched by this runbook
until `max` is verified and you deliberately migrate them later.

Do these steps in order. Stop and report back at any `CHECK` line before continuing.

## 0. Before touching the server

- [ ] Confirm current `max` config: `cat /etc/systemd/system/billbull-max.service` on 77.37.49.42 — copy the `Environment=` lines (DB URL/user/password, JWT_SECRET). You'll need them for step 4.
- [ ] Confirm the DB name backing `max` (likely `client2_db` or similar — check the actual `SPRING_DATASOURCE_URL` value, don't assume).
- [ ] Note current `/uploads` path size: `du -sh ~/Billbull/Billbull_Retail/billbull-backend/uploads` (or wherever it resolves relative to `upload.path=uploads/` and the working dir of the systemd unit).

## 1. Build images directly on 77.37.49.42 (pilot only — no registry needed)

Decision for this pilot: build on the server itself and load straight into k3s's
containerd via `k3s ctr images import`, skipping GHCR entirely. Revisit this once
`max` is verified and you're templating the rest via Helm (Section 7 of the main
guide) — at that point a real registry is worth setting up so you're not rebuilding
on every server by hand.

```bash
# on 77.37.49.42, repo already pulled to ~/Billbull/Billbull_Retail
docker --version || (curl -fsSL https://get.docker.com | sh)   # install Docker if not present

cd ~/Billbull/Billbull_Retail/billbull-backend
docker build -t billbull-backend:pilot .

cd ~/Billbull/Billbull_Retail/billbull-frontend
docker build -t billbull-frontend:pilot .
```

The backend build's Chromium install step (`RUN java -cp app.jar ... install --with-deps chromium`)
downloads ~300MB and can take a few minutes — that's expected, not a hang.

**CHECK:** `docker images | grep billbull` shows both `billbull-backend:pilot` and
`billbull-frontend:pilot` before continuing.

Once k3s is installed (step 2), import both images into its containerd so pods can
use them without a registry:

```bash
docker save billbull-backend:pilot | sudo k3s ctr images import -
docker save billbull-frontend:pilot | sudo k3s ctr images import -
```

**Manifest change needed:** `k8s/max/deployment.yaml` and `k8s/max/frontend.yaml`
currently reference `ghcr.io/billbull/backend:pilot` / `ghcr.io/billbull/frontend:pilot`.
For this pilot, change both to `billbull-backend:pilot` / `billbull-frontend:pilot`
(no registry prefix) and add `imagePullPolicy: Never` to each container spec, so
kubelet uses the locally-imported image instead of trying to pull from a registry
that doesn't have it.

## 2. Install k3s on 77.37.49.42

```bash
ssh root@77.37.49.42

curl -sfL https://get.k3s.io | sh -
sudo systemctl status k3s

mkdir -p ~/.kube
sudo cp /etc/rancher/k3s/k3s.yaml ~/.kube/config
sudo chown $(id -u):$(id -g) ~/.kube/config
kubectl get nodes
```

**CHECK:** `kubectl get nodes` shows one node, `Ready`.

> Traefik (k3s's built-in Ingress) binds ports 80/443. This server's nginx currently
> also wants 80/443 for `nest`/`hilite`/`albadar`. They will conflict.
> **Do not let Traefik take over 80/443 while those 3 clients are still live on nginx.**
> See step 3.

## 3. Keep nginx and Traefik from fighting over ports

Since this is a pilot for `max` only, the other three clients must keep working on nginx during the test. Two options — pick one:

- **Option A (recommended for pilot):** disable Traefik's default port binding and instead expose it on alternate ports (e.g. 8443/8080) just for testing, then do a real cutover (stop nginx entirely, let Traefik take 80/443) only once you're ready to migrate all 4 clients on this server together.
- **Option B:** just accept a brief window where nginx is stopped, test `max` end-to-end quickly, then restart nginx. Riskier — nest/hilite/albadar go down during the window.

Recommend Option A. Disable Traefik's default service and re-expose on alt ports:

```bash
sudo systemctl stop k3s
sudo mkdir -p /etc/rancher/k3s
cat <<'EOF' | sudo tee /etc/rancher/k3s/config.yaml
disable:
  - traefik
EOF
sudo systemctl start k3s

kubectl apply -f https://raw.githubusercontent.com/traefik/traefik-helm-chart/master/traefik/values.yaml 2>/dev/null || true
```

Then install Traefik via Helm with alt ports (simplest path — ask me to generate the exact `values.yaml` when you're at this step, since the right approach depends on which k3s version lands and whether Helm is available on the box).

**CHECK:** tell me the k3s version (`k3s --version`) and whether `helm` is installed (`helm version`) before we lock in the exact Traefik config — I'll hand you the precise values file.

## 4. cert-manager + ClusterIssuer

```bash
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/latest/download/cert-manager.yaml
kubectl get pods -n cert-manager --watch
```

Wait for all 3 cert-manager pods `Running`, then Ctrl+C and:

```bash
kubectl apply -f k8s/max/cluster-issuer.yaml
```

(Copy `k8s/max/cluster-issuer.yaml` from this repo to the server first, e.g. via `scp` or `git pull` if the repo is cloned there.)

## 5. Namespace, ConfigMap, PVC

```bash
kubectl apply -f k8s/max/namespace.yaml
kubectl apply -f k8s/max/configmap.yaml
kubectl apply -f k8s/max/pvc.yaml
```

## 6. Secret — fill in real values

```bash
cp k8s/max/secret.template.yaml k8s/max/secret.yaml
# edit secret.yaml with the real DB URL/user/password + JWT_SECRET from step 0
kubectl apply -f k8s/max/secret.yaml
```

`secret.yaml` is gitignored (see `.gitignore` — `k8s/**/secret.yaml`) — never commit it.

**Confirmed values for max (2026-07-16, pulled from the live systemd unit and DB):**
- Host IP: `77.37.49.42` (eth0, confirmed via `ip addr show`)
- DB name: `billbull_max`
- DB username: `postgres`
- DB password: whatever is actually live — the systemd unit has **no** `SPRING_DATASOURCE_PASSWORD` override, so it's running on the literal value in `application-client2.properties` (`root`). Verify this is still correct before trusting it — a checked-in file is not proof of the live password if anyone rotated it out-of-band.
- JWT secret: **also has no override** — `max` is currently running on the dev-fallback default hardcoded in the public repo (`application.properties`: `billbull-super-secret-key-32chars-minimum!!`). Carry this same value into `secret.yaml` for the pilot (don't silently rotate it — that's a separate decision for the PM, not something to change mid-migration). Flag this as a pre-existing security gap worth fixing later, unrelated to k8s.

**Postgres is NOT yet reachable from a pod.** Confirmed `listen_addresses` is commented out in `postgresql.conf` (defaults to `localhost` only) — a pod's IP (in the `10.42.0.0/16` range) will be refused. Before applying the Secret:

```bash
# find the exact config file path in use
sudo -u postgres psql -c "SHOW config_file;"

# edit postgresql.conf: uncomment and set
listen_addresses = '*'          # or the specific eth0 IP, '*' is simpler for a single-node pilot

# edit pg_hba.conf (same directory) — add a line allowing the pod CIDR:
host    billbull_max    postgres    10.42.0.0/16    md5

sudo systemctl restart postgresql
```

**CHECK:** after restarting Postgres, confirm it didn't just break `max`'s *current* systemd service (which still connects via `localhost` — should be unaffected, but verify with `systemctl status billbull-max`). Then confirm the new listener works: `psql -h 77.37.49.42 -U postgres -d billbull_max` from the server itself should still connect over the network interface, not just the socket.

## 7. Uploads — SKIPPED for max

Confirmed 2026-07-16: `billbull-max`, `billbull-nest`, `billbull-hilite`, `billbull-albadar`
all share one `WorkingDirectory` (`/root/Billbull/Billbull_Retail/billbull-backend`), so
`uploads/` is one commingled folder across all 4 clients (UUID-prefixed filenames, so no
collisions, but no way to tell which file belongs to which client from the filesystem
alone). `max` has never had a real upload done against it, so there's nothing to copy for
this pilot — the PVC is created empty and ready for new uploads going forward.

```bash
kubectl apply -f k8s/max/deployment.yaml   # creates the pod, which binds the (empty) PVC
kubectl get pods -n billbull -l app=max-backend --watch   # wait for Running
```

**For nest/hilite/albadar later (not this pilot):** do NOT copy the shared uploads/
folder wholesale into their PVCs — it contains other clients' files too. Instead, per
client, query that client's DB for actually-referenced file paths first, then either
copy just that subset or re-upload the (likely small) real set of files through the
running app once it's live on k8s.

## 8. Frontend + Ingress

```bash
kubectl apply -f k8s/max/frontend.yaml
kubectl apply -f k8s/max/ingress.yaml
```

**CHECK:** `kubectl get certificate -n billbull max-tls` shows `READY=True` (may take a minute or two for Let's Encrypt HTTP-01 to resolve — requires DNS pointing at this server, see step 9).

## 9. DNS cutover (test first, then real)

Before touching real DNS, verify locally:

```bash
# on your own machine, temporarily:
echo "77.37.49.42 max.billbull.app" | sudo tee -a /etc/hosts
```

Visit `https://max.billbull.app` in a browser — expect a cert warning (self-signed until Let's Encrypt validates against real DNS) but the app should load. Remove that `/etc/hosts` line after testing.

Once satisfied with the pod logs and a manual smoke test via a temporary override, update the **real** `max.billbull.app` DNS A record to point at 77.37.49.42 (it's likely already pointing there, since `max` already lives on this server — confirm with `dig max.billbull.app` first; if so, no DNS change is even needed, just the port/Traefik cutover in step 3).

## 10. Verification checklist (functional, do all of these)

- [ ] App loads at `https://max.billbull.app`, valid cert
- [ ] Login works
- [ ] Existing customer/product data visible (confirms DB connectivity)
- [ ] Generate an invoice/report PDF (confirms Playwright + `/dev/shm`)
- [ ] Upload a new product image, confirm it displays (confirms PVC mount)
- [ ] Old images (copied in step 7) still display
- [ ] `kubectl logs -n billbull deploy/max-backend` shows clean Flyway migration on boot, no errors

## 11. Only after all checks pass

```bash
systemctl stop billbull-max
systemctl disable billbull-max
```

Do **not** touch `billbull-nest`, `billbull-hilite`, `billbull-albadar` — they stay on nginx/systemd until migrated separately, following this same runbook per client.

## Rollback

If anything fails after DNS cutover: revert the DNS A record (or the alt-port Traefik config) and `systemctl start billbull-max` — the old systemd unit and its local `uploads/` directory are untouched by everything above.
