# BillBull Kubernetes Migration — Complete Engineering Log

**Part 1 of N: Project Context**

---

## 1. Project Context

### 1.1 Initial Architecture (before this migration)

BillBull Retail is a two-module monorepo:

- `billbull-backend/` — Spring Boot 3.5.9, Java 17, Maven, PostgreSQL via JPA + Hibernate + Flyway
- `billbull-frontend/` — React 19 + Vite 7 + Tailwind v4, axios, react-router
- `tools/pos-print-agent/` — standalone Node.js Windows tray app, unrelated to this migration

Multi-tenant deployment model: **one Spring profile per client** (e.g. `application-client2.properties` for `max`), each pointing at its own Postgres database. Base `application.properties` holds dev-only defaults, which are overridden per client either via the profile file or via systemd `Environment=` variables.

### 1.2 Existing Server Setup (before migration)

Two physical VPS servers, each running multiple clients via systemd + nginx:

**Server 62.72.59.119** (8 clients):
| Port | Domain | 
|---|---|
| 8080 | royaltools.billbull.app |
| 8081 | leroyalflowers.billbull.app |
| 8082 | leroyalgifts.billbull.app |
| 8083 | demo.billbull.app |
| 8085 | agi.billbull.app |
| 8086 | helenz.billbull.app |
| 8087 | qa.billbull.app |
| 8088 | geebu.billbull.app |

**Server 77.37.49.42** (4 clients — this is the server used for the migration):
| Port | Domain | Spring Profile | Systemd Service |
|---|---|---|---|
| 8081 | nest.billbull.app | client1 | billbull-nest |
| 8082 | max.billbull.app | client2 | billbull-max |
| 8083 | hilite.billbull.app | hilite | billbull-hilite |
| 8084 | albadar.billbull.app | client4 | billbull-albadar |

Each client backend on a server ran from the **same shared git checkout** (`~/Billbull/Billbull_Retail` on 77.37.49.42), differentiated only by which Spring profile was passed via `--spring.profiles.active=<profile>` in its systemd unit's `ExecStart=` line, and which port it bound.

Deployment flow (from the existing `BillBull_Server_Deployment_Guide_v2.html`):
```bash
ssh root@<server>
cd Billbull/Billbull_Retail
git pull origin main
cd billbull-backend
mvn clean package -DskipTests
systemctl restart billbull-<client>
cd ../billbull-frontend
npm ci
npm run build
rm -rf /var/www/billbull/*
cp -r dist/* /var/www/billbull/
nginx -t
systemctl reload nginx
```

TLS was handled by certbot, manually, per client. PDF generation used Microsoft Playwright driving headless Chromium, installed manually per server via:
```bash
PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright \
mvn exec:java \
-Dexec.mainClass=com.microsoft.playwright.CLI \
-Dexec.args="install --with-deps chromium"
```

A known historical incident (documented in the old deployment guide, not part of this migration but part of the codebase's institutional memory): the Hilite systemd migration once failed because a Flyway migration (`V6__security_unique_email.sql`) tried to create a unique index on active user emails, but the database had two active users with the same email. Fixed by deactivating the duplicate and restarting the service. Root cause: duplicate data, not a systemd/Playwright issue.

### 1.3 Existing BillBull Deployment — Key Technical Facts Established During This Conversation

- Every persisted entity extends `common.BaseEntity` (soft-delete convention: `isActive` flag, not physical delete).
- Schema is both JPA-managed (`spring.jpa.hibernate.ddl-auto=update`) and Flyway-managed (`spring.flyway.enabled=true`, `baseline-on-migrate=true`), coexisting deliberately.
- `upload.path=uploads/` is a **relative** path in `application.properties`, resolving against the JVM's working directory.
- No Spring Boot Actuator dependency exists in `pom.xml` — confirmed via `grep actuator pom.xml` returning no matches — meaning no `/actuator/health` endpoint is available for readiness probes; a TCP check must be used instead.
- `server.port` and `spring.datasource.*` are **not** set in the base `application.properties` in the canonical repo (a local edit had removed them on the server, discussed at length in Section 5 — Errors), and are instead set per-client in `application-<profile>.properties`.
- For `max` specifically (profile `client2`): `application-client2.properties` contained:
  ```properties
  server.port=8082
  spring.datasource.url=jdbc:postgresql://localhost:5432/billbull_max
  spring.datasource.username=postgres
  spring.datasource.password=root
  ```
- The live systemd unit for `max` (`/etc/systemd/system/billbull-max.service`) contained **no** `SPRING_DATASOURCE_*` or `JWT_SECRET` environment variable overrides — only `PLAYWRIGHT_BROWSERS_PATH` and `--spring.profiles.active=client2`. This meant the DB password and JWT secret actually in live use were whatever literal values existed in the checked-in properties files, not separately configured secrets.
- The JWT secret fallback in the base `application.properties`:
  ```properties
  jwt.secret=${JWT_SECRET:billbull-super-secret-key-32chars-minimum!!}
  ```
  Since no `JWT_SECRET` env var was set for `max`, it was running in production on this literal dev-fallback value — a pre-existing security gap, noted but explicitly **not** fixed during this migration (carried forward as-is to avoid changing behavior mid-migration; flagged separately for the PM to address).
- All four clients on 77.37.49.42 (`nest`, `max`, `hilite`, `albadar`) shared **one single `WorkingDirectory`** (`/root/Billbull/Billbull_Retail/billbull-backend`), meaning their `uploads/` folders were **commingled in one shared directory** on disk. Files were UUID-prefixed (confirmed via `FileUploadUtil.java`: `String fileName = UUID.randomUUID().toString() + "_" + multipartFile.getOriginalFilename();`), so no filename collisions occurred between clients, but there was no way to determine from the filesystem alone which files belonged to which client.
- `max` specifically was confirmed to have **zero real uploaded files** — nothing had ever been uploaded through it.

### 1.4 Client Involved

**`max.billbull.app`** — Spring profile `client2`, systemd service `billbull-max`, database `billbull_max`, port 8082, hosted on server **77.37.49.42**.

This client was chosen as the pilot migration target (over the originally-discussed `qa.billbull.app` on the other server) specifically because:
1. 77.37.49.42 hosts only 4 clients (vs. 8 on 62.72.59.119) — smaller blast radius.
2. The user explicitly redirected to `max` when asked to choose a pilot client, citing the smaller server as the reason.

### 1.5 Goals of the Migration

Stated goals, established across the conversation:

1. **Immediate/tactical goal:** the user's PM asked them to "set up Kubernetes for the project." This was the explicit trigger for the work — not a technical requirement the user identified independently.
2. **Architectural goal (user's own framing, from the very first message of this conversation thread):** migrate BillBull Retail ERP from the current Ubuntu VPS (Systemd + Nginx + Certbot) setup to a single-node k3s Kubernetes cluster, deploying one client first, then replicating the deployment pattern for additional clients.
3. **Explicit non-goals / scope boundaries established during planning:**
   - PostgreSQL was to remain external to the cluster (not containerized) — this was stated in the very first migration guide document the user shared (`billbull-kubernetes-migration-guide.html`, an initial generic draft) and confirmed as correct throughout the real migration.
   - The goal was NOT high-availability or multi-node scaling at this stage — clarified explicitly via an `AskUserQuestion` early in the conversation, where the user selected that the actual goal was "just cleaner per-client deploy management," not HA — though later, when directly asked, the user clarified the trigger was specifically the PM's request to use Kubernetes, superseding the "just better tooling" framing as the sole driver.
   - Uploaded file storage (`/uploads`) was identified early as the highest-risk unresolved architectural question and was deliberately scoped as "PVC now, object storage (S3/MinIO) later" rather than solved fully in this migration.

---

*(Continued in Part 2: Complete Timeline)*
