# BillBull Kubernetes Migration — Complete Engineering Log

**Part 5 of N: Every Error Encountered, in Full Detail**

Eight distinct errors/incidents occurred during this migration. Each is documented with its exact error message, root cause, the investigation steps taken, every failed attempt (not just the successful one), the final fix, and the generalizable lesson.

---

## Error #1 — Port Mismatch Between Manifests and the Real Spring Profile

**Exact symptom (not a crash — found via manual code inspection by the user):**
The Deployment/ConfigMap manifests were written with `containerPort: 8080` / `SERVER_PORT: "8080"`, but `billbull-backend/src/main/resources/application-client2.properties` (the profile activated for `max`) contained:
```properties
server.port=8082
```

**Root cause:** Spring Boot property-source layering. The base `application.properties` sets `server.port=8080` (a default), but `application-client2.properties` is loaded *on top of* the base file when `SPRING_PROFILES_ACTIVE=client2` is set, and its `server.port=8082` overrides the base value. The k8s manifests had been authored assuming the base file's port without checking the profile-specific override.

**Investigation steps:**
1. User had `application.properties` open in the IDE and separately checked `application-client2.properties`, noticing the discrepancy directly (not discovered by the assistant proactively).
2. Read `application-client2.properties` in full to confirm:
   ```properties
   server.port=8082
   spring.datasource.url=jdbc:postgresql://localhost:5432/billbull_max
   spring.datasource.username=postgres
   spring.datasource.password=root
   ```
3. Explained Spring's property precedence order: environment variables > `application-{profile}.properties` > `application.properties`.

**Failed attempts:** None — this was caught before any server-side execution, purely through manifest review.

**Successful fix:**
1. Removed `SERVER_PORT: "8080"` entirely from `k8s/max/configmap.yaml`, with a comment explaining why it must not be set there (would create a second, competing source of truth).
2. Changed `k8s/max/deployment.yaml`'s `containerPort` from `8080` to `8082`.
3. Changed both `readinessProbe.tcpSocket.port` and `livenessProbe.tcpSocket.port` from `8080` to `8082`.
4. Changed the Service's `targetPort` from `8080` to `8082` (the Service's own external `port: 8080` was deliberately left as-is — an arbitrary internal cluster-facing number unrelated to the container's real listening port).

**Lesson learned:** Never assume a config value (especially a port) from a base/default file — always check whether a more specific override (profile file, environment variable) exists and wins. This generalizes: in any layered-configuration system, always trace to the actual effective value, not the first value you find.

---

## Error #2 — Git Merge Conflict From Uncommitted Server-Side Edits

**Exact error message (first occurrence, on the server):**
```
error: Your local changes to the following files would be overwritten by merge:
        billbull-backend/src/main/resources/application.properties
        billbull-frontend/package-lock.json
Please commit your changes or stash them before you merge.
Aborting
```

**Root cause:** The 77.37.49.42 server had an uncommitted local edit to `application.properties` (removing `server.port=8080` and 3 dev-only DB default lines) that had never been committed to the repository, sitting silently on the server since some earlier point. When new commits were pulled from `origin/main`, git refused to overwrite the uncommitted local change.

**Investigation steps:**
1. Explicitly refused to run `git stash && git pull` blindly, per the safety principle of never discarding potentially-important uncommitted work without inspecting it first.
2. Asked the user how to proceed via `AskUserQuestion`; user chose "show me the diff first."
3. Ran `git diff billbull-backend/src/main/resources/application.properties` and `git diff --stat billbull-frontend/package-lock.json` on the server.
4. Diff showed the removal of `server.port=8080` and 3 DB default lines, plus an unrelated trailing-newline fix.
5. Verified (via `grep` across all 13 real client profile files) that every one of them already sets its own `server.port`/`spring.datasource.*`, confirming the base file's defaults were genuinely dead weight, safe to remove.
6. Asked the user how to resolve the conflict — options offered were "keep server's edit" or "take upstream as-is." User chose "Keep server's edit — strip port/DB defaults."

**Failed attempt (this produced a second, worse error):**
Ran the reconciliation sequence:
```bash
git stash
git pull origin main
git stash pop
```
This resulted in a **new, different error**:
```
billbull-backend/src/main/resources/application.properties: needs merge
error: Pulling is not possible because you have unmerged files.
```
Root cause of this secondary failure: the `git stash` command ran on top of an **already partially-conflicted** working tree from an earlier, previously-unresolved pull attempt — not something introduced by this migration's own commands, but pre-existing repository state that the stash operation inherited.

**Further investigation on the secondary error:**
```bash
git status
git log --oneline -5
git stash list
cat billbull-backend/src/main/resources/application.properties
```
The `cat` output revealed the actual conflict was extremely narrow — only a 3-line hunk differing by a single blank line:
```
<<<<<<< Updated upstream

=======
>>>>>>> Stashed changes
```
Confirmed via `git log`/`git status` that `git pull origin main` had, despite the later stash-pop conflict, actually already succeeded in updating `HEAD` to the latest commit — the conflict was purely from re-applying the stash on top of that already-current state.

**Successful fix:**
```bash
sed -i '/^<<<<<<< Updated upstream$/,/^>>>>>>> Stashed changes$/d' billbull-backend/src/main/resources/application.properties
git add billbull-backend/src/main/resources/application.properties billbull-frontend/package-lock.json
git stash drop
git status
```
This deleted the conflict marker lines (and the single blank line between them), staged both resolved files, and dropped the now-fully-applied stash. Confirmed clean via final `git status`.

**Separately, to make the fix permanent:** the identical edit was made in the local (Windows) repo checkout and committed properly (`dc93c43`), so this exact conflict would never recur on any future `git pull` to any server, once merged to `main`.

**Lesson learned:** Infrastructure work should never proceed on top of unexamined uncommitted state — always `git status`/`git diff` before any operation that could discard or conflict with local changes. Additionally: a `git stash` operation is not risk-free even when the working tree looks clean at a glance — pre-existing unresolved repository state can surface unexpectedly.

---

## Error #3 — Playwright CLI Classpath Failure (largest debugging effort in the migration)

### Attempt 1 — `java -cp app.jar`

**Exact error message:**
```
=> ERROR [stage-1 5/5] RUN java -cp app.jar com.microsoft.playwright.CLI install --with-deps chromium   0.4s
------
 > [stage-1 5/5] RUN java -cp app.jar com.microsoft.playwright.CLI install --with-deps chromium:
0.387 Error: Could not find or load main class com.microsoft.playwright.CLI
0.387 Caused by: java.lang.ClassNotFoundException: com.microsoft.playwright.CLI
------
Dockerfile:20
--------------------
  18 |
  19 |     ENV PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright
  20 | >>> RUN java -cp app.jar com.microsoft.playwright.CLI install --with-deps chromium
  21 |
  22 |     EXPOSE 8080
--------------------
ERROR: failed to build: failed to solve: process "/bin/sh -c java -cp app.jar com.microsoft.playwright.CLI install --with-deps chromium" did not complete successfully: exit code: 1
```

**Root cause:** A Spring Boot "fat jar" (built by `spring-boot-maven-plugin`) does not lay out its dependencies as plain files directly on a classpath. It nests them inside `BOOT-INF/lib/*.jar`, in a custom archive structure that only Spring Boot's own bootstrap `JarLauncher` knows how to unpack and load at runtime. A plain `java -cp app.jar <SomeClass>` invocation can only see `app.jar`'s own top-level class files — not anything zipped inside its nested jars, including Playwright's classes.

**Investigation:** Explained the fat-jar layout mechanism directly from known Spring Boot packaging behavior; no server-side command was needed to diagnose this first failure, since the error message plus known jar structure was sufficient.

**This attempt failed. Moved to attempt 2.**

### Attempt 2 — `java -jar playwright-1.49.0.jar` directly

**Approach:** Modified the Dockerfile to copy just the standalone Playwright jar (via `mvn dependency-plugin:copy -Dartifact=com.microsoft.playwright:playwright:1.49.0`) and invoke it with `java -jar`.

**Investigation before running the full build:** Before rebuilding (to save the ~4 minute Docker build cycle), asked the user to inspect the jar's manifest directly:
```bash
find / -name "playwright-1.49.0.jar" 2>/dev/null
unzip -p /root/.m2/repository/com/microsoft/playwright/playwright/1.49.0/playwright-1.49.0.jar META-INF/MANIFEST.MF
```
**Result:**
```
Manifest-Version: 1.0
Created-By: Maven JAR Plugin 3.4.2
Build-Jdk-Spec: 11
Implementation-Title: Playwright - Main Library
Implementation-Version: 1.49.0
```
**No `Main-Class` line present.** This confirmed, before wasting a rebuild, that `java -jar` on this jar alone could never work — a `-jar` invocation requires the target jar's own manifest to declare a `Main-Class`, and this one doesn't (it's a library jar, not a standalone-runnable one).

**This attempt failed before even being executed as a full build**, caught by manifest inspection first — though notably, an actual build WAS attempted with a related variant of this approach and did fail at runtime:
```
Exception in thread "main" java.lang.NoClassDefFoundError: com/microsoft/playwright/impl/driver/Driver
  at com.microsoft.playwright.CLI.main(CLI.java:32)
Caused by: java.lang.ClassNotFoundException: com.microsoft.playwright.impl.driver.Driver
```
(This specific `NoClassDefFoundError` actually surfaced later, during attempt 3's first sub-attempt — documented below — but confirms the same underlying issue: Playwright's CLI class needs its dependency jars present on the classpath, not just its own single jar.)

### Attempt 3, sub-attempt A — `copy-dependencies -DincludeArtifactIds=playwright`

**Approach:** Used Maven's `dependency-plugin:copy-dependencies` goal to assemble Playwright plus its dependencies into a folder, filtered by `-DincludeArtifactIds=playwright`, then ran `java -cp "playwright-lib/*" com.microsoft.playwright.CLI install --with-deps chromium`.

**Exact error message:**
```
Exception in thread "main" java.lang.NoClassDefFoundError: com/microsoft/playwright/impl/driver/Driver
  at com.microsoft.playwright.CLI.main(CLI.java:32)
Caused by: java.lang.ClassNotFoundException: com.microsoft.playwright.impl.driver.Driver
```

**Root cause:** `-DincludeArtifactIds=playwright` filters by the *named artifact itself* — it does not, despite appearing to, pull in that artifact's *transitive dependencies*. Playwright's own code depends on two additional jars (`driver` and `driver-bundle`) which were silently omitted.

**Investigation — verified precisely before attempting another (slow) full rebuild:**
```bash
docker build --target build -t debug-build-stage -t .
docker run --rm debug-build-stage ls -la /app/playwright-lib
```
**Result:**
```
total 612
-rw-r--r-- 1 root root 614401 Nov 21  2024 playwright-1.49.0.jar
```
Only **one** jar present, confirming the hypothesis directly — `driver-1.49.0.jar` and `driver-bundle-1.49.0.jar` were both missing.

**Cross-checked against Playwright's actual dependency tree, to know exactly what SHOULD be there:**
```bash
mvn -B org.apache.maven.plugins:maven-dependency-plugin:3.6.1:build-classpath -Dmdep.outputFile=/tmp/full-classpath.txt
cat /tmp/full-classpath.txt | tr ':' '\n' | grep -i playwright
```
Result:
```
/root/.m2/repository/com/microsoft/playwright/playwright/1.49.0/playwright-1.49.0.jar
/root/.m2/repository/com/microsoft/playwright/driver/1.49.0/driver-1.49.0.jar
/root/.m2/repository/com/microsoft/playwright/driver-bundle/1.49.0/driver-bundle-1.49.0.jar
```
Confirmed via a fully authoritative tree view as well:
```bash
mvn -B org.apache.maven.plugins:maven-dependency-plugin:3.6.1:tree -Dincludes=com.microsoft.playwright
```
Result:
```
[INFO] com.billbull:billbull-backend:jar:0.0.1-SNAPSHOT
[INFO] \- com.microsoft.playwright:playwright:jar:1.49.0:compile
[INFO]    +- com.microsoft.playwright:driver:jar:1.49.0:compile
[INFO]    \- com.microsoft.playwright:driver-bundle:jar:1.49.0:compile
```
Confirmed definitively: exactly 3 jars needed, no hidden jackson/gson dependency.

**This attempt failed. Moved to sub-attempt B.**

### Attempt 3, sub-attempt B — `copy-dependencies -DincludeGroupIds=com.microsoft.playwright` (successful)

**Approach:** Switched the filter from `-DincludeArtifactIds=playwright` (matches one named artifact only) to `-DincludeGroupIds=com.microsoft.playwright` (matches every artifact under that groupId across the whole resolved dependency tree, transitive included — and all 3 needed jars share this same groupId).

**Verification performed before the full (slow) rebuild, using the same debug-stage technique:**
```bash
docker build --target build -t debug-build-stage2 .
docker run --rm debug-build-stage2 ls -la /app/playwright-lib
```
**First check of this attempt (a caching false start):** initial result still showed only the one jar, because Docker's build cache had reused the *previous* (unfixed) layer — the edited Dockerfile hadn't actually been pushed/pulled onto the server yet at that point in the conversation. This was diagnosed by noticing the build step completed in `0.0s` (`CACHED`) and still showed the old `-DincludeArtifactIds=playwright` flag in its truncated log line — confirming the real file on the server hadn't changed. Fixed by committing and pushing the edit, then having the user `git pull origin main` on the server before rebuilding.

**Second check, after the real file was pulled:**
```bash
docker build --target build -t debug-build-stage3 .
docker run --rm debug-build-stage3 ls -la /app/playwright-lib
```
**Result:**
```
total 194400
-rw-r--r-- 1 root root      6863 Nov 21  2024 driver-1.49.0.jar
-rw-r--r-- 1 root root 198428414 Nov 21  2024 driver-bundle-1.49.0.jar
-rw-r--r-- 1 root root    614401 Nov 21  2024 playwright-1.49.0.jar
```
All 3 jars present. Confirmed correct.

**Successful fix — full build:**
```bash
docker build -t billbull-backend:pilot .
```
Result: succeeded in 120.8s total, with the Chromium install step (`[stage-1 6/6]`) completing cleanly in 41.5s, no error.

**Lesson learned (this is the single most reusable lesson from the entire migration):** "Run a class from a dependency jar outside its own application" always requires either (a) that specific jar's own manifest declaring a runnable `Main-Class`, or (b) manually assembling a complete classpath folder containing that class's actual dependencies and invoking with `-cp folder/*` rather than `-jar single-file.jar`. Additionally: **verify an intermediate build stage's actual contents directly** (`docker build --target <stage>` + `docker run --rm <tag> ls ...`) before re-running an entire slow build on a guess — this technique converted what would have been multiple ~2-4 minute rebuild cycles into ~15-second checks, and caught two separate wrong assumptions (the missing manifest, and the artifact-vs-group filter behavior) before they wasted a full rebuild.

---

## Error #4 — Real Credential Committed to a File Destined for a Public Repo (Security Event)

**Exact block message from the platform's safety layer (not a normal git/shell error — a permission denial):**
```
Permission for this action was denied by the Claude Code auto mode classifier. Reason:
[Data Exfiltration] The push to the confirmed-public repo Haarizz/Billbull_Retail
(feature/bbpos) carries k8s/max/RUNBOOK.md, which explicitly documents the live
production database password ("root") and confirms the live JWT secret for the max
client — real credentials in committed content heading to a public destination, with
no user consent naming that specific exposure.
```

**Root cause:** During an earlier documentation-writing step (adding "confirmed values for max" guidance to `RUNBOOK.md`), the literal live database password value had been written directly into the markdown file as part of an explanation, rather than kept purely structural/descriptive. This was a genuine authoring mistake.

**Investigation steps:**
```bash
grep -n -i "password\|jwt.secret\|root\b" k8s/max/RUNBOOK.md
```
Confirmed line 138 explicitly stated the live production DB password in plaintext, tied directly to the `max` client.

**Failed attempts:** None in the traditional sense — the push attempt itself was the "failure," correctly intercepted before it could complete, which is the desired behavior of this safety mechanism, not a bug to route around.

**Successful fix:**
1. Rewrote the relevant `RUNBOOK.md` section to state only structural facts ("the systemd unit has no password override, so the live value is whatever's in the properties file — verify it directly, don't paste it here") instead of the literal value.
2. Also generalized the JWT secret guidance similarly, even though that particular value was already technically public (the checked-in dev-fallback string) — the issue was framing it explicitly as "this is the real live production secret for max," which is itself operationally sensitive information worth not stating plainly.
3. Verified the fix was complete:
   ```bash
   git diff dc93c43 HEAD --stat
   grep -n -i "root|password|secret|billbull-super" k8s/max/RUNBOOK.md
   ```
   Confirmed only non-sensitive matches remained (the SSH username `root@77.37.49.42`, a filesystem path containing `/root/`).
4. Verified the leaked value had never actually reached the remote repository at any point:
   ```bash
   git log --all -p -- k8s/max/RUNBOOK.md | grep -B5 -i "'root'\|(\`root\`)" | head -40
   ```
5. Committed the redaction and pushed successfully — this push was **not** blocked, confirming the fix was sufficient.

**Lesson learned:** Documentation should explain **how to find** a secret, and never **contain** the secret's literal value — this applies even to internal runbooks not obviously intended for wide distribution, because any file in a git repository can end up in a public destination. This incident is treated as evidence the safety mechanism worked correctly, not as a failure to be minimized — it caught a real, undisputed leak before it reached a public destination.

---

## Error #5 — False Alarm: Domains Returning 404 (Traced to a Pre-Existing Certbot Artifact, Unrelated to k8s)

**Exact symptom:**
```bash
curl -sI http://nest.billbull.app 2>&1 | head -5
curl -sI http://hilite.billbull.app 2>&1 | head -5
curl -sI http://albadar.billbull.app 2>&1 | head -5
```
All three returned:
```
HTTP/1.1 404 Not Found
Content-Type: text/plain; charset=utf-8
X-Content-Type-Options: nosniff
Date: Thu, 16 Jul 2026 12:06:36 GMT
Content-Length: 19
```

**Initial hypothesis (raised, but proven wrong):** that k3s's newly-installed Traefik had somehow already intercepted these domains' traffic, breaking nginx's routing for the still-live clients.

**Investigation steps:**
```bash
curl -sI -H "Host: nest.billbull.app" http://127.0.0.1:80
sudo nginx -T 2>/dev/null | grep -A5 "server_name.*nest"
curl -sI http://127.0.0.1:80 -H "Host: doesnotexist.example.com"
sudo kubectl get pods -A 2>&1 | head -20
```
The `nginx -T` output revealed the actual cause:
```
    server_name nest.billbull.app;
    return 404; # managed by Certbot
```
A second, separate `server_name nest.billbull.app` block existed in nginx's own configuration — a leftover HTTP-01 challenge stub automatically inserted by certbot at some point in the past, unrelated to anything in this migration, and pre-dating any of today's work.

**Evidence this was NOT caused by k3s/Traefik:** the `kubectl get pods -A` check at this point showed Traefik's pod still `Running` normally with 0 restarts, and this exact 404 behavior was reproducible via a raw `curl` directly to `127.0.0.1:80` with an explicit `Host` header — a request path that never touches Kubernetes at all.

**Fix:** None applied — explicitly flagged to the user as a pre-existing, unrelated nginx/certbot configuration quirk worth investigating separately, not blocking or relevant to the migration itself.

**Lesson learned:** Before assuming a new piece of infrastructure caused an unexpected symptom, isolate the request path precisely (bypass DNS with a direct IP + `Host` header, check the exact serving process's own configuration) rather than assuming causation from mere timing coincidence.

---

## Error #6 — False Alarm: Traefik Appeared to Not Be Listening on 80/443

**Exact symptom:**
```bash
sudo systemctl stop nginx
sudo systemctl disable nginx
sudo ss -tlnp | grep -E ':80|:443'
```
Returned **no output at all** — no process appeared to be listening on either port.

**Initial concern:** that stopping nginx had left both ports completely unbound, with Traefik having failed to take over.

**Investigation steps:**
```bash
sudo kubectl get pods -n kube-system -l app.kubernetes.io/name=traefik
sudo kubectl get pods -n kube-system -l svccontroller.k3s.cattle.io/svcname=traefik
sudo kubectl describe svc -n kube-system traefik | tail -20
sleep 5
sudo ss -tlnp | grep -E ':80|:443'
```
Both the `traefik` pod and the `svclb-traefik` pod showed `Running`, 0 restarts. The Service's `describe` output showed a healthy `LoadBalancer Ingress: 77.37.49.42 (VIP)` with correct port/endpoint mappings. `ss` still showed nothing after the wait.

**Key diagnostic that resolved it:**
```bash
curl -sI http://127.0.0.1:80
```
This returned a real HTTP response: `HTTP/1.1 404 Not Found` — Traefik's own default 404 page (since no Ingress existed yet to route to), proving it genuinely was answering on port 80.

**Root cause of the `ss` blind spot:** k3s's ServiceLB (also called "klipper-lb") implements host-port exposure via iptables/nftables DNAT rules from inside its own pod's network namespace, rather than a classic host-level `bind()`+`listen()` socket call. `ss -tlnp`, which only enumerates host-level listening sockets, cannot see this kind of port forwarding — it is architecturally the wrong tool for checking whether this specific component is working.

**Fix:** No fix was needed — the system was working correctly the entire time; only the diagnostic method was wrong. Adopted `curl` against the actual port as the correct verification method going forward.

**Lesson learned:** When a "is it listening" check disagrees with an "is it actually answering" check, trust the one that tests real behavior. Different components implement network exposure via genuinely different underlying mechanisms (real sockets vs. iptables rules), and a single diagnostic tool is not guaranteed to see all of them.

---

## Error #7 — Silent `sed` No-Op on `postgresql.conf`

**Exact symptom:**
```bash
sudo sed -i "s/^listen_addresses = 'localhost'/listen_addresses = '*'/" /etc/postgresql/16/main/postgresql.conf
grep "^listen_addresses" /etc/postgresql/16/main/postgresql.conf
```
The `grep` command returned **completely empty output** — no error was raised by `sed` itself; the command exited successfully having silently changed nothing.

**Root cause:** The `sed` pattern was anchored on a line beginning exactly with `listen_addresses` (no leading `#`). The real line in the file was `#listen_addresses = 'localhost'` — commented out — so it began with `#`, not `listen_addresses`, and therefore never matched the pattern at all. `sed` does not warn when a substitution pattern matches zero lines; it simply reports success having done nothing.

**Investigation:**
```bash
grep -n "listen_addresses" /etc/postgresql/16/main/postgresql.conf
```
(Removing the `^` anchor from the earlier failed `grep` this time, so it would also match a commented line.) Result:
```
60:#listen_addresses = 'localhost'              # what IP address(es) to listen on;
```
This revealed the real line, including the leading `#` and a trailing inline comment.

**Failed attempt:** The first `sed` command above, which matched nothing.

**Successful fix — line-number-anchored, matching the exact real text including the `#`:**
```bash
sudo sed -i "60s/^#listen_addresses = 'localhost'/listen_addresses = '*'/" /etc/postgresql/16/main/postgresql.conf
grep -n "listen_addresses" /etc/postgresql/16/main/postgresql.conf
```
Result confirmed the fix:
```
60:listen_addresses = '*'               # what IP address(es) to listen on;
```

**Lesson learned:** Never write a `sed` substitution pattern based on assumed or remembered file format — always `grep -n` the exact real current text first (including checking whether a line is commented out) before writing the substitution command. `sed` succeeding with exit code 0 is not evidence that it changed anything.

---

## Error #8 — False Alarm: `billbull-max.service` Showing `failed` After a Postgres Restart

**Exact symptom:**
```bash
sudo systemctl restart postgresql
sudo systemctl status postgresql --no-pager
sudo systemctl status billbull-max --no-pager
```
The `billbull-max` status output showed:
```
× billbull-max.service - BillBull - Max
     Loaded: loaded (/etc/systemd/system/billbull-max.service; enabled; preset: enabled)
     Active: failed (Result: exit-code) since Thu 2026-07-16 11:25:38 UTC; 1h 4min ago
   Duration: 47min 49.790s
   Main PID: 186447 (code=exited, status=143)
```

**Initial concern:** that restarting Postgres had just broken the still-running `billbull-max` systemd service, which was expected to still be connecting via `localhost` at that point in the migration.

**Investigation steps:**
1. Noted the timestamp discrepancy immediately: the failure timestamp (`11:25:38`) was **over an hour before** the Postgres restart that had just been run (`12:29:42`) — meaning this could not have been caused by the restart, chronologically.
2. Requested detailed journal context around the exact failure time:
   ```bash
   sudo journalctl -u billbull-max --since "11:20" --until "11:30" --no-pager
   ```
3. The journal showed a clean, orderly shutdown sequence:
   ```
   Jul 16 11:25:37 srv1185005 systemd[1]: Stopping billbull-max.service - BillBull - Max...
   Jul 16 11:25:37 srv1185005 java[186447]: ... [SpringApplicationShutdownHook] ... GracefulShutdown - Commencing graceful shutdown...
   Jul 16 11:25:37 srv1185005 java[186447]: ... GracefulShutdown - Graceful shutdown complete
   Jul 16 11:25:38 srv1185005 java[186447]: ... Closing JPA EntityManagerFactory for persistence unit 'default'
   Jul 16 11:25:38 srv1185005 java[186447]: ... HikariDataSource - HikariPool-1 - Shutdown initiated...
   Jul 16 11:25:38 srv1185005 java[186447]: ... HikariDataSource - HikariPool-1 - Shutdown completed.
   Jul 16 11:25:38 srv1185005 systemd[1]: billbull-max.service: Main process exited, code=exited, status=143/n/a
   Jul 16 11:25:38 srv1185005 systemd[1]: billbull-max.service: Failed with result 'exit-code'.
   ```
   `status=143` decodes as `128 + 15`, where `15` is `SIGTERM` — the signal sent by a normal `systemctl stop`, not a crash signal. Tomcat's graceful shutdown, JPA's clean close, and HikariCP's clean pool shutdown all completing in sequence is the signature of an orderly stop, not a failure.

**Failed attempts:** None — the investigation converged directly on the correct explanation without any wrong turns, because the timestamp discrepancy was checked first before assuming causation.

**Resolution:** Asked the user directly via `AskUserQuestion` whether they had stopped the service intentionally. User confirmed: "Yes, I stopped it intentionally." This fully resolved the question — systemd correctly reports a unit as `failed` when it receives an explicit stop request outside of its own `ExecStop=` expectations for a bare `Restart=always` unit; this is expected, cosmetic labeling, not an actual problem requiring any fix.

**Lesson learned:** Always check timestamps precisely before assuming a causal relationship between two events that merely appear close together in a conversation's timeline. `systemctl status` showing `failed` does not always mean something crashed — it can simply reflect systemd's labeling convention for a unit that was deliberately stopped via `SIGTERM` outside of an expected stop procedure. When in doubt about whether an action was intentional, ask directly rather than assuming.

---

*(Continued in Part 6: Every Discussion — Full Reasoning and Architectural Decisions)*
