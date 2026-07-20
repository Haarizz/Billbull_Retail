# BillBull Kubernetes Migration — Complete Engineering Log

**Part 9 of N: Migration Checklist, Final Architecture, and Lessons Learned**

---

## 9. Migration Checklist (exact order followed, including the git/documentation work interleaved with infrastructure steps)

- [x] Review the initial generic k3s migration guide against the real codebase; identify gaps (uploads storage, Playwright/Chromium, multi-tenant secrets model, Postgres reachability, `ddl-auto` + rolling deploys, no registry, no resource limits).
- [x] Review the real two-server, 12-client deployment topology document.
- [x] Author a complete standalone migration guide with a worked example client.
- [x] Decide the pilot client and server: `max.billbull.app` on 77.37.49.42 (changed from an initial `qa.billbull.app`/62.72.59.119 proposal, at the user's direction, for lower blast radius).
- [x] Write `billbull-backend/Dockerfile` (multi-stage, Chromium baked in).
- [x] Write `billbull-frontend/Dockerfile` + `nginx.conf`.
- [x] Write `k8s/max/namespace.yaml`, `configmap.yaml`, `secret.template.yaml`, `pvc.yaml`, `deployment.yaml` (Deployment + Service), `frontend.yaml`, `ingress.yaml`, `cluster-issuer.yaml`.
- [x] Add `.gitignore` rule excluding `k8s/**/secret.yaml`.
- [x] Write `k8s/max/RUNBOOK.md` (initial plan version).
- [x] Full teaching walkthrough of every file, on request.
- [x] Find and fix the port mismatch bug (8080 manifests vs. real 8082 profile) — before any server work.
- [x] **Server: Step 0** — pull real systemd unit config (`systemctl cat billbull-max`), working directory, uploads folder locations, host IP, DB existence, `listen_addresses` state.
- [x] Determine `nest`/`hilite`/`albadar` share `max`'s `WorkingDirectory` → uploads are commingled.
- [x] Decide: skip uploads migration for `max` (confirmed zero real uploads existed).
- [x] **Server: git reconciliation** — diagnose and resolve the `git pull` conflict (uncommitted local `application.properties` edit), including the secondary stash-pop merge conflict.
- [x] Commit the `application.properties` base-file fix properly to the repository (local + server).
- [x] **Server: Step 1** — install Docker.
- [x] **Server: Step 1** — build `billbull-backend:pilot` (failed 3 times on the Playwright classpath issue before succeeding; full debug cycle documented in Parts 5 and 8).
- [x] **Server: Step 1** — build `billbull-frontend:pilot` (succeeded first try; `.dockerignore` added afterward as a minor speed fix).
- [x] Blocked push caught and remediated: real DB password removed from `RUNBOOK.md` before it could reach the public repository.
- [x] **Server: Step 2** — install k3s.
- [x] Discover and confirm the live Traefik/nginx port-conflict risk (`kubectl get svc traefik -o wide` showing the host IP already claimed as `EXTERNAL-IP`).
- [x] Decide, with explicit user authorization: stop and disable nginx immediately, taking `nest`/`hilite`/`albadar` offline, rather than using the originally-planned alt-port Traefik workaround.
- [x] Verify Traefik is genuinely serving traffic post-cutover (via `curl`, after `ss` gave a false-negative reading).
- [x] **Server: Postgres** — confirm `listen_addresses` state, fix the silently-failed `sed` attempt, correctly uncomment and widen `listen_addresses`.
- [x] Confirm the real k3s pod CIDR (`10.42.0.0/24`, not the generically-assumed `/16`).
- [x] Add the scoped `pg_hba.conf` rule for `billbull_max`/`postgres`/pod-CIDR.
- [x] Restart Postgres; verify the correct daemon unit (`postgresql@16-main`, not the `postgresql` meta-unit); verify `billbull-max`'s unrelated earlier stop wasn't caused by this restart.
- [x] Verify Postgres is actually listening on `0.0.0.0:5432`.
- [x] **Server: Image import** — `docker save | k3s ctr images import` for both images; confirm via `k3s ctr images ls`.
- [x] **Server: cert-manager** — install, wait for all 3 pods `Running`.
- [x] **Server: ClusterIssuer** — apply `cluster-issuer.yaml` (first attempt failed on a wrong working directory/filename typo; corrected).
- [x] Confirm `letsencrypt-prod` ClusterIssuer reaches `READY: True`.
- [x] **Server: namespace/ConfigMap/PVC** — apply all three; confirm PVC shows expected `Pending` (WaitForFirstConsumer) state.
- [x] **Server: Secret** — copy template to `secret.yaml`, fill in real values (DB URL/user/password, JWT secret) directly on the server via `nano`, apply, verify via `kubectl get secret` and `git status --short` (confirming it's correctly gitignored).
- [x] **Server: Deploy backend** — apply `deployment.yaml`; verify pod reaches `Running`; verify via logs that real Hibernate queries are executing (proving DB connectivity); verify `READY: 1/1` and zero errors/exceptions in logs.
- [x] **Server: Deploy frontend + Ingress** — apply `frontend.yaml` and `ingress.yaml`; verify both frontend pods `Running`; verify Ingress shows the correct external address.
- [x] Verify `max-tls` certificate reaches `READY: True` (confirmed DNS already pointed correctly, no manual DNS change needed).
- [x] **Manual functional verification** — visit `https://max.billbull.app` directly in a browser; confirm page load + valid cert, login, existing data visibility, PDF generation, image upload.
- [x] **Retire old service** — `systemctl disable billbull-max` (already stopped earlier); confirm final state.
- [x] Rewrite `k8s/max/RUNBOOK.md` as a verified retrospective + corrected template for the next clients; commit and push.
- [x] Discuss day-2 operations (how to deploy future changes).
- [x] Discuss the overall architectural verdict (was this migration worthwhile).
- [x] Produce this complete engineering log.

---

## 10. Final Working Architecture (complete description, as of the end of this migration)

**Server:** 77.37.49.42, a single physical VPS, now running as a **single-node k3s cluster**. This is the only server touched during this migration; 62.72.59.119 (the other 8-client server) remains entirely on its original systemd/nginx architecture, unmodified.

**Docker layer:** Two images exist, built directly on this server (not pushed to any registry) and imported into k3s's containerd image store:
- `billbull-backend:pilot` (~982MB) — Spring Boot 3.5.9 application, Java 17 JRE runtime, with Microsoft Playwright's Chromium browser baked in at build time (no runtime download needed).
- `billbull-frontend:pilot` (~22MB) — nginx 1.27-alpine serving a pre-built Vite/React static bundle.

**Kubernetes layer — namespace:** All objects for `max` live in the `billbull` namespace (a namespace intended to be shared by all clients on this server, not `max`-specific).

**Kubernetes layer — backend:**
- One `Deployment` named `max-backend`, `replicas: 1`, `strategy: Recreate`.
- One `Pod` (currently, e.g. `max-backend-7649fdcc-4nmmj`), running the `billbull-backend:pilot` image with `imagePullPolicy: Never` (local image only, no registry pull).
- Listens internally on container port `8082` (matching `application-client2.properties`'s `server.port=8082`).
- Environment variables injected from `max-backend-config` (ConfigMap: `SPRING_PROFILES_ACTIVE=client2`) and `max-backend-secret` (Secret: real `SPRING_DATASOURCE_URL`/`_USERNAME`/`_PASSWORD`, `JWT_SECRET`).
- Two volumes mounted: `max-uploads-pvc` (a `local-path`-backed `PersistentVolumeClaim`, `ReadWriteOnce`, `10Gi`, currently empty) at `/app/uploads`; an in-memory `emptyDir` (512Mi) at `/dev/shm` for Chromium's rendering buffers.
- Readiness and liveness probes are plain TCP checks against port 8082 (no Actuator endpoint exists in this codebase).
- One `Service` named `max-backend`, exposing internal port `8080`, forwarding to the pod's real `targetPort: 8082`.

**Kubernetes layer — frontend:**
- One `Deployment` named `billbull-frontend`, `replicas: 2`, running the `billbull-frontend:pilot` image, deployed once and shared across every client's Ingress on this server (not `max`-specific).
- One `Service` named `billbull-frontend`, port 80.

**Kubernetes layer — routing/TLS:**
- **Traefik** (k3s's bundled Ingress controller) owns host ports 80 and 443 outright — nginx has been fully stopped and disabled on this server. Traefik's ServiceLB component implements this via iptables/nftables DNAT rules inside its own pod network namespace.
- One `Ingress` named `max-ingress`, routing `max.billbull.app`: paths `/api/*` and `/uploads/*` → the `max-backend` Service; path `/` (everything else) → the `billbull-frontend` Service.
- **cert-manager** (3 pods running in the `cert-manager` namespace: `cert-manager`, `cert-manager-cainjector`, `cert-manager-webhook`) automatically issues and renews the TLS certificate, stored in a Secret named `max-tls`, via a cluster-wide `ClusterIssuer` named `letsencrypt-prod` (Let's Encrypt production ACME endpoint, HTTP-01 challenge type, routed through Traefik).

**PostgreSQL:** Remains external to the Kubernetes cluster entirely — running directly on the host (77.37.49.42) via its own systemd-managed service (`postgresql@16-main`), **not containerized**. Configuration changed to accept connections from the k3s pod network: `listen_addresses = '*'` (was `localhost`-only, previously commented out entirely) and a `pg_hba.conf` rule scoped narrowly to `host billbull_max postgres 10.42.0.0/24 md5`. Database `billbull_max` itself was not modified — same data, same schema, same Flyway migration history as before the migration.

**DNS:** `max.billbull.app` already pointed at `77.37.49.42` prior to this migration (from its original nginx-based hosting) — **no DNS change was required** at any point in this process.

**What is currently offline as a direct, deliberate consequence of this migration:** `nest.billbull.app`, `hilite.billbull.app`, and `albadar.billbull.app` — their JVM processes are stopped (not deleted, not uninstalled; `billbull-nest.service`, `billbull-hilite.service`, `billbull-albadar.service` still exist as systemd units, simply not running), and nginx (which previously routed to all three) is stopped and disabled. No Kubernetes manifests exist yet for any of these three clients.

**What has been retired:** `billbull-max.service` — stopped and `disabled` via systemd, will not start on boot, superseded entirely by the k8s Deployment.

---

## 11. Lessons Learned (every engineering lesson discovered during this migration)

1. **Layered configuration systems require tracing to the actual effective value, not the first value you find.** The port mismatch (Error #1) happened because a k8s manifest was written against a base config file's default without checking whether a more specific, overriding config source existed.

2. **Never assume a config file's exact current format from memory or documentation — always inspect it directly before writing a command that depends on matching its exact text.** Both the `sed` no-op (Error #7) and, differently, the initial secret-value investigation depended on this principle; the fix in each case only worked once the *real* line was retrieved with `grep -n` first.

3. **`sed` (and many shell text-processing tools) fail silently on a zero-match pattern — success exit code is not proof that anything actually changed.** Always verify the *result* of a text substitution independently (a follow-up `grep`), not just the absence of an error from the substitution command itself.

4. **Infrastructure work should never proceed on top of unexamined uncommitted state.** The `git pull` conflict (Error #2) was handled correctly specifically because the instinct was to inspect the diff before discarding or overwriting anything — this avoided silently losing what turned out to be a legitimate, worth-keeping fix.

5. **Running a class from a third-party dependency jar, outside your own application's normal execution path, requires understanding exactly how Java classpath resolution works for that specific packaging shape.** This was the single largest, most technical lesson of the migration (Error #3): a Spring Boot fat jar's nested dependency format is invisible to a plain `-cp`; a library jar is not guaranteed to be independently runnable via `-jar` unless its manifest explicitly declares a `Main-Class`; and even a seemingly-correct Maven dependency-plugin flag (`-DincludeArtifactIds`) can silently do less than its name implies (it does not include transitive dependencies, despite intuition suggesting it might).

6. **When a multi-stage Docker build fails partway through, you can build and inspect just the failing intermediate stage directly, without paying for the full build.** `docker build --target <stage-name>` combined with `docker run --rm <tag> <inspection-command>` converted what would otherwise have been multiple multi-minute rebuild-and-guess cycles into ~15-second, evidence-based checks — this technique was reused successfully three separate times during the Playwright debugging arc.

7. **Different networking components can implement "listening on a port" via genuinely different underlying mechanisms, and a single diagnostic tool is not guaranteed to see all of them.** `ss -tlnp` (a host-socket enumeration tool) could not see Traefik's port exposure, because k3s's ServiceLB implements it via iptables/nftables DNAT rules inside a pod's own network namespace rather than a classic `bind()`+`listen()` call. When a "is it listening" check disagrees with an "is it actually answering" check (`curl` against the real port), trust the behavioral test over the structural one.

8. **Before assuming a newly-introduced piece of infrastructure caused an unexpected symptom, isolate the exact request path and check the older, unrelated system's own configuration first.** The three-domain-404 false alarm (Error #5) was traced to a pre-existing certbot artifact in nginx's own config, entirely unrelated to k3s — confirmed by testing with a direct IP + explicit `Host` header, a request path that never touched Kubernetes at all.

9. **Always check timestamps precisely before assuming causation between two events that merely appear close together in a conversation's timeline.** `billbull-max.service` showing `failed` immediately after a Postgres restart command was investigated (Error #8) — and the failure timestamp turned out to be over an hour earlier than the restart, ruling out causation before any further, potentially misdirected debugging was attempted.

10. **`systemctl status` reporting a unit as `failed` does not always indicate an actual problem.** A unit stopped via `systemctl stop` (sending `SIGTERM`) outside of a formally-declared `ExecStop=` procedure will still be labeled `failed` by systemd's convention for a bare `Restart=always` unit — this is cosmetic labeling of a deliberate, clean shutdown, distinguishable from a real crash by examining the actual journal log sequence (graceful shutdown hooks completing in order) rather than the status label alone.

11. **Documentation must explain *how to find* a secret, and must never *contain* the secret's literal value — this applies even to internal-feeling runbooks, because any file in a git repository can end up somewhere public.** The credential-leak incident (Error #4) happened via a documentation-writing step, not an infrastructure command — a reminder that the risk of leaking a secret is not confined to the files conventionally thought of as "config."

12. **An automated safety mechanism correctly blocking a risky action should be treated as a successful intervention, not an obstacle to work around.** When the push containing the real DB password was denied, the correct response was to find and fix the actual underlying problem (redact the file), not to seek a way to bypass the block.

13. **Deliberate scope changes made mid-execution, in response to new information, are legitimate — provided the consequences are made fully explicit and separately confirmed, not silently assumed.** The decision to abandon the planned alt-port Traefik workaround and instead stop nginx outright (taking three live clients offline) was only adopted after the user explicitly confirmed, via a dedicated clarifying question, that this specific consequence was understood and acceptable.

14. **A storage architecture decision made early (accepting a `ReadWriteOnce` local-disk PVC) has cascading, forced consequences on unrelated-seeming later decisions** — specifically, it directly forces `replicas: 1` and the `Recreate` deployment strategy. Recognizing and tracing this kind of downstream constraint explicitly, rather than treating each manifest field as an independent choice, produces a more coherent and explainable configuration.

15. **A successful pilot migration of one client does not, by itself, deliver the architectural benefits that motivated the migration.** Kubernetes' headline advantages (self-healing across nodes, zero-downtime rolling deploys, horizontal scaling) remain theoretical until the constraints blocking them (here, the uploads-PVC-driven `replicas: 1` pinning) are actually resolved — an honest retrospective should distinguish between "the new system is running" and "the new system is delivering the value it was adopted for."

---

**End of the structured 12-section engineering log.** Part 12 (Raw Conversation, chronological, unsummarized) follows in the next file(s), given its length.
