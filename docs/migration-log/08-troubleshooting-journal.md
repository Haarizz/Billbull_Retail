# BillBull Kubernetes Migration — Complete Engineering Log

**Part 8 of N: Troubleshooting Journal**

Every issue encountered, in the Problem → Hypothesis → Investigation → Evidence → Fix structure. Cross-referenced to the full detail in Part 5 (Every Error) and Part 2 (Timeline).

---

### Journal Entry 1 — Manifest Port Mismatch

**Problem:** k8s manifests (`deployment.yaml`, `configmap.yaml`) were written assuming the backend listens on port 8080.

**Hypothesis:** None needed to be formed — the discrepancy was found directly by the user inspecting `application-client2.properties` in the IDE and comparing it against the manifests.

**Investigation:** Read `application-client2.properties` directly; explained Spring's property-source precedence (env var > profile file > base file).

**Evidence:** `application-client2.properties` line 1: `server.port=8082`, definitively overriding the base file's `8080` whenever the `client2` profile is active.

**Fix:** Removed `SERVER_PORT` from the ConfigMap; changed `containerPort`, both probe ports, and the Service `targetPort` to `8082` throughout `deployment.yaml`.

*(Full detail: Part 5, Error #1)*

---

### Journal Entry 2 — Server Git Pull Rejected, Then a Secondary Merge Conflict

**Problem:** `git pull origin main` on 77.37.49.42 failed with "Your local changes... would be overwritten by merge," naming `application.properties` and `package-lock.json`.

**Hypothesis:** Uncommitted local edits existed on the server that predated this migration's work and needed to be inspected, not discarded blindly.

**Investigation:** `git diff` on both files; cross-checked all 13 real client profile files to confirm the base file's removed defaults were genuinely unused elsewhere.

**Evidence:** The diff showed a deliberate-looking removal of `server.port=8080` and 3 dev-only DB default lines — safe to keep, confirmed via the cross-check.

**Fix attempt 1 (failed, produced a NEW error):** `git stash; git pull origin main; git stash pop` → resulted in `application.properties: needs merge`, a real conflict, because the stash was applied on top of a pre-existing partially-conflicted state.

**Further investigation:** `git status`, `git log --oneline -5`, `git stash list`, `cat` of the conflicted file — revealed the conflict was a trivial single-blank-line difference.

**Fix (successful):** `sed`-deleted the conflict markers, `git add`, `git stash drop`. Separately committed the identical fix to the local repo (`dc93c43`) so it becomes permanent once merged to `main`.

*(Full detail: Part 5, Error #2)*

---

### Journal Entry 3 — Playwright CLI: `ClassNotFoundException`

**Problem:** `docker build` failed at the Chromium install step: `Error: Could not find or load main class com.microsoft.playwright.CLI` / `ClassNotFoundException`.

**Hypothesis:** The Spring Boot fat jar's classpath should expose all its dependencies, including Playwright's classes, via a simple `-cp app.jar` invocation.

**Investigation:** Reviewed how Spring Boot fat jars are actually packaged (`BOOT-INF/lib/*.jar` nesting).

**Evidence:** This nesting format is opaque to a plain JVM classpath scan — confirmed conceptually, no server command needed since the packaging format is a known, documented fact.

**Fix attempt 1 (failed):** Switched to `java -jar playwright-1.49.0.jar` directly.

*(Continued in Journal Entry 4 — this was one continuous debugging arc)*

---

### Journal Entry 4 — Playwright CLI: `NoClassDefFoundError` After Attempt 1's Fix

**Problem:** The `-jar playwright-1.49.0.jar` approach failed differently: `NoClassDefFoundError: com/microsoft/playwright/impl/driver/Driver`.

**Hypothesis:** Either the jar lacks a runnable entry point, or it's missing dependency classes it needs at runtime.

**Investigation:** `unzip -p playwright-1.49.0.jar META-INF/MANIFEST.MF` — checked the jar's own manifest directly, before attempting anything further.

**Evidence:** No `Main-Class` line in the manifest at all — confirming this jar was never designed to be run standalone via `-jar`.

**Fix attempt 2 (partially correct approach, wrong Maven flag):** Used `mvn dependency-plugin:copy-dependencies -DincludeArtifactIds=playwright` to assemble a classpath folder, then `java -cp "playwright-lib/*" ...`.

*(Continued in Journal Entry 5)*

---

### Journal Entry 5 — Playwright CLI: Wrong Maven Filter Silently Drops Transitive Dependencies

**Problem:** The `copy-dependencies -DincludeArtifactIds=playwright` approach still failed at runtime with the same `NoClassDefFoundError` seen in Entry 4.

**Hypothesis:** `-DincludeArtifactIds=playwright` should capture Playwright and everything it depends on.

**Investigation:** Rather than guess again and pay for another full (multi-minute) Docker build, used `docker build --target build` to build only the intermediate stage, then `docker run --rm <tag> ls -la /app/playwright-lib` to inspect its actual contents directly.

**Evidence:** Only `playwright-1.49.0.jar` (614,401 bytes) was present — its dependencies were missing. Cross-verified via `mvn dependency:tree -Dincludes=com.microsoft.playwright`, which showed the authoritative full tree: `playwright` → `driver` + `driver-bundle`, exactly 3 jars total, confirming what *should* have been copied.

**Fix (successful):** Switched the Maven flag from `-DincludeArtifactIds=playwright` (matches only the one named artifact) to `-DincludeGroupIds=com.microsoft.playwright` (matches every artifact under that groupId, transitively) — re-verified via the same debug-stage inspection technique, now showing all 3 correct jars, before running the full build.

**Secondary complication within this same fix cycle:** the first re-verification attempt still showed only 1 jar, traced to Docker's build cache reusing a stale, unpulled version of the Dockerfile on the server — resolved by committing/pushing the fix and having the user `git pull origin main` before rebuilding again.

**Final confirmation:** Full `docker build -t billbull-backend:pilot .` succeeded, Chromium install step completing cleanly in 41.5 seconds.

*(Full detail for Entries 3–5 combined: Part 5, Error #3)*

---

### Journal Entry 6 — Real Credential Leak Blocked Before Reaching a Public Repo

**Problem:** `git push origin feature/bbpos` was denied by the platform's own safety classifier, citing "Data Exfiltration" — a real production database password had been written into `RUNBOOK.md`.

**Hypothesis:** None — this required no hypothesis-forming, only direct confirmation and remediation, since the tool's denial message was itself precise and actionable.

**Investigation:** `grep -n -i "password\|jwt.secret\|root\b" k8s/max/RUNBOOK.md` — located the exact line (138) stating the live password in plaintext.

**Evidence:** Confirmed directly by reading the flagged line; further confirmed via `git log --all -p` that this value had never actually reached any previously-pushed commit — it existed only in the currently-blocked, not-yet-pushed local commit.

**Fix:** Rewrote the section to state only structural facts (which fields lack systemd overrides, where the real values live) rather than literal secret values; verified the fix via a follow-up `grep` showing no sensitive matches remained; re-attempted the push, which succeeded.

*(Full detail: Part 5, Error #4)*

---

### Journal Entry 7 — Three Client Domains Returning Unexpected 404s After k3s Install

**Problem:** Immediately after k3s installation (before nginx was stopped), `curl` against `nest.billbull.app`, `hilite.billbull.app`, and `albadar.billbull.app` all returned `404 Not Found` with an unusually generic 19-byte plaintext body.

**Hypothesis:** k3s's newly-installed Traefik might have already begun intercepting traffic for these domains, silently breaking nginx's existing routing for three still-live production clients.

**Investigation:** `curl` directly against `127.0.0.1:80` with an explicit `Host:` header (bypassing DNS entirely, isolating whether the issue was in DNS/routing infrastructure vs. nginx's own config); `sudo nginx -T` to inspect nginx's actual live configuration for the `nest.billbull.app` server block; `kubectl get pods -A` to confirm Traefik's own health.

**Evidence:** `nginx -T` revealed a *second*, separate `server_name nest.billbull.app { return 404; # managed by Certbot }` block already present in nginx's own configuration — a pre-existing certbot HTTP-01 challenge stub, unrelated to anything done in this migration. Traefik's pods were confirmed healthy and uninvolved.

**Fix:** None applied — explicitly identified as a pre-existing, unrelated nginx/certbot artifact, flagged to the user as worth investigating separately but not blocking this migration.

*(Full detail: Part 5, Error #5)*

---

### Journal Entry 8 — Traefik Appeared to Not Be Listening After nginx Was Stopped

**Problem:** After `systemctl stop nginx` (as part of the deliberate port-cutover decision), `sudo ss -tlnp | grep -E ':80|:443'` returned completely empty output — no process visible on either port.

**Hypothesis:** Traefik had failed to actually bind the now-freed ports, potentially leaving the server with no web server running at all.

**Investigation:** Checked Traefik and `svclb-traefik` pod health directly (`kubectl get pods`, both `Running`); checked the Traefik Service's full status via `kubectl describe svc`, showing a healthy `LoadBalancer Ingress` VIP; waited 5 seconds and re-checked `ss` (still empty); finally tried `curl -sI http://127.0.0.1:80` directly.

**Evidence:** The `curl` command returned a genuine HTTP response (`404 Not Found`, Traefik's own default page) — proving Traefik was in fact answering on port 80 the entire time. The `ss` blind spot was understood to be architectural: k3s's ServiceLB implements port exposure via iptables/nftables DNAT rules inside its own pod's network namespace, not a host-visible classic socket bind.

**Fix:** No fix needed — adopted `curl` as the correct verification method for this specific component going forward, rather than `ss`.

*(Full detail: Part 5, Error #6)*

---

### Journal Entry 9 — `sed` Command Reported Success But Changed Nothing

**Problem:** `sed -i "s/^listen_addresses = 'localhost'/listen_addresses = '*'/" postgresql.conf` followed by a `grep` check returned completely empty — the config value had not actually changed.

**Hypothesis:** The `sed` pattern's assumed format of the target line did not match the file's actual real content.

**Investigation:** `grep -n "listen_addresses" postgresql.conf` (without the earlier `^listen_addresses`-anchored pattern, so it would also surface a commented-out line).

**Evidence:** Line 60 of the real file read `#listen_addresses = 'localhost'` — commented out with a leading `#`, which the original `sed` pattern (anchored on `listen_addresses` with no `#`) could never have matched.

**Fix:** Rewrote the `sed` command to target the exact real line, by line number, matching the literal `#`-prefixed text: `sed -i "60s/^#listen_addresses = 'localhost'/listen_addresses = '*'/"`. Re-verified via `grep -n`, confirming the change took effect this time.

*(Full detail: Part 5, Error #7)*

---

### Journal Entry 10 — `billbull-max.service` Showing `failed` Immediately After a Postgres Restart

**Problem:** After restarting Postgres to apply the `listen_addresses` change, checking `systemctl status billbull-max` showed `Active: failed (Result: exit-code)`.

**Hypothesis:** The Postgres restart had just broken the still-live `billbull-max` systemd service.

**Investigation:** Compared the failure timestamp shown in the status output (`11:25:38`) against the time the Postgres restart command had actually just been run (`12:29:42`) — noticing these were over an hour apart, ruling out direct causation before investigating further. Pulled detailed journal context: `journalctl -u billbull-max --since "11:20" --until "11:30"`.

**Evidence:** The journal showed a clean, orderly `SIGTERM`-triggered shutdown sequence (`status=143` = `128+15`), including Tomcat's graceful shutdown completing, JPA's EntityManagerFactory closing cleanly, and HikariCP's connection pool shutting down cleanly — the signature of a deliberate `systemctl stop`, not a crash.

**Fix / resolution:** Asked the user directly whether they had stopped the service intentionally at that earlier time. User confirmed: yes, deliberately. No fix was needed — the "failed" status label was accurate systemd terminology for a unit stopped outside its expected `ExecStop=` procedure, not evidence of an actual problem.

*(Full detail: Part 5, Error #8)*

---

*(Continued in Part 9: Migration Checklist, in the Exact Order Followed)*
