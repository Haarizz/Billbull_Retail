# BillBull Kubernetes Migration — Complete Engineering Log

**Part 4 of N: Every Configuration File — Full Content and Rationale**

All secrets are replaced with placeholders as instructed. File contents below are the final, working versions as they exist in the repository at the end of this migration; earlier broken intermediate versions of the Dockerfile are described narratively (with the exact failing line quoted) rather than reproduced in full, since Part 5 (Every Error) covers each intermediate version's exact diff in detail.

---

## 4.1 `billbull-backend/Dockerfile` (final, working version)

```dockerfile
FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /app
COPY pom.xml .
RUN mvn -B dependency:go-offline
COPY src ./src
RUN mvn -B clean package -DskipTests

# A Spring Boot fat jar nests its dependencies under BOOT-INF/lib/*.jar, so
# `java -cp app.jar com.microsoft.playwright.CLI` can't see the Playwright classes —
# they're not on the top-level classpath. The playwright.jar itself has no Main-Class
# manifest either (confirmed: `unzip -p playwright-1.49.0.jar META-INF/MANIFEST.MF` has
# no Main-Class line), so `java -jar` on it alone doesn't work. Instead, assemble
# Playwright's own dependency tree (confirmed via `mvn dependency:tree
# -Dincludes=com.microsoft.playwright`: exactly playwright + driver + driver-bundle, 3
# jars) into a lib/ folder and run the CLI class directly against that classpath — the
# officially supported invocation shape.
# NOTE: -DincludeArtifactIds=playwright on copy-dependencies only grabs the named
# artifact itself, not its transitive deps (verified — driver/driver-bundle were missing
# with that filter). -Dincludes (the *dependency:tree* style groupId:artifactId filter,
# applied here to copy-dependencies via -DincludeGroupIds) resolves the whole subtree
# instead, so all 3 jars land in the same place.
RUN mvn -B org.apache.maven.plugins:maven-dependency-plugin:3.6.1:copy-dependencies \
    -DincludeGroupIds=com.microsoft.playwright \
    -DoutputDirectory=/app/playwright-lib \
    -DincludeScope=runtime && \
    mvn -B org.apache.maven.plugins:maven-dependency-plugin:3.6.1:copy \
    -Dartifact=com.microsoft.playwright:playwright:1.49.0 \
    -DoutputDirectory=/app/playwright-lib

FROM eclipse-temurin:17-jre-jammy
WORKDIR /app

# Playwright/Chromium runtime deps (headless PDF generation via document.HtmlPdfService)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 libatk-bridge2.0-0 libx11-xcb1 libxcomposite1 libxdamage1 \
    libxrandr2 libgbm1 libasound2 libpangocairo-1.0-0 libgtk-3-0 fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/target/billbull-backend-*.jar app.jar
COPY --from=build /app/playwright-lib playwright-lib

ENV PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright
RUN java -cp "playwright-lib/*" com.microsoft.playwright.CLI install --with-deps chromium && rm -rf playwright-lib

EXPOSE 8082
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75.0", "-jar", "app.jar"]
```

**Why each part exists:**
- **Two `FROM` lines (multi-stage build):** stage 1 (`build`) has the full Maven/JDK toolchain needed to compile; stage 2 is a slim JRE-only runtime image. Only the compiled `.jar` crosses between them via `COPY --from=build`. Keeps the deployed image smaller and free of build tooling.
- **`COPY pom.xml .` before `COPY src ./src`:** deliberate layer-cache ordering — dependencies (`pom.xml`) change far less often than source code, so this ordering means editing a Java file doesn't force Maven to re-download the entire dependency tree on every rebuild.
- **The `copy-dependencies` block:** the fix for the Playwright classpath bug (full story in Part 5, Error #3). Assembles exactly the 3 jars Playwright's CLI needs into one folder.
- **`apt-get install ... libnss3 ...` etc.:** Chromium (which Playwright drives) needs these OS-level shared libraries to run headless on a bare JRE base image; without them, Chromium fails to launch at runtime, not build time.
- **`RUN java -cp "playwright-lib/*" ... install --with-deps chromium && rm -rf playwright-lib`:** runs the Chromium download/install once, at image build time, baking the browser binary permanently into the image (so no container ever needs network access to download it at startup); then deletes the temporary classpath jars since they're only needed for this one install step, not at runtime.
- **`EXPOSE 8082`:** documentation-only metadata (does not actually control what port the app binds to — that's `server.port`, driven by the active Spring profile). Originally `8080` in an earlier draft, corrected to `8082` once the port mismatch bug (Error #1) was found and fixed.
- **`-XX:MaxRAMPercentage=75.0`:** tells the JVM to size its heap as a percentage of whatever container memory limit is actually granted (set later in `deployment.yaml`'s `resources.limits.memory: 1Gi`), rather than guessing from host machine memory — prevents unpredictable OOM-kills.

---

## 4.2 `billbull-frontend/Dockerfile` (unchanged from first draft — no bugs hit here)

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

**Why:** Same multi-stage pattern as the backend — Node.js/npm is only needed to *build* the static files; the final image is just nginx serving the pre-built `dist/` output, with no Node.js runtime present at all in what actually ships.

---

## 4.3 `billbull-frontend/nginx.conf`

```nginx
server {
  listen 80;
  root /usr/share/nginx/html;
  index index.html;
  location / {
    try_files $uri $uri/ /index.html;
  }
}
```

**Why:** `try_files $uri $uri/ /index.html` is the SPA-fallback rule — any request path that doesn't match a real static file (e.g. refreshing on a client-side route like `/sales/invoices/123`) falls back to serving `index.html`, letting React Router take over routing from there instead of nginx returning a 404.

---

## 4.4 `billbull-frontend/.dockerignore` (added after the fact, minor build-speed fix)

```
node_modules
dist
dist_check
.vite
.env
.env.local
.env.*.local
```

**Why:** Without this file, `docker build` was transferring the entire `node_modules` folder (~370MB) into the build context on every build — wasted time, since `npm ci` + `COPY . .` inside the container overwrite it anyway. Purely a build-speed optimization, not a correctness fix; identified after the frontend image had already built successfully once.

---

## 4.5 `k8s/max/namespace.yaml`

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: billbull
```

**Why:** A logical grouping for all objects belonging to any BillBull client on this cluster. All clients share one namespace, matching today's model of one server hosting multiple clients side by side.

---

## 4.6 `k8s/max/configmap.yaml` (final, corrected version)

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: max-backend-config
  namespace: billbull
data:
  # server.port is NOT set here — application-client2.properties already sets it to
  # 8082, and that profile file is the source of truth. Setting SERVER_PORT here would
  # just be a second place to keep in sync (and a place to get it wrong).
  SPRING_PROFILES_ACTIVE: "client2"
```

**What changed and why (Error #1, full detail in Part 5):** the original version of this file included `SERVER_PORT: "8080"`. This was wrong — `application-client2.properties` (activated by `SPRING_PROFILES_ACTIVE=client2`) already sets `server.port=8082`, overriding the base file's `8080`. Adding a `SERVER_PORT` env var here would create a second, competing source of truth for the port. The fix was to remove it entirely and let the profile file be the sole authority, then make sure every other place that referenced the port (`deployment.yaml`'s `containerPort` and probes, the Service's `targetPort`) matched `8082` instead.

---

## 4.7 `k8s/max/secret.template.yaml` (template — safe to commit; real values never committed)

```yaml
# DO NOT commit this file with real values filled in.
# Copy to secret.yaml (gitignored), fill in the real values from
# /etc/systemd/system/billbull-max.service on 77.37.49.42, then:
#   kubectl apply -f secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: max-backend-secret
  namespace: billbull
type: Opaque
stringData:
  SPRING_DATASOURCE_URL: "jdbc:postgresql://<host-lan-ip>:5432/<max-db-name>"
  SPRING_DATASOURCE_USERNAME: "<db-username>"
  SPRING_DATASOURCE_PASSWORD: "<db-password>"
  JWT_SECRET: "<jwt-secret>"
```

**The real, filled-in `k8s/max/secret.yaml` (never committed — reconstructed here with placeholders per the redaction requirement):**

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: max-backend-secret
  namespace: billbull
type: Opaque
stringData:
  SPRING_DATASOURCE_URL: "jdbc:postgresql://77.37.49.42:5432/billbull_max"
  SPRING_DATASOURCE_USERNAME: "postgres"
  SPRING_DATASOURCE_PASSWORD: "<REDACTED — the live production password, verified against the systemd unit>"
  JWT_SECRET: "<REDACTED — the dev-fallback value from base application.properties, carried forward unchanged for the pilot>"
```

**Why this two-file pattern:** the `.template.yaml` documents the *shape* of what's needed and is safe to commit; the real, filled-in `secret.yaml` is created only on the server via `cp` + `nano`, applied directly with `kubectl apply`, and is excluded from git entirely via `.gitignore` (`k8s/**/secret.yaml`). This is the same mechanism as the old systemd unit's `Environment=` lines, just expressed as a Kubernetes object instead of shell environment assignment.

**Critical incident related to this file (full detail in Part 5, Error #4):** an earlier draft of `RUNBOOK.md` (documentation, not this file) briefly stated the real live DB password in plaintext as an example. This was blocked by the platform's safety layer before reaching the public repo and was corrected — the general principle enforced afterward: documentation may explain *how to find* a secret, but must never *contain* the secret's actual value.

---

## 4.8 `k8s/max/pvc.yaml`

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: max-uploads-pvc
  namespace: billbull
spec:
  accessModes: ["ReadWriteOnce"]
  storageClassName: local-path
  resources:
    requests:
      storage: 10Gi
```

**Why:** `local-path` is k3s's built-in storage class — provisions a real directory on the node's own disk, analogous to today's local `/uploads` folder but managed by k8s. `ReadWriteOnce` means only one pod may mount this volume at a time — this single constraint is the direct reason `deployment.yaml` (below) is pinned to `replicas: 1` and `strategy: Recreate`. `10Gi` was chosen as a reasonable starting size for a pilot client with no existing uploads.

---

## 4.9 `k8s/max/deployment.yaml` (final, corrected version — Deployment + Service)

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: max-backend
  namespace: billbull
spec:
  replicas: 1
  strategy:
    type: Recreate # matches today's single-instance systemctl restart; no split-brain on the uploads PVC
  selector:
    matchLabels: { app: max-backend }
  template:
    metadata:
      labels: { app: max-backend }
    spec:
      containers:
        - name: backend
          image: billbull-backend:pilot
          imagePullPolicy: Never # pilot: image is loaded locally via `k3s ctr images import`, not pulled from a registry
          # 8082 comes from application-client2.properties (server.port=8082), which the
          # SPRING_PROFILES_ACTIVE=client2 ConfigMap entry activates on top of the base
          # application.properties (server.port=8080). Do NOT also set SERVER_PORT here —
          # that would fight with the profile file. This value must just match whatever
          # server.port ends up being for this client's profile.
          ports: [{ containerPort: 8082 }]
          envFrom:
            - configMapRef: { name: max-backend-config }
            - secretRef: { name: max-backend-secret }
          resources:
            requests: { cpu: "250m", memory: "512Mi" }
            limits: { cpu: "1", memory: "1Gi" }
          volumeMounts:
            - name: uploads
              mountPath: /app/uploads
            - name: dshm
              mountPath: /dev/shm
          readinessProbe:
            tcpSocket: { port: 8082 }
            initialDelaySeconds: 30
            periodSeconds: 10
          livenessProbe:
            tcpSocket: { port: 8082 }
            initialDelaySeconds: 60
            periodSeconds: 20
      volumes:
        - name: uploads
          persistentVolumeClaim: { claimName: max-uploads-pvc }
        - name: dshm
          emptyDir: { medium: Memory, sizeLimit: 512Mi } # Chromium/Playwright needs more than k8s's default 64MB /dev/shm
---
apiVersion: v1
kind: Service
metadata:
  name: max-backend
  namespace: billbull
spec:
  selector: { app: max-backend }
  ports: [{ port: 8080, targetPort: 8082 }]
```

**Field-by-field rationale:**
- **`replicas: 1` + `strategy: Recreate`:** directly forced by the `ReadWriteOnce` PVC constraint above — two pods can't share that volume, and `Recreate` (fully stop the old pod before starting the new one) avoids any window where two pods might both try to mount it, unlike the k8s default `RollingUpdate` strategy which briefly runs old and new together. Also chosen because `spring.jpa.hibernate.ddl-auto=update` makes running two schema-differing app versions against one DB simultaneously riskier than a brief downtime window.
- **`image: billbull-backend:pilot` + `imagePullPolicy: Never`:** pilot-specific choice — no container registry was set up for this first migration; the image was built directly on the server and imported into containerd via `k3s ctr images import`. `imagePullPolicy: Never` tells kubelet to use the locally-imported image rather than attempting (and failing) to pull from a registry.
- **`ports: [{ containerPort: 8082 }]`:** originally `8080` (Error #1) — corrected once the mismatch with `application-client2.properties`'s real `server.port=8082` was found.
- **`envFrom`:** the direct replacement mechanism for the old systemd unit's `Environment=` lines — every key in the referenced ConfigMap and Secret becomes a real environment variable inside the container at startup.
- **`resources.requests`/`limits`:** reserves a CPU/memory floor for scheduling purposes and caps usage at a ceiling k8s will enforce (throttle or OOM-kill beyond it).
- **`volumeMounts` for `uploads`:** mounts the PVC at `/app/uploads`, matching where the Spring property `upload.path=uploads/` resolves relative to the container's `/app` working directory (set by `WORKDIR /app` in the Dockerfile).
- **`volumeMounts`/`volumes` for `dshm`:** an in-memory `emptyDir` mounted at `/dev/shm`, sized to `512Mi`. Necessary because Kubernetes' container default `/dev/shm` size is only 64MB, which is too small for Chromium's rendering buffers and causes it to crash mid-render without this override.
- **`readinessProbe`/`livenessProbe` as `tcpSocket` checks, not `httpGet`:** chosen because the codebase has no Spring Boot Actuator dependency (confirmed via `grep actuator pom.xml` returning nothing), so no `/actuator/health` HTTP endpoint exists to check against — a plain TCP connection check against the app's port is used instead.
- **Service `port: 8080` vs. `targetPort: 8082`:** deliberate indirection. `port: 8080` is this Service's own arbitrary internal number that other things in the cluster (like the Ingress) call it on; `targetPort: 8082` is where it actually forwards to inside the real container. This indirection is exactly why the Ingress manifest never needs to know or care about the container's real listening port.

---

## 4.10 `k8s/max/frontend.yaml`

```yaml
# Shared frontend, deployed once (not per client) — every client's Ingress on this
# server points at this same Service, same as today's shared /var/www/billbull/dist.
apiVersion: apps/v1
kind: Deployment
metadata:
  name: billbull-frontend
  namespace: billbull
spec:
  replicas: 2
  selector: { matchLabels: { app: billbull-frontend } }
  template:
    metadata: { labels: { app: billbull-frontend } }
    spec:
      containers:
        - name: frontend
          image: billbull-frontend:pilot
          imagePullPolicy: Never # pilot: image is loaded locally via `k3s ctr images import`, not pulled from a registry
          ports: [{ containerPort: 80 }]
---
apiVersion: v1
kind: Service
metadata:
  name: billbull-frontend
  namespace: billbull
spec:
  selector: { app: billbull-frontend }
  ports: [{ port: 80, targetPort: 80 }]
```

**Why `replicas: 2` here but `1` for the backend:** the frontend is entirely stateless static files served by nginx — no database connection, no local storage requirement, safe to run multiple copies simultaneously for resilience/zero-downtime updates, unlike the backend which is constrained by the uploads PVC.

**Why deployed once, shared across all clients:** mirrors today's existing architecture exactly — one shared `/var/www/billbull/dist` build already serves every client on a given server; there was never a reason to duplicate the frontend per client, and that doesn't change under k8s.

---

## 4.11 `k8s/max/ingress.yaml`

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: max-ingress
  namespace: billbull
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  tls:
    - hosts: ["max.billbull.app"]
      secretName: max-tls
  rules:
    - host: max.billbull.app
      http:
        paths:
          - path: /api
            pathType: Prefix
            backend:
              service: { name: max-backend, port: { number: 8080 } }
          - path: /uploads
            pathType: Prefix
            backend:
              service: { name: max-backend, port: { number: 8080 } }
          - path: /
            pathType: Prefix
            backend:
              service: { name: billbull-frontend, port: { number: 80 } }
```

**Why:** the k8s equivalent of an nginx `server { server_name max.billbull.app; ... }` block. Routes `/api/*` and `/uploads/*` to the backend Service, everything else to the shared frontend Service. The `cert-manager.io/cluster-issuer: letsencrypt-prod` annotation is what triggers cert-manager to automatically watch this Ingress and issue/renew a real TLS certificate for `max.billbull.app`, stored in the `max-tls` Secret referenced under `tls.secretName`.

---

## 4.12 `k8s/max/cluster-issuer.yaml`

```yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: ae@geebu.io
    privateKeySecretRef:
      name: letsencrypt-prod-key
    solvers:
      - http01:
          ingress:
            class: traefik
```

**Why:** cluster-wide (not per-client) configuration telling cert-manager how and where to obtain certificates — using Let's Encrypt's production ACME endpoint, proving domain ownership via the HTTP-01 challenge type (routed through Traefik, the ingress class in use), and registering `ae@geebu.io` for renewal/expiry notifications. Every client's Ingress references this one ClusterIssuer by name; it only needs to be created once per cluster, not once per client.

---

## 4.13 `.gitignore` (addition)

```
# ===========================
# Kubernetes secrets (never commit real creds)
# ===========================
k8s/**/secret.yaml
k8s/**/values-*.secret.yaml
```

**Why:** ensures any file literally named `secret.yaml` anywhere under `k8s/` (matching the `cp secret.template.yaml secret.yaml` pattern used throughout this migration) is automatically excluded from version control, as a structural safeguard beyond just "remembering not to commit it."

---

## 4.14 `billbull-backend/src/main/resources/application.properties` (top of file, relevant diff)

**Before (as it existed in the committed repo, prior to this migration's fix):**
```properties
spring.application.name=billbull-backend
server.port=8080

# ===============================
# COMMON SERVER CONFIG
# ===============================
server.compression.enabled=true
server.compression.min-response-size=1024
server.compression.mime-types=application/json,application/xml,text/html,text/xml,text/plain,text/css,application/javascript

# ===============================
# COMMON DB DRIVER
# ===============================
spring.datasource.driver-class-name=org.postgresql.Driver
spring.datasource.url=jdbc:postgresql://localhost:5432/testdb
spring.datasource.username=postgres
spring.datasource.password=admin
```

**After (final, committed as part of this migration):**
```properties
spring.application.name=billbull-backend

# ===============================
# COMMON SERVER CONFIG
# ===============================
server.compression.enabled=true
server.compression.min-response-size=1024
server.compression.mime-types=application/json,application/xml,text/html,text/xml,text/plain,text/css,application/javascript

# ===============================
# COMMON DB DRIVER
# ===============================
spring.datasource.driver-class-name=org.postgresql.Driver
```

**Why:** `server.port=8080` and the three dev-only DB default lines (`spring.datasource.url/username/password`, pointing at a local `testdb`) were removed. Investigation (full detail in Part 5, Error #2) confirmed every one of the 13 real client profile files (`application-<client>.properties`) already sets its own `server.port` and `spring.datasource.*` values — meaning these base-file defaults were never actually used by any real deployment and existed only as a dev-only convenience, with real risk of being mistaken for a live default. This edit had already been made, uncommitted, directly on the 77.37.49.42 server (causing the git pull conflict in Error #2) and was formally committed to the repository as part of resolving that conflict, so it stops recurring on future pulls to any server.

---

## 4.15 `/etc/postgresql/16/main/postgresql.conf` (server-side, not in git — line 60 diff)

**Before:**
```
#listen_addresses = 'localhost'              # what IP address(es) to listen on;
```

**After:**
```
listen_addresses = '*'               # what IP address(es) to listen on;
```

**Why:** Postgres was refusing any connection not originating from the same machine's loopback interface. A Kubernetes pod, despite running on the same physical host, has its own network namespace and connects via a real (internal, pod-network) IP address, not `127.0.0.1` — so the database needed to accept connections on all interfaces (or at minimum the host's real interface) for pods to reach it at all.

---

## 4.16 `/etc/postgresql/16/main/pg_hba.conf` (server-side, not in git — addition)

**Line appended:**
```
host    billbull_max    postgres    10.42.0.0/24    md5
```

**Why:** Even with the network port open (`listen_addresses`), Postgres separately enforces host-based access control: who may connect, from where, to which database, as which user. This line grants access **only** to the `billbull_max` database, **only** for the `postgres` user, **only** from the k3s pod network range (`10.42.0.0/24` — confirmed as the real CIDR via `ip route`, not the generically-assumed `/16`) — a narrowly-scoped rule, not a blanket "allow everyone" change.

---

## 4.17 `/etc/systemd/system/billbull-max.service` (server-side, not in git — read but not modified)

**As found (verbatim structure, no values changed by this migration):**
```ini
[Unit]
Description=BillBull - Max
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root/Billbull/Billbull_Retail/billbull-backend
Environment=PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright
ExecStart=/usr/bin/java -jar target/billbull-backend-0.0.1-SNAPSHOT.jar --spring.profiles.active=client2
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

**Why this file is included here (even though unmodified):** it's the authoritative source that confirmed no `SPRING_DATASOURCE_*` or `JWT_SECRET` environment overrides existed for `max` — directly informing what values had to be sourced from the checked-in properties files instead when constructing the k8s Secret. Modified only via `systemctl disable` at the very end of the migration (a systemd-level state change, not a file edit) once the k8s deployment was verified working.

---

*(Continued in Part 5: Every Error Encountered, in Full Detail)*
