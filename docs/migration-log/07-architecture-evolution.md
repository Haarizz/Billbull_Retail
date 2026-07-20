# BillBull Kubernetes Migration — Complete Engineering Log

**Part 7 of N: Architecture Evolution — Original Server → Docker → Kubernetes → Final Architecture**

---

## Stage 1 — Original Architecture (before this migration; 77.37.49.42 as it existed)

```
                              Internet
                                 │
                                 ▼
                    ┌────────────────────────┐
                    │   77.37.49.42 (VPS)     │
                    │                          │
                    │   ┌──────────────────┐   │
                    │   │      nginx        │   │
                    │   │  (ports 80/443)    │   │
                    │   │  certbot-managed   │   │
                    │   │  TLS certs         │   │
                    │   └─────────┬──────────┘   │
                    │             │ routes by      │
                    │             │ server_name    │
                    │             ▼                │
        ┌───────────┼─────────────┼────────────────┼───────────┐
        │            │             │                 │           │
        ▼            ▼             ▼                 ▼           │
  ┌──────────┐ ┌──────────┐ ┌──────────┐  ┌──────────┐          │
  │ billbull-│ │ billbull-│ │ billbull-│  │ billbull-│          │
  │  nest    │ │  max     │ │  hilite  │  │  albadar │          │
  │ (systemd)│ │ (systemd)│ │ (systemd)│  │ (systemd)│          │
  │ port 8081│ │ port 8082│ │ port 8083│  │ port 8084│          │
  │ profile: │ │ profile: │ │ profile: │  │ profile: │          │
  │ client1  │ │ client2  │ │ hilite   │  │ client4  │          │
  └────┬─────┘ └────┬─────┘ └────┬─────┘  └────┬─────┘          │
       │            │             │              │                │
       └────────────┴─────┬───────┴──────────────┘                │
                           │  ALL FOUR share one WorkingDirectory:  │
                           │  /root/Billbull/Billbull_Retail/       │
                           │  billbull-backend                       │
                           │  → uploads/ folder is COMMINGLED        │
                           ▼                                         │
                  ┌─────────────────┐                                │
                  │   PostgreSQL      │  (listen_addresses=localhost, │
                  │  (localhost-only) │   accessible only from this   │
                  │  billbull_nest    │   same machine, same process  │
                  │  billbull_max     │   family — no network access) │
                  │  billbull_hilite  │                                │
                  │  billbull_albadar │                                │
                  └─────────────────┘                                 │
                                                                        │
                  ┌──────────────────────────────────────────┐        │
                  │  /var/www/billbull/dist  (shared frontend  │        │
                  │  build, served directly by nginx, same for │◄───────┘
                  │  all 4 clients on this server)              │
                  └──────────────────────────────────────────┘

Deploy flow: SSH in → git pull → mvn package → systemctl restart <client>
             → npm build → cp dist → nginx reload
```

**Key properties of this stage:**
- One JVM process per client, always running (or crash-looping under `Restart=always`).
- Manual TLS via certbot, per client, no automated renewal beyond whatever cron/manual process existed.
- Config/secrets via systemd `Environment=` lines (often absent, as discovered for `max` — falling back to values baked into checked-in properties files).
- No isolation between clients at the OS/filesystem level — literally the same working directory and uploads folder.

---

## Stage 2 — Docker (containerization, before any Kubernetes involvement)

```
                    Two separate build pipelines, run on the target server:

  ┌───────────────────────────────┐        ┌───────────────────────────────┐
  │  billbull-backend/Dockerfile   │        │  billbull-frontend/Dockerfile  │
  │                                  │        │                                  │
  │  STAGE 1 "build":                │        │  STAGE 1 "build":                │
  │  maven:3.9-eclipse-temurin-17     │        │  node:20-alpine                   │
  │   - mvn dependency:go-offline     │        │   - npm ci                        │
  │   - mvn clean package              │        │   - npm run build                  │
  │   - mvn copy-dependencies           │        │        │                          │
  │     (Playwright + driver +          │        │        ▼ COPY --from=build         │
  │      driver-bundle → playwright-lib)│        │  STAGE 2 (runtime):                │
  │        │                             │        │  nginx:1.27-alpine                 │
  │        ▼ COPY --from=build             │        │   - serves dist/ + nginx.conf       │
  │  STAGE 2 (runtime):                     │        │   - EXPOSE 80                        │
  │  eclipse-temurin:17-jre-jammy            │        └───────────────┬──────────────────┘
  │   - apt-get install libnss3 etc.          │                        │
  │     (Chromium runtime deps)                │                        ▼
  │   - java -cp playwright-lib/* CLI install   │              billbull-frontend:pilot
  │     --with-deps chromium (BAKED IN)           │                    (image, ~22MB)
  │   - EXPOSE 8082                                │
  │   - ENTRYPOINT java -jar app.jar                │
  └───────────────┬────────────────────────────────┘
                   ▼
         billbull-backend:pilot
             (image, ~982MB —
        includes baked-in Chromium)

  Both images: docker save <img> | sudo k3s ctr images import -
  (no registry used for this pilot — imported directly into k3s's containerd)
```

**Key properties of this stage:**
- Same application code, now packaged as portable, self-contained images.
- Chromium/Playwright installation moved from a manual per-server step to a one-time, baked-in build step.
- Not yet running under any orchestrator — an image alone does nothing until something runs it as a container.

---

## Stage 3 — Kubernetes (k3s installed, `max` migrated; `nest`/`hilite`/`albadar` deliberately taken offline)

```
                                       Internet
                                          │
                              DNS: max.billbull.app → 77.37.49.42
                                          │
                                          ▼
                    ┌──────────────────────────────────────────────┐
                    │              77.37.49.42 (single k3s node)     │
                    │                                                  │
                    │   nginx: STOPPED + DISABLED (deliberately)        │
                    │                                                  │
                    │   ┌───────────────────────────────────────┐      │
                    │   │           Traefik (Ingress)              │      │
                    │   │   binds host 80/443 via ServiceLB         │      │
                    │   │   (iptables DNAT, not a classic socket)     │      │
                    │   └───────────────┬───────────────────────────┘      │
                    │                    │ reads Ingress object: max-ingress │
                    │                    │ TLS from cert-manager (max-tls)     │
                    │        ┌───────────┴────────────┐                        │
                    │  path /api,/uploads        path /                          │
                    │        ▼                          ▼                        │
                    │ ┌──────────────┐          ┌──────────────────┐              │
                    │ │Service:       │          │Service:            │              │
                    │ │max-backend     │          │billbull-frontend    │              │
                    │ │:8080→8082       │          │:80→80                 │              │
                    │ └──────┬─────────┘          └─────────┬────────────┘              │
                    │        ▼                                ▼                          │
                    │ ┌────────────────┐            ┌────────────────────┐              │
                    │ │ Pod:              │            │ Pod ×2:              │              │
                    │ │ max-backend-xxx    │            │ billbull-frontend-x   │              │
                    │ │ (Deployment,        │            │ (Deployment,           │              │
                    │ │  replicas:1,          │            │  replicas:2)            │              │
                    │ │  strategy:Recreate)     │            └────────────────────┘              │
                    │ │                          │                                                │
                    │ │ env from ConfigMap:        │                                                │
                    │ │  SPRING_PROFILES_ACTIVE     │                                                │
                    │ │  =client2                    │                                                │
                    │ │ env from Secret:               │                                                │
                    │ │  SPRING_DATASOURCE_URL/USER/    │                                                │
                    │ │  PASSWORD, JWT_SECRET             │                                                │
                    │ │                                    │                                                │
                    │ │ volumes:                             │                                                │
                    │ │  uploads → PVC (local-path,             │                                                │
                    │ │   ReadWriteOnce, 10Gi, empty)             │                                                │
                    │ │  /dev/shm → emptyDir (512Mi,                │                                                │
                    │ │   Memory) — for Chromium                       │                                                │
                    │ └──────────────┬─────────────────────────────────┘                                                │
                    │                 │ connects OUT, over pod network                                                    │
                    │                 │ (10.42.0.0/24), to the HOST                                                        │
                    │                 ▼                                                                                    │
                    │  ┌─────────────────────────────────────┐                                                            │
                    │  │  PostgreSQL (still on the host,        │                                                            │
                    │  │  NOT containerized)                      │                                                            │
                    │  │  listen_addresses = '*'  (was localhost)   │                                                            │
                    │  │  pg_hba.conf: host billbull_max postgres     │                                                            │
                    │  │              10.42.0.0/24 md5                  │                                                            │
                    │  └─────────────────────────────────────────────┘                                                            │
                    │                                                                                                            │
                    │  billbull-nest, billbull-hilite, billbull-albadar:                                                          │
                    │  systemd services STOPPED (deliberate user decision,                                                        │
                    │  not yet migrated — their JVMs are simply off)                                                              │
                    └──────────────────────────────────────────────────────────────────────────────────────────────────────────┘

  cert-manager (3 pods: cert-manager, cert-manager-cainjector, cert-manager-webhook)
  running in the cert-manager namespace, watches Ingress objects, auto-issues/renews
  certs via Let's Encrypt HTTP-01, referencing the letsencrypt-prod ClusterIssuer.
```

**Key properties of this stage — the actual, final state at the end of this migration:**
- `max.billbull.app` fully served by Kubernetes: Ingress → Service → Pod, with automated TLS.
- `nest`, `hilite`, `albadar` are OFFLINE — not migrated, not serving traffic, by deliberate user choice, to simplify the pilot.
- Postgres remains external to the cluster, on the same host, now reachable over the pod network.
- No registry used — images built and imported locally on this one node only.
- Only one client namespace-worth of manifests (`billbull` namespace, shared) exists; `nest`/`hilite`/`albadar` have no k8s manifests yet.

---

## Stage 4 — Not Yet Built: The Intended Future/Final Production Architecture

This stage was discussed and planned but **not executed** during this migration — included here because it was explicitly described as the target state that stage 3 is a deliberate, partial step toward, not a final destination.

```
                                   Internet
                                      │
                     ┌────────────────┴─────────────────┐
                     ▼                                    ▼
        ┌─────────────────────────┐          ┌─────────────────────────┐
        │  62.72.59.119              │          │  77.37.49.42              │
        │  (separate single-node       │          │  (separate single-node      │
        │   k3s cluster — kept           │          │   k3s cluster — kept          │
        │   independent from the           │          │   independent, per the          │
        │   other server, per the            │          │   Phase 5 recommendation,          │
        │   Phase 5 recommendation)             │          │   until uploads move off              │
        │                                          │          │   local-disk PVCs)                      │
        │  8 clients, each with its own:              │          │  4 clients (nest, max, hilite,             │
        │  - Deployment (Helm-templated,                │          │  albadar), all migrated the same             │
        │    not hand-copied per client)                  │          │  way as max, Helm-templated                    │
        │  - Service                                        │          │                                                   │
        │  - Secret (per-client DB creds)                     │          │  Shared: one frontend Deployment,                 │
        │  - PVC → REPLACED by shared object                    │          │  Traefik, cert-manager, ClusterIssuer               │
        │    storage (S3/MinIO) — no longer                        │          │                                                        │
        │    pinning replicas:1 per client                            │          │  Uploads: migrated to S3/MinIO — every                │
        │                                                                  │          │  client backend can now safely run                       │
        │  Images: pulled from a real registry                              │          │  replicas > 1 with RollingUpdate strategy                   │
        │  (GHCR), not built locally per server                               │          │                                                                  │
        │                                                                          │          │  Images: same GHCR registry as the other server                    │
        └─────────────────────────────────────────────────────────────────────────┴──────────┴──────────────────────────────────────────────────────────────────┘

  Deploy flow becomes: git push → CI builds + pushes image to GHCR →
                        helm upgrade <client> --set image.tag=<new> (per client, or scripted across all)
```

**Explicitly NOT decided or built as part of this migration:** whether the two servers ever become one multi-node cluster (deferred, contingent on uploads first moving to shared storage — see Part 6's reasoning on Postgres/PVC), and the exact Helm chart structure for templating remaining clients (mentioned as the next planned phase, not authored).

---

*(Continued in Part 8: Troubleshooting Journal)*
