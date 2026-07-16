# Pilot migration: max.billbull.app → k3s on 77.37.49.42

Manifests referenced below live in `k8s/max/` in this repo. Server also runs
`nest`, `hilite`, `albadar` on nginx/systemd — those are untouched by this runbook
until `max` is verified and you deliberately migrate them later.

Do these steps in order. Stop and report back at any `CHECK` line before continuing.

## 0. Before touching the server

- [ ] Confirm current `max` config: `cat /etc/systemd/system/billbull-max.service` on 77.37.49.42 — copy the `Environment=` lines (DB URL/user/password, JWT_SECRET). You'll need them for step 4.
- [ ] Confirm the DB name backing `max` (likely `client2_db` or similar — check the actual `SPRING_DATASOURCE_URL` value, don't assume).
- [ ] Note current `/uploads` path size: `du -sh ~/Billbull/Billbull_Retail/billbull-backend/uploads` (or wherever it resolves relative to `upload.path=uploads/` and the working dir of the systemd unit).

## 1. Build & push images (run from your dev machine, not the server)

```bash
cd billbull-backend
docker build -t ghcr.io/billbull/backend:pilot .
docker push ghcr.io/billbull/backend:pilot

cd ../billbull-frontend
docker build -t ghcr.io/billbull/frontend:pilot .
docker push ghcr.io/billbull/frontend:pilot
```

You'll need to `docker login ghcr.io` first (a GitHub PAT with `write:packages` scope) if not already authenticated. If GHCR isn't set up yet, tell me and we'll either set up the registry or fall back to `k3s ctr images import` for this pilot only.

**CHECK:** confirm both images pushed successfully before continuing.

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

**Remember the DB host:** `localhost` in the old systemd unit becomes unreachable from inside a pod. Find the server's real LAN/host IP:

```bash
ip addr show | grep 'inet ' 
```

Use that IP (not `localhost` or `127.0.0.1`) in `SPRING_DATASOURCE_URL` inside `secret.yaml`. Also confirm Postgres accepts connections from the pod CIDR (`10.42.0.0/16` by default) — check `pg_hba.conf` and `listen_addresses` in `postgresql.conf`.

**CHECK:** `psql -h <that-ip> -U <user> -d <max-db>` connects successfully from the server itself before proceeding — proves the IP/creds are right before k8s adds another layer.

## 7. Copy existing uploads into the new PVC

```bash
kubectl apply -f k8s/max/deployment.yaml   # creates the pod, which binds the PVC
kubectl get pods -n billbull -l app=max-backend --watch   # wait for Running (readiness may fail until DB/uploads are right — that's OK for now)

POD=$(kubectl get pods -n billbull -l app=max-backend -o jsonpath='{.items[0].metadata.name}')
kubectl cp ~/Billbull/Billbull_Retail/billbull-backend/uploads/. billbull/$POD:/app/uploads/
```

(Adjust the source path to wherever `billbull-max`'s working directory actually resolves `uploads/` — confirm with `systemctl show billbull-max -p WorkingDirectory` on the old service first.)

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
