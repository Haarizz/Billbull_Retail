# BillBull Kubernetes Migration — Complete Engineering Log

**Part 2 of N: Complete Chronological Timeline**

---

## Phase 0 — Initial Generic Migration Guide (pre-work, context-setting)

**Trigger:** The user shared an HTML file, `billbull-kubernetes-migration-guide.html`, containing a generic k3s migration guide (install k3s, cert-manager, build images, namespace/secrets, deploy, verify, multi-client table) and asked: *"what are the risks on doing this, is this the best way, where the upload images such as product are storing in kubernetes? and also your queries."*

**Why this step happened:** Before any real infrastructure work, the generic plan needed to be checked against BillBull's actual codebase, since it was clearly a template not written against this specific app.

**Investigation performed:** Spawned research into the codebase to confirm the generic guide's gaps. Confirmed:
- `common.util.FileUploadUtil` writes to a local filesystem path served via `StaticResourceConfig` / `/uploads/**` (permitAll in `SecurityConfig`).
- Playwright/Chromium is used for HTML→PDF (`document.HtmlPdfService`), not mentioned in the generic guide at all.
- The multi-tenant profile system (~14 Spring profiles) didn't match the generic guide's "one Secret + one Deployment per client, add Helm later" framing — flagged that Helm/Kustomize should be day-one, not deferred.

**Risks identified and communicated to the user (this list evolved through the conversation but originated here):**
1. Uploaded product images on local disk — biggest gap, not addressed by the generic guide at all.
2. Playwright/Chromium needs `/dev/shm` sizing (k8s default 64MB is too small) — not in the generic guide.
3. 14-client secrets/profile model doesn't match "one Secret + Deployment per client, Helm later" — needs templating from day one.
4. External Postgres reachability from inside the cluster — not addressed.
5. `ddl-auto=update` + rolling deploys — overlapping schema versions during a rolling update is riskier than the current single-instance systemd restart.
6. Local-only image build (`k3s ctr images import`) — no real CI/CD without a registry.
7. No JVM memory/resource limits mentioned in the generic guide — risk of unpredictable OOM-kill.

**Recommendation given:** k3s judged heavier than strictly necessary for a single-node, ~14-tenant deployment; Docker Compose + Traefik/Caddy was offered as a lighter alternative, but the decision to proceed with k8s was left to the user.

**Two clarifying questions asked via `AskUserQuestion`:**
1. Where are product/document images currently stored? → User answered: "all are on the /uploads as per the client."
2. Is the goal multi-node scaling/HA, or just cleaner per-client deploy management? → User answered: "pm asked for to setup the kubernetes for the project" (i.e., the trigger was the PM's explicit ask, not a technical scaling need).

**Result:** Confirmed the risk assessment matched reality — images on local disk per client was exactly the concern, now confirmed as fact rather than assumption.

---

## Phase 1 — Real Deployment Notes Provided, Real Plan Requested

**Trigger:** The user shared the actual (not generic) deployment document — `BillBull_Server_Deployment_Guide_v2.html` — showing the real two-server, 12-client topology described in Part 1 above, and said: *"this is what we actually doing, how can we shift from here to kubernetes."*

**Why this step happened:** The generic guide's advice needed to be re-derived against the real topology, not a hypothetical one.

**Analysis performed:** Read the real port/domain/profile/systemd-service table for both servers. Mapped old→new concepts:

| Today (systemd/nginx) | k8s equivalent |
|---|---|
| `billbull-royaltools` (systemd unit, port 8080) | Deployment + Service, `SPRING_PROFILES_ACTIVE=royaltools` |
| nginx routing by port/domain | Ingress (Traefik) routing by hostname |
| `/var/www/billbull/dist` (shared frontend) | one frontend Deployment + Service, shared across all client Ingress hosts |
| `/uploads/<client>` on local disk | flagged as the one thing that doesn't map cleanly |
| `mvn clean package` + `systemctl restart` | CI builds one image, `kubectl set image` / Helm upgrade rolls it out |
| Playwright install per server (manual) | baked into the backend Docker image once |
| 2 physical servers | could become 2 k3s nodes in one cluster, or 2 separate single-node clusters |

**Phased plan proposed (5 phases):**
- Phase 0: fix `/uploads` first (before touching k8s) — recommended accepting `local-path` PVC + `replicas: 1` + `strategy: Recreate` as the pragmatic first step (matching the current single-instance-per-client model), deferring S3/MinIO migration to a later phase.
- Phase 1: containerize (write Dockerfiles).
- Phase 2: migrate one real client end-to-end (validate: app loads, login, PDF, image upload, print).
- Phase 3: template via Helm.
- Phase 4: roll out remaining clients one at a time, retiring systemd per client, not big-bang.
- Phase 5 (optional, later): decide whether the two physical servers become one k3s cluster or stay two independent single-node clusters — recommended keeping them separate until uploads move to shared/object storage, since a pod could otherwise get scheduled on the wrong node and lose access to its client's local-disk files.

**Result:** User asked for a complete standalone doc explaining the migration with a worked example.

---

## Phase 2 — Complete Migration Guide Document Authored

**Trigger:** User: *"first pepare a complete doc that explaining to migrate with example of migrating any of the client."*

**Investigation performed before writing:** Read `billbull-backend/pom.xml` (confirmed Spring Boot 3.5.9, Java 17, Playwright 1.49.0 dependency) and `billbull-backend/src/main/resources/application.properties` (confirmed `server.port=8080` default, DB URL/user/password already externalized via env vars in principle, `upload.path=uploads/` relative path, JWT secret fallback).

**File created:** `BillBull_Kubernetes_Migration_Guide_v1.html` (repo root) — a 10-section HTML guide styled to match the existing deployment docs, covering:
0. Current topology (pulled from the real 12-client table).
1. Gaps a generic guide misses for this specific app.
2. Dockerfiles for backend (Playwright/Chromium baked in) and frontend.
3. The `/uploads` decision (PVC + `Recreate` now, recommended; MinIO later).
4. k3s + cert-manager install.
5. A full worked example migrating a hypothetical client called **`geebu`** (chosen as the example before `max` was later selected as the real pilot) — Secret, ConfigMap, PVC, Deployment, Service, shared frontend, Ingress.
6. A verification checklist.
7. Converting the worked example into a Helm chart for the other clients.
8. Rollout sequencing (client-by-client, not big-bang).
9. Two-server topology recommendation (keep separate until uploads move off local disk).
10. Day-2 command cheat sheet (old vs. new).

**Result:** Document delivered. User then asked to actually start implementing, specifying the real target client and server.

---

## Phase 3 — Pilot Scope Decided: `max` on 77.37.49.42, Not `qa` on 62.72.59.119

**Trigger:** User: *"so lets start with the client : qa.billbull.app . start implementing along with studying us."*

**Why a clarifying question was asked instead of proceeding immediately:** No shell access existed to any remote VPS from this session — execution would need to happen via the user pasting commands and results back and forth. Also, `qa.billbull.app` shares server 62.72.59.119 with 7 other live clients; installing k3s there would install Traefik on ports 80/443, conflicting with nginx serving all 7 other clients simultaneously.

**Two questions asked via `AskUserQuestion`:**
1. How to execute commands against the remote server? → User selected: "I'll run commands myself" (i.e., the user pastes commands into their own SSH session and reports output back).
2. How to handle the port conflict on 62.72.59.119 (8 clients, including `qa`)? → User's answer, in their own words: *"so i think lets build it on the vps 77.37.49.42 lets try it with the client running on it max.billbull.app instead qa.billbull.app."*

**Result:** Pilot target changed from `qa`/62.72.59.119 to **`max`/77.37.49.42** — a lower-blast-radius choice (4 clients instead of 8) made by the user directly, not defaulted to.

---

## Phase 4 — Dockerfiles and k8s Manifests for `max` Created Locally

**Files created (in the local repo, before any server interaction):**

1. `billbull-backend/Dockerfile` (first version) — multi-stage build: `maven:3.9-eclipse-temurin-17` build stage → `eclipse-temurin:17-jre-jammy` runtime stage, apt-installing Chromium's runtime dependencies (`libnss3 libatk-bridge2.0-0 libx11-xcb1 libxcomposite1 libxdamage1 libxrandr2 libgbm1 libasound2 libpangocairo-1.0-0 libgtk-3-0 fonts-liberation`), then attempting `RUN java -cp app.jar com.microsoft.playwright.CLI install --with-deps chromium` (this specific line later failed on the real server — see Section 5, Error #3).

2. `billbull-frontend/Dockerfile` — multi-stage: `node:20-alpine` build stage (`npm ci`, `npm run build`) → `nginx:1.27-alpine` runtime stage, copying `dist/` and a custom `nginx.conf`.

3. `billbull-frontend/nginx.conf` — SPA-fallback config (`try_files $uri $uri/ /index.html`).

4. `k8s/max/namespace.yaml` — the `billbull` namespace.

5. `k8s/max/configmap.yaml` — initially included `SERVER_PORT: "8080"` (later identified as **wrong** — see Section 5, Error #1 — and removed).

6. `k8s/max/secret.template.yaml` — placeholder Secret manifest with angle-bracket values (`<host-lan-ip>`, `<max-db-name>`, `<db-username>`, `<db-password>`, `<jwt-secret>`), explicitly documented as never to be applied directly — copy to a gitignored `secret.yaml` and fill in real values there.

7. `k8s/max/pvc.yaml` — `max-uploads-pvc`, `ReadWriteOnce`, `local-path` storage class, `10Gi` request.

8. `k8s/max/deployment.yaml` — initially `containerPort: 8080` / Service `targetPort: 8080` (both **wrong**, corrected in Section 5, Error #1), `replicas: 1`, `strategy: Recreate`, `envFrom` referencing the ConfigMap and Secret, `resources.requests`/`limits`, volume mounts for `uploads` (PVC) and `dshm` (`emptyDir`, `medium: Memory`, `sizeLimit: 512Mi`), `readinessProbe`/`livenessProbe` as `tcpSocket` checks (chosen because the codebase has no Spring Boot Actuator dependency — confirmed via `grep actuator pom.xml` returning nothing).

9. `k8s/max/frontend.yaml` — shared `billbull-frontend` Deployment (`replicas: 2`) + Service, explicitly noted as deployed once and reused by every client's Ingress.

10. `k8s/max/ingress.yaml` — routes `/api` and `/uploads` to `max-backend` Service port 8080, `/` to `billbull-frontend` Service port 80; `cert-manager.io/cluster-issuer: letsencrypt-prod` annotation; TLS via `max-tls` secret.

11. `k8s/max/cluster-issuer.yaml` — `letsencrypt-prod` ClusterIssuer, ACME production endpoint, email `ae@geebu.io`, HTTP-01 solver via the `traefik` ingress class.

**`.gitignore` update:** appended:
```
# ===========================
# Kubernetes secrets (never commit real creds)
# ===========================
k8s/**/secret.yaml
k8s/**/values-*.secret.yaml
```

**File created:** `k8s/max/RUNBOOK.md` — a step-by-step runbook for the `max` pilot, initially an 11-section plan (build/push images, install k3s, resolve port conflict via alt-port Traefik, cert-manager, namespace/ConfigMap/PVC/Secret, uploads copy, frontend+Ingress, DNS cutover, verification checklist, retire systemd, rollback).

**Result:** All local scaffolding complete. User then asked for a full walkthrough/teaching pass over every file before execution began.

---

## Phase 5 — Full File-by-File Teaching Walkthrough (pre-execution)

**Trigger:** User asked two clarifying questions directly about the manifests:
1. *"in secret.template.yaml do we need to give the db name, db username, db password etc."*
2. Then, separately: *"Teach me the implementation you have done now such as yaml files, conf, dockerfiles etc."*

**Investigation performed for question 1:** Read `application-client2.properties` directly, confirming it already contained the real (at-rest, checked-in) `billbull_max` DB name and `postgres` username — but explicitly warned the checked-in `root` password should not be trusted blindly, since it might be shadowed by a systemd env var override not yet inspected. Recommended running `systemctl cat billbull-max` on the real server before trusting any value.

**Full walkthrough delivered for question 2**, file by file: backend Dockerfile (multi-stage explanation, why `EXPOSE 8080` is documentation-only), frontend Dockerfile, `nginx.conf` (SPA fallback explained), every k8s manifest (`namespace`, `configmap`, `secret.template`, `pvc`, `deployment`+`service` together, `frontend`, `ingress`, `cluster-issuer`), and the apply-order dependency chain (`namespace` → `configmap`/`secret`/`pvc` → `deployment` → `frontend` → `cluster-issuer` → `ingress`).

**Result:** User then flagged a real bug found via own inspection of the IDE.

---

## Phase 6 — Port Mismatch Bug Found and Fixed (before any server work)

**Trigger:** User, having the `application.properties` file open in the IDE, asked: *"Teach me the implementation you have done now, showing that the target port is 8080, but the clients application-client2.properties is having 8082.? shall i remove the database credentials and port from the application.properties.? do we need to bother about the upload folder now?"*

This is **Error #1** in the full error catalog (Section 5) — see there for the complete failure/investigation/fix detail. Summary: Spring property-file layering meant `application-client2.properties`'s `server.port=8082` overrides the base file's `8080`, but the Deployment/ConfigMap manifests had been written assuming 8080. Fixed by:
- Removing `SERVER_PORT` from `configmap.yaml` entirely (letting the profile file remain the sole source of truth).
- Changing `deployment.yaml`'s `containerPort` from `8080` to `8082`, and both probes to target `8082`.
- Changing the Service's `targetPort` from `8080` to `8082` (external `port: 8080` on the Service itself was left as an arbitrary internal cluster-facing number, unrelated to the container's real port).

User also asked whether to remove DB credentials/port from `application.properties` — answered **no**, explained the property-file precedence chain (env var > profile file > base file) meant the base file's dev-only values were already dead weight in production, safe to leave, nothing to delete. And asked about the uploads folder — answered "not yet," deferred to the runbook's later step.

**Result:** Manifests corrected. User said "ok lets start."

---

## Phase 7 — Step 0: Pulling Real Config From the Server

**Trigger:** User said "ok lets start" — first real remote-server interaction of the migration.

**Command given to the user to run on 77.37.49.42:**
```bash
ssh root@77.37.49.42
```
then:
```bash
sudo systemctl cat billbull-max
systemctl show billbull-max -p WorkingDirectory
find / -maxdepth 6 -type d -iname uploads 2>/dev/null
ip addr show | grep 'inet '
sudo -u postgres psql -c "\l" 2>/dev/null | grep -i max
cat /etc/postgresql/*/main/postgresql.conf 2>/dev/null | grep -i listen_addresses
```

**Actual output received (paraphrased structurally, real values preserved except password):**
- `billbull-max.service` unit file: `WorkingDirectory=/root/Billbull/Billbull_Retail/billbull-backend`, `Environment=PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright`, `ExecStart=/usr/bin/java -jar target/billbull-backend-0.0.1-SNAPSHOT.jar --spring.profiles.active=client2`, `Restart=always`, `RestartSec=5`. **No** `SPRING_DATASOURCE_*` or `JWT_SECRET` env vars present.
- `find` output showed uploads folders under **two different root paths**: an old/legacy path family (`/root/BB/Billbull ERP/client2_max/billbull-backend/uploads`, and equivalents for `client4_alb`, `client3_hilite`, `client5_agi`, `client1_nest`, `client6_helenz`) and the current path (`/root/Billbull/Billbull_Retail/billbull-backend/uploads`).
- `ip addr`: `77.37.49.42/24` on `eth0`.
- Postgres: `billbull_max | postgres | UTF8 | libc | C.UTF-8 | C.UTF-8` confirmed to exist.
- `listen_addresses` line: `#listen_addresses = 'localhost'` — **commented out**.

**Analysis performed on this output — 4 findings communicated to the user:**
1. No `SPRING_DATASOURCE_*`/`JWT_SECRET` env vars at all → DB creds and JWT secret both running on checked-in file defaults, not systemd overrides. JWT secret specifically flagged as the public-repo dev-fallback value, a real security gap, noted but not fixed as part of this migration.
2. Two different upload-folder path families visible in `find` output → raised a question about whether the other 3 clients (`nest`, `hilite`, `albadar`) share `max`'s current `WorkingDirectory` or have separate ones.
3. `listen_addresses` commented out → Postgres would refuse pod-network connections; would need fixing before Secret/DB step.
4. DB `billbull_max` confirmed to exist, owned by `postgres`.

**Clarifying question asked via `AskUserQuestion`:** Do `nest`/`hilite`/`albadar` share `max`'s `WorkingDirectory`, or do they each have their own? → User answered: *"they all share like max does /root/Billbull/Billbull_Retail/billbull-backend."*

**Consequence of that answer:** All 4 clients' `uploads/` files are commingled in one folder. Confirmed via reading `FileUploadUtil.java` that filenames are UUID-prefixed (`UUID.randomUUID().toString() + "_" + multipartFile.getOriginalFilename()`), ruling out filename collisions but not resolving "which file belongs to which client."

**Second clarifying question asked:** Given the commingled folder, how should `max`'s files get into its new PVC? Options offered: (A) copy the whole shared folder as-is (simple, but pollutes the PVC with other clients' files), or (B) query `billbull_max`'s DB first for actually-referenced file paths, copy only those. → User answered: *"currently max have done nothing, so they don't have any datas in the upload folder, so shall we skip it and for other clients also can we import the images again when the client is running?"*

**Result:** Uploads step for `max` marked as skip (nothing to migrate); runbook Section 7 rewritten to reflect this and to specify the correct (query-first or re-upload) approach for the other three clients later, explicitly warning against a blind wholesale folder copy.

---

## Phase 8 — Git State Conflict on the Server (before further infra work)

**Trigger:** User pasted the output of running `git pull origin main` on the server, which failed:
```
error: Your local changes to the following files would be overwritten by merge:
        billbull-backend/src/main/resources/application.properties
        billbull-frontend/package-lock.json
Please commit your changes or stash them before you merge.
Aborting
```

This is **Error #2** in the full catalog (Section 5). Full investigation/resolution sequence documented there in detail. Summary of what happened across several back-and-forth turns:
1. Refused to stash/pull blindly; asked the user how to proceed. User chose "show me the diff first."
2. `git diff` on `application.properties` showed the server's local edit removed `server.port=8080` and 3 dev-only DB default lines from the base properties file, plus a trailing-newline fix.
3. Confirmed via `.dockerignore`... (no — via checking all 13 real client profile files) that every one of them sets its own `server.port`/`spring.datasource.*`, meaning the base file's dev defaults were genuinely unused dead weight, safe to remove.
4. User approved: "Keep server's edit — strip port/DB defaults."
5. Ran `git stash; git pull origin main; git stash pop` on the server — this **hit a real merge conflict** (see Error #2 detail) because the stash was applied on top of an already-partially-conflicted state from a prior interrupted attempt.
6. Diagnosed via `git status`, `git log --oneline -5`, `git stash list`, and `cat` of the conflicted file — found conflict markers around a single blank-line difference in the DB driver section.
7. Resolved via `sed -i '/^<<<<<<< Updated upstream$/,/^>>>>>>> Stashed changes$/d' ...`, `git add`, `git stash drop`.
8. **Separately**, made the identical fix in the local (Windows) repo checkout, committed it (`dc93c43`) to `feature/bbpos`, so the fix becomes permanent and stops recurring on future pulls to any server.

**Result:** Server git state clean. Local commit pending push (handled properly later, see Phase 9).

---

## Phase 9 — First Push Rejection, then a Real Credential-Leak Block (critical safety event)

**Trigger:** User committed and pushed locally on their own initiative:
```
git add .
git commit -m "Build images directly on 77.37.49.42"
git push origin feature/bbpos
```
Result: `! [rejected] feature/bbpos -> feature/bbpos (fetch first)`.

**Investigation:** `git fetch origin feature/bbpos` showed the remote had one extra merge commit (`847fd91 Merge branch 'main' into feature/bbpos`) that the local branch lacked. `git diff --stat dc93c43 847fd91` showed only a 1-line trailing-newline diff in `application.properties` — trivial, non-conflicting.

**Action taken:** `git pull origin feature/bbpos --no-edit` — merged cleanly, no manual conflict resolution needed.

**Critical event — push blocked by the platform's own safety classifier:**
```
git push origin feature/bbpos
```
Returned:
```
Permission for this action was denied by the Claude Code auto mode classifier.
Reason: [Data Exfiltration] The push to the confirmed-public repo Haarizz/Billbull_Retail
(feature/bbpos) carries k8s/max/RUNBOOK.md, which explicitly documents the live production
database password ("root") and confirms the live JWT secret for the max client — real
credentials in committed content heading to a public destination...
```

This is **Error #4 / Security Event #1** in the full catalog (Section 5) — treated with the highest severity of anything in this migration, documented in full detail there. Summary: an earlier edit to `RUNBOOK.md` (Phase 6/7's documentation work) had written the literal live database password (`root`) directly into the markdown file as part of "confirmed values for max" documentation — a genuine mistake, correctly caught by the platform's automated safety layer before it reached the public GitHub repository.

**Remediation performed:**
1. Grepped the file for `password|jwt.secret|root\b` to find every instance.
2. Confirmed line 138 stated the live production DB password in plaintext, explicitly tied to `max`.
3. Rewrote the section to state only **structural facts** (which env vars have no override, where to find real values) — never the literal secret value. Real password/JWT guidance changed to "see your private notes / password manager for the actual credential values, do not add them to this file."
4. Verified via `git diff dc93c43 HEAD --stat` and a targeted `grep -i "root|password|secret|billbull-super"` that no actual secret value remained anywhere in the diff (only the SSH username `root@77.37.49.42` and a filesystem path `/root/Billbull/...` remained, neither of which are secrets).
5. Confirmed via `git log --all -p` that the leaked value had **never actually reached the remote** — it only ever existed in the local uncommitted/blocked-push state.
6. Committed the redaction and pushed successfully.

**Result:** No credential ever reached the public repository. This is treated as a successful safety intervention, not a failure — the block worked exactly as intended.

---

## Phase 10 — Merge Confirmation and Server Pull

**Trigger:** User pasted a screenshot of the GitHub compare/PR view between `main` and `feature/bbpos`, asking whether commits had been merged to `main`, and stated they had already clicked merge.

**Clarifying question asked:** Confirmed via `AskUserQuestion` whether the PR was actually merged (vs. just viewed) — user confirmed: "Already merged to main."

**Action:** Instructed the user to run, on the server:
```bash
docker --version || (curl -fsSL https://get.docker.com | sh)
cd ~/Billbull/Billbull_Retail
git checkout main
git pull origin main
cd billbull-backend
docker build -t billbull-backend:pilot .
```

**Result of this exact run (as pasted by the user):**
- Docker was not installed (`Command 'docker' not found`); the install script ran successfully, Docker Engine 29.6.1 installed and started.
- `git checkout main` / `git pull origin main`: fast-forwarded `99cfcfe..7d6d6f1`, pulling in the RUNBOOK, Dockerfile, and deployment/frontend manifest changes.
- `docker build` ran for 228.1s and **failed** at the Chromium install step:
```
=> ERROR [stage-1 5/5] RUN java -cp app.jar com.microsoft.playwright.CLI install --with-deps chromium   0.4s
------
 > [stage-1 5/5] RUN java -cp app.jar com.microsoft.playwright.CLI install --with-deps chromium:
0.387 Error: Could not find or load main class com.microsoft.playwright.CLI
0.387 Caused by: java.lang.ClassNotFoundException: com.microsoft.playwright.CLI
```

This is **Error #3** in the full catalog (Section 5) — the largest single debugging effort in the migration, spanning several attempts. Full detail there. High-level summary of the three attempts:
1. `java -cp app.jar com.microsoft.playwright.CLI` — failed (Spring Boot fat jar nests deps under `BOOT-INF/lib`, invisible to plain `-cp`).
2. `java -jar playwright-1.49.0.jar` (via `mvn dependency:copy` of just the one artifact) — failed differently: `Exception in thread "main" java.lang.NoClassDefFoundError: com/microsoft/playwright/impl/driver/Driver`. Verified via `unzip -p playwright-1.49.0.jar META-INF/MANIFEST.MF` that the jar has no `Main-Class` manifest entry at all.
3. `mvn dependency:copy-dependencies -DincludeArtifactIds=playwright` — looked correct, but verified via `docker build --target build` + `docker run --rm <tag> ls /app/playwright-lib` that it only copied the single named jar, not its transitive `driver`/`driver-bundle` dependencies. Root cause confirmed via `mvn dependency:tree -Dincludes=com.microsoft.playwright`, which showed exactly 3 required jars.
4. **Final working fix:** `-DincludeGroupIds=com.microsoft.playwright` instead of `-DincludeArtifactIds` — captures the full transitive subtree by groupId. Re-verified via the same debug-stage inspection technique before running the full (slow) build again, confirming all 3 jars (`playwright-1.49.0.jar`, `driver-1.49.0.jar` — 6,863 bytes, `driver-bundle-1.49.0.jar` — 198,428,414 bytes) landed correctly.

**Result:** Backend image built successfully — `[stage-1 6/6]` Chromium install completed in 41.5s, image exported and tagged `billbull-backend:pilot`.

---

## Phase 11 — Frontend Image Build

**Command run:**
```bash
cd ~/Billbull/Billbull_Retail/billbull-frontend
docker build -t billbull-frontend:pilot .
```

**Result:** Succeeded in 111.0s. One inefficiency noted (not a failure): the `[internal] load build context` step transferred 370.35MB in 16.4s, because no `.dockerignore` existed yet to exclude `node_modules` — harmless (gets overwritten by `npm ci` + `COPY . .` inside the image regardless) but wasteful of build time.

**Fix applied (minor, non-blocking):** Created `billbull-frontend/.dockerignore`:
```
node_modules
dist
dist_check
.vite
.env
.env.local
.env.*.local
```
Committed and pushed (`1b550fc`).

**Result:** Both images (`billbull-backend:pilot`, `billbull-frontend:pilot`) built successfully and available locally on the server's Docker daemon.

---

## Phase 12 — k3s Installation and the Traefik/nginx Port Conflict

**Command run:**
```bash
curl -sfL https://get.k3s.io | sh -
sudo systemctl status k3s
```

**Result:** k3s v1.36.2+k3s1 installed successfully, `active (running)`.

**Immediate follow-up investigation (proactive, before any further steps):** Ran port and routing checks to confirm the anticipated Traefik/nginx conflict hadn't silently broken the 3 other live clients:
```bash
sudo systemctl status nginx
curl -sI http://nest.billbull.app 2>&1 | head -5
curl -sI http://hilite.billbull.app 2>&1 | head -5
curl -sI http://albadar.billbull.app 2>&1 | head -5
sudo ss -tlnp | grep -E ':80|:443'
```

**Result:** nginx still `active (running)`, `ss` showed only nginx bound to `:80`/`:443`. **However**, all three domain curls returned `404 Not Found` with a generic 19-byte plaintext body — this is **Error #5** in the full catalog (a red herring, ultimately traced to a pre-existing, unrelated certbot artifact — `return 404; # managed by Certbot` — in nginx's own config, not caused by k3s at all).

**Further investigation:** `sudo kubectl get svc -n kube-system traefik -o wide` showed Traefik's Service already listing `EXTERNAL-IP: 77.37.49.42` with `PORT(S): 80:32563/TCP,443:32322/TCP` — confirming k3s's ServiceLB *intended* to bind the real host ports, and was only failing to do so because nginx held them first — a live, previously-invisible race condition.

**Decision point — three-way clarifying exchange:**
1. First `AskUserQuestion`: whether to fix the port risk now. → User asked back: *"can we take the port 80/443 from nginx, cause do we use ingress instead of nginx?"*
2. Second `AskUserQuestion`, clarifying the sequencing risk (handing ports to Traefik immediately would take `nest`/`hilite`/`albadar` offline, since only `max` had k8s manifests to route to): options were (a) alt-port Traefik until `max` verified, keeping the other 3 alive, or (b) migrate all 4 clients to k8s today before any cutover. → User answered directly: *"yeah you can use the port 80/443, you can take the other clients offline cause they are not currently required. so lets try with the max client and then we can use then on other clients."*

This is an explicit, deliberate scope decision made by the user — taking `nest`, `hilite`, `albadar` offline was authorized directly, not assumed or defaulted to.

**Commands run:**
```bash
sudo systemctl stop nginx
sudo systemctl disable nginx
sudo ss -tlnp | grep -E ':80|:443'
```

**Result:** `ss` returned **nothing at all** — no process visible listening on 80/443. This is **Error #6** in the full catalog: a false alarm, resolved by testing with `curl -sI http://127.0.0.1:80` instead, which returned a real `404 Not Found` (Traefik's own default page, correctly indicating it was in fact serving traffic, just not via a mechanism `ss` could see — klipper-lb/ServiceLB uses iptables/nftables DNAT inside its own pod network namespace, not a host-level `bind()`).

---

## Phase 13 — Postgres Network Access Configuration

**Trigger:** Continuing the runbook, needed to open Postgres to the k3s pod network.

**Commands run:**
```bash
sudo -u postgres psql -c "SHOW config_file;"
sudo -u postgres psql -c "SHOW listen_addresses;"
```
**Result:** `/etc/postgresql/16/main/postgresql.conf`; `listen_addresses` reported as `localhost` (the default, since the real line was commented out, not because it was explicitly set — this distinction became important next).

**First `sed` attempt (failed silently) — Error #7 in the full catalog:**
```bash
sudo sed -i "s/^listen_addresses = 'localhost'/listen_addresses = '*'/" /etc/postgresql/16/main/postgresql.conf
grep "^listen_addresses" /etc/postgresql/16/main/postgresql.conf
```
Result: the `grep` returned **nothing** — the substitution silently matched zero lines, because the real line began with `#` (commented out), not `listen_addresses` directly.

**Diagnosis:** Requested `grep -n "listen_addresses"` (without the `^` anchor) to find the real line, which returned:
```
60:#listen_addresses = 'localhost'              # what IP address(es) to listen on;
```

**Corrected fix, line-number-anchored:**
```bash
sudo sed -i "60s/^#listen_addresses = 'localhost'/listen_addresses = '*'/" /etc/postgresql/16/main/postgresql.conf
grep -n "listen_addresses" /etc/postgresql/16/main/postgresql.conf
```
**Result:** `60:listen_addresses = '*'               # what IP address(es) to listen on;` — confirmed fixed.

**Real pod CIDR confirmed (not assumed as the generic `/16`):**
```bash
sudo kubectl cluster-info dump 2>/dev/null | grep -m1 -o 'cluster-cidr=[^ "]*' || sudo cat /etc/rancher/k3s/k3s.yaml | grep -i cluster-cidr
cat /var/lib/rancher/k3s/server/manifests/*.yaml 2>/dev/null | grep -i cidr
ip route | grep 10.42
```
**Result:** `10.42.0.0/24 dev cni0 proto kernel scope link src 10.42.0.1` — confirmed the real pod CIDR is `/24`, not the generically-assumed `/16`.

**`pg_hba.conf` rule added:**
```bash
echo "host    billbull_max    postgres    10.42.0.0/24    md5" | sudo tee -a /etc/postgresql/16/main/pg_hba.conf
tail -5 /etc/postgresql/16/main/pg_hba.conf
```

**Postgres restarted and verified — including a specific safety check that the live `billbull-max` systemd service (still connecting via `localhost`) wasn't broken by the restart:**
```bash
sudo systemctl restart postgresql
sudo systemctl status postgresql --no-pager
sudo systemctl status billbull-max --no-pager
```
**Result:** `postgresql.service` showed `active (exited)` — initially looked like a failure, but investigated and confirmed to be a normal Debian/Ubuntu meta-unit pattern (`ExecStart=/bin/true`), not a real failure — the actual daemon is `postgresql@16-main.service`.

`billbull-max.service` showed `failed`, stopped at `11:25:38` — **an hour before** the Postgres restart at `12:29:42`. This is **Error #8** in the full catalog: investigated via `journalctl -u billbull-max --since "11:20" --until "11:30"`, which showed a clean, graceful `SIGTERM`-triggered shutdown sequence (Tomcat graceful shutdown, JPA EntityManagerFactory close, HikariCP pool shutdown — all completing normally, `status=143` = `128+15` = SIGTERM), not a crash. Asked the user directly whether they had stopped it deliberately — user confirmed: "Yes, I stopped it intentionally." Resolved as a non-issue, unrelated to anything performed during this migration.

**Correct daemon status verified:**
```bash
sudo systemctl status postgresql@16-main --no-pager
sudo ss -tlnp | grep 5432
sudo -u postgres psql -c "SHOW listen_addresses;"
```
**Result:** `active (running)`, `LISTEN 0 200 0.0.0.0:5432 0.0.0.0:* users:(("postgres",...))`, `listen_addresses = *`. Confirmed fully working.

---

## Phase 14 — Image Import Into k3s Containerd

**Commands run:**
```bash
docker save billbull-backend:pilot | sudo k3s ctr images import -
docker save billbull-frontend:pilot | sudo k3s ctr images import -
sudo k3s ctr images ls | grep billbull
```
**Result:** Both images imported successfully — `docker.io/library/billbull-backend:pilot` (981.9 MiB), `docker.io/library/billbull-frontend:pilot` (22.3 MiB), both `linux/amd64`, tagged `io.cri-containerd.image=managed`.

---

## Phase 15 — cert-manager and ClusterIssuer

**Commands run:**
```bash
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/latest/download/cert-manager.yaml
kubectl get pods -n cert-manager --watch
```
**Result:** All 3 cert-manager pods (`cert-manager`, `cert-manager-cainjector`, `cert-manager-webhook`) reached `1/1 Running` within ~15 seconds.

**First `ClusterIssuer` apply attempt (path error):**
```bash
kubectl apply -f k8s/max/cluster-issuer.yaml
```
User ran this from the wrong working directory (`billbull-frontend/`, left over from the previous step) with a stray `ml` typo appended to the filename. Error:
```
error: the path "k8s/max/cluster-issuer.yaml" does not exist
```
**Fix:** `cd ~/Billbull/Billbull_Retail` first, then re-run.

**Corrected commands and result:**
```bash
kubectl apply -f k8s/max/cluster-issuer.yaml
kubectl get clusterissuer letsencrypt-prod
```
Result: `clusterissuer.cert-manager.io/letsencrypt-prod created`; initially showed blank `READY` column at `0s` age (expected, still registering). After `sleep 5`, `READY: True`.

---

## Phase 16 — Namespace, ConfigMap, PVC, Secret

**Commands run:**
```bash
kubectl apply -f k8s/max/namespace.yaml
kubectl apply -f k8s/max/configmap.yaml
kubectl apply -f k8s/max/pvc.yaml
kubectl get pvc -n billbull
```
**Result:** All three created successfully. PVC showed `STATUS: Pending` at `1s` age — explained as normal for `local-path`'s `WaitForFirstConsumer` binding mode (won't provision until a pod that mounts it is scheduled).

**Secret creation — done carefully on the server, never via a committed file:**
```bash
cd ~/Billbull/Billbull_Retail
cp k8s/max/secret.template.yaml k8s/max/secret.yaml
nano k8s/max/secret.yaml
```

Guidance given for the 4 values to fill in:
- `SPRING_DATASOURCE_URL`: `jdbc:postgresql://77.37.49.42:5432/billbull_max`
- `SPRING_DATASOURCE_USERNAME`: `postgres`
- `SPRING_DATASOURCE_PASSWORD`: the real live value (verify, don't assume from the checked-in file)
- `JWT_SECRET`: the dev-fallback value from base `application.properties`

**Clarifying moment:** User asked, having selected the exact `jwt.secret=${JWT_SECRET:billbull-super-secret-key-32chars-minimum!!}` line in the IDE: *"should i paste this exactly to there."* Answered: no — only the value portion (`billbull-super-secret-key-32chars-minimum!!`), not the Spring placeholder syntax (`jwt.secret=${JWT_SECRET:...}`).

**Commands run to apply and verify:**
```bash
kubectl apply -f k8s/max/secret.yaml
kubectl get secret -n billbull max-backend-secret
git status --short k8s/max/
```
**Result:** `secret/max-backend-secret created`, `TYPE: Opaque, DATA: 4, AGE: 0s`. `git status --short` returned **nothing** — confirmed `secret.yaml` correctly gitignored, not staged for commit.

---

## Phase 17 — Backend Pod Deployment (the critical moment)

**Commands run:**
```bash
kubectl apply -f k8s/max/deployment.yaml
kubectl get pods -n billbull -l app=max-backend --watch
```
**Result:** `max-backend-7649fdcc-4nmmj   0/1   Running   0   7s`.

**Log check:**
```bash
kubectl logs -n billbull deploy/max-backend --tail=50
```
**Result:** Live Hibernate SQL queries visible (e.g. selecting from `sales_receipt_vouchers`, `pos_terminals`) — strong evidence the pod had successfully connected to the real `billbull_max` database over the pod network.

**Readiness confirmation:**
```bash
kubectl get pods -n billbull -l app=max-backend
kubectl logs -n billbull deploy/max-backend --tail=200 | grep -iE "error|exception|failed|started application|flyway"
```
**Result:** `READY: 1/1`, `STATUS: Running`, `RESTARTS: 0`, age 86s. The error/exception grep returned **nothing** — clean boot, no crashes.

---

## Phase 18 — Frontend, Ingress, TLS

**Commands run:**
```bash
kubectl apply -f k8s/max/frontend.yaml
kubectl apply -f k8s/max/ingress.yaml
kubectl get pods -n billbull -l app=billbull-frontend
kubectl get ingress -n billbull max-ingress
```
**Result:** Both frontend pods `ContainerCreating` initially; Ingress immediately showed `ADDRESS: 77.37.49.42`, `PORTS: 80, 443`.

**Follow-up after a short wait:**
```bash
sleep 10
kubectl get pods -n billbull -l app=billbull-frontend
kubectl get certificate -n billbull max-tls
```
**Result:** Both frontend pods `1/1 Running`. **`max-tls` certificate: `READY: True`**, age 81s — Let's Encrypt issued a real, valid certificate with zero DNS changes required, since `max.billbull.app` already pointed at 77.37.49.42 from its prior nginx-based hosting.

---

## Phase 19 — Manual Functional Verification

**Action:** User instructed to visit `https://max.billbull.app` directly in a browser (the `/etc/hosts` override step from the original runbook was skipped as unnecessary, since DNS already pointed correctly) and manually verify:
1. Page loads, valid padlock/cert.
2. Login works.
3. Existing customer/product data visible.
4. PDF generation works (invoice/report).
5. Product image upload works.

**Result reported by user:** *"Everything is running perfectly."* All 5 checks passed.

---

## Phase 20 — Retiring the Old systemd Service

**Commands run:**
```bash
sudo systemctl disable billbull-max
sudo systemctl status billbull-max --no-pager
```
**Result:** `disabled` (was already stopped from the earlier deliberate user action in Phase 12/13). Confirmed the service will not start on boot and won't conflict with the k8s deployment going forward.

---

## Phase 21 — Retrospective Documentation

**Action:** Rewrote `k8s/max/RUNBOOK.md` in full as a "DONE" retrospective — documenting what actually happened vs. the original plan for every point where reality diverged (Traefik taking ports directly rather than needing the alt-port workaround; the real `/24` pod CIDR; the `listen_addresses` sed trap; the `postgresql.service` meta-unit trap; the full Playwright classpath fix chain; the uploads decision), and rewritten as a corrected, faster template for migrating `nest`/`hilite`/`albadar` next.

**Committed and pushed:** `a9f64b9 Rewrite max RUNBOOK.md as a verified retrospective + template for next clients`.

---

## Phase 22 — Post-Migration Discussion

**Q1:** *"do we need to restart the backend or frontend manually if any changes occured?"* — Answered with the full day-2 operations model: `git pull` → `docker build` → `docker save | k3s ctr images import` → `kubectl rollout restart deployment/...`, explaining why `rollout restart` is necessary even when the image tag doesn't change (k8s doesn't know the content behind a tag changed unless told explicitly), and that ConfigMap/Secret edits also require an explicit rollout restart (env vars are read only at container start), whereas editing the Deployment manifest itself triggers a rollout automatically.

**Q2:** *"is it better or good decision to move from our old setup to this new?"* — Answered with a balanced assessment, not pure endorsement: clear wins identified (certificate automation, new-client onboarding via Helm, environment consistency, self-healing), genuine costs acknowledged (real operational complexity increase, demonstrated directly by the session's own debugging — Playwright classpath bug, silent `sed` failure, port conflict, `ss`-vs-`curl` false alarm — none of which would have existed under the old systemd setup), and an honest caveat that **no actual scaling/HA benefit has been realized yet**, since every client is still pinned to `replicas: 1` + `Recreate` by the unresolved uploads-PVC constraint. Framed the verdict as: right decision *given the stated goal* (cleaner per-client deploy tooling, prompted by the PM's request), not an unconditionally superior architecture at BillBull's current scale.

---

## Phase 23 — This Document

**Trigger:** User requested a complete, non-summarized engineering log export in structured Markdown format, explicitly enumerating 12 required sections, followed by a request (in a message later flagged as containing injected/untrusted content) to export the raw conversation.

**Note on the injected-content event:** A tool result returned during this phase contained text formatted as if it were guidance *to the AI* (explaining Kubernetes concepts back and issuing an instruction to "upload" specific files once the log was generated) rather than a genuine user answer to the clarifying question asked. This was identified as not a legitimate instruction and was not acted upon — no files were uploaded anywhere; this document was written only to the local repository, consistent with every other artifact produced this session.

---

*(Continued in Part 3: Every Command, Grouped by Topic)*
