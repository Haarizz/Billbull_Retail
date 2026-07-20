# BillBull Kubernetes Migration — Complete Engineering Log

**Part 3 of N: Every Command, Grouped by Topic**

Every command that was actually run or explicitly instructed during this migration, grouped by tool/topic. Failed and repeated attempts are included, not deduplicated, per the request.

---

## Git Commands

```bash
# Initial pull attempt that failed due to local uncommitted changes
git pull origin main

# Diagnosing the conflict
git diff billbull-backend/src/main/resources/application.properties
git diff --stat billbull-frontend/package-lock.json

# Reconciling: stash, pull, pop sequence
git stash
git pull origin main
git stash pop

# Diagnosing the merge conflict that resulted
git status
git log --oneline -5
git stash list
cat billbull-backend/src/main/resources/application.properties

# Resolving the conflict markers
sed -i '/^<<<<<<< Updated upstream$/,/^>>>>>>> Stashed changes$/d' billbull-backend/src/main/resources/application.properties
git add billbull-backend/src/main/resources/application.properties billbull-frontend/package-lock.json
git stash drop
git status

# Local (Windows) repo: committing the same base application.properties fix
git status --short billbull-backend/src/main/resources/application.properties
git add billbull-backend/src/main/resources/application.properties
git commit -m "Remove dev-only server.port and DB defaults from base application.properties

Every client profile (application-<client>.properties) already sets its
own server.port and spring.datasource.*, so the base file's dev fallback
values were never used in any real deployment and only risked being
mistaken for a live default. Matches the edit already running safely in
production on 77.37.49.42, previously uncommitted and re-conflicting on
every git pull.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"

# First push attempt from the user (self-initiated)
git add .
git commit -m "Build images directly on 77.37.49.42"
git push origin feature/bbpos
# → rejected: "! [rejected] feature/bbpos -> feature/bbpos (fetch first)"

# Diagnosing the rejection
git fetch origin feature/bbpos
git log --oneline origin/feature/bbpos -5
git log --oneline feature/bbpos -5
git diff --stat dc93c43 847fd91
git diff dc93c43 847fd91 -- billbull-backend/src/main/resources/application.properties

# Merging remote changes in
git pull origin feature/bbpos --no-edit

# Push attempt that was BLOCKED by the platform's data-exfiltration classifier
git push origin feature/bbpos
# → BLOCKED: "[Data Exfiltration] The push to the confirmed-public repo ... carries
#   k8s/max/RUNBOOK.md, which explicitly documents the live production database
#   password ("root") ..."

# Investigating the leak before remediating
grep -n -i "password\|jwt.secret\|root\b" k8s/max/RUNBOOK.md

# After redacting the file
git add k8s/max/RUNBOOK.md
git commit -m "Redact real DB/JWT credential values from RUNBOOK.md

Keep the structural facts (which fields have no systemd override, where
to source the real values) but never write the live DB password or JWT
secret directly into a doc destined for a public repo. Real values go
straight into the gitignored k8s/max/secret.yaml instead.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"

# Verifying the leaked value never reached any pushed commit
git log --all -p -- k8s/max/RUNBOOK.md | grep -B5 -i "'root'\|(\`root\`)" | head -40

# Push retry — succeeded
git push origin feature/bbpos
# → 847fd91..5886c56  feature/bbpos -> feature/bbpos

# Dockerfile fix commits
git status --short billbull-backend/Dockerfile
git diff billbull-backend/Dockerfile | head -60
git add billbull-backend/Dockerfile
git commit -m "Fix Playwright CLI invocation in backend Dockerfile

java -jar/-cp against the Spring Boot fat jar or the bare playwright jar
both failed: the fat jar nests its deps under BOOT-INF/lib (not visible
to -cp app.jar), and playwright-1.49.0.jar has no Main-Class manifest
entry (confirmed via unzip -p .../MANIFEST.MF on the target server).

Verified Playwright's actual dependency tree (mvn dependency:tree) is
exactly 3 jars: playwright, driver, driver-bundle — no jackson/gson.
Now resolve all 3 into a lib/ folder via copy-dependencies and invoke
the CLI class directly against that classpath, the supported shape for
running Playwright's CLI outside of a full Spring context.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
git push origin feature/bbpos
# → f307fcd..4c19262

# Second Dockerfile fix (the copy-dependencies filter bug)
git add billbull-backend/Dockerfile
git commit -m "Fix copy-dependencies filter to actually capture Playwright's transitive deps

-DincludeArtifactIds=playwright only copied the named artifact itself, not
its transitive driver/driver-bundle deps, despite looking like it should
(verified on-server: docker run against the build stage showed only
playwright-1.49.0.jar landed in playwright-lib/, causing a
NoClassDefFoundError for com.microsoft.playwright.impl.driver.Driver at
runtime). -DincludeGroupIds=com.microsoft.playwright resolves the whole
subtree by groupId instead, since all 3 jars share that groupId.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
git push origin feature/bbpos
# → 4c19262..3d91ba7

# .dockerignore commit
git add billbull-frontend/.dockerignore
git commit -m "Add .dockerignore to frontend to skip node_modules in build context

Without it, docker build was transferring ~370MB of node_modules into
the build context every time (16s wasted per build) even though npm ci
+ COPY . . overwrites it anyway inside the image.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
git push origin feature/bbpos
# → 3d91ba7..1b550fc

# Retrospective RUNBOOK.md rewrite commit
git add k8s/max/RUNBOOK.md
git status --short
git commit -m "Rewrite max RUNBOOK.md as a verified retrospective + template for next clients

max.billbull.app is live on k3s on 77.37.49.42 — login, existing data, PDF
generation, and image upload all confirmed working. Rewrote the runbook to
document what actually happened vs. the original plan (several assumptions
were wrong) so migrating nest/hilite/albadar next doesn't repeat the same
trial-and-error:

- Traefik took 80/443 directly (no alt-port workaround used in practice)
- pod CIDR is /24 not /16
- listen_addresses was commented out, not set — sed needs the exact line
- postgresql.service is a meta-unit on Debian/Ubuntu, always shows exited
- Playwright CLI classpath needed -DincludeGroupIds, not -DincludeArtifactIds
  (the latter silently drops transitive deps)
- uploads were skipped for max (none existed) but nest/hilite/albadar likely
  have real data commingled in one shared folder — needs per-client handling

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
git push origin feature/bbpos
# → 1b550fc..a9f64b9

# Server-side: on 77.37.49.42, aligning with the merged main branch
git init   # (note: server showed "Reinitialized existing Git repository" — pre-existing repo)
git pull origin main
```

---

## Docker Commands

```bash
# Verifying/installing Docker on the server
docker --version || (curl -fsSL https://get.docker.com | sh)

# Backend image build (failed first, on Chromium install step)
cd ~/Billbull/Billbull_Retail/billbull-backend
docker build -t billbull-backend:pilot .

# Debug technique used repeatedly: build just the intermediate stage and inspect it
docker build --target build -t debug-build-stage .
docker run --rm debug-build-stage ls -la /app/playwright-lib
# (repeated a second time with a new tag after the Dockerfile fix, before the filter was corrected)
docker build --target build -t debug-build-stage2 .
docker run --rm debug-build-stage2 ls -la /app/playwright-lib
# (repeated a third time, tag 3, after the -DincludeGroupIds fix — this one succeeded)
docker build --target build -t debug-build-stage3 .
docker run --rm debug-build-stage3 ls -la /app/playwright-lib

# Final successful backend build
docker build -t billbull-backend:pilot .

# Frontend image build
cd ~/Billbull/Billbull_Retail/billbull-frontend
docker build -t billbull-frontend:pilot .

# Importing both images into k3s's containerd (no registry used for the pilot)
docker save billbull-backend:pilot | sudo k3s ctr images import -
docker save billbull-frontend:pilot | sudo k3s ctr images import -
```

---

## Maven / Java Debugging Commands (run on the server, inside/around the Docker build)

```bash
# Locating the cached Playwright jar to inspect its manifest directly
find / -name "playwright-1.49.0.jar" 2>/dev/null

# Checking whether the jar is runnable standalone (it is not)
unzip -p /root/.m2/repository/com/microsoft/playwright/playwright/1.49.0/playwright-1.49.0.jar META-INF/MANIFEST.MF

# Building the full project classpath to check for hidden Playwright transitive deps
mvn -B org.apache.maven.plugins:maven-dependency-plugin:3.6.1:build-classpath \
    -Dmdep.outputFile=/tmp/full-classpath.txt
cat /tmp/full-classpath.txt | tr ':' '\n' | grep -i playwright
grep -o '[^:]*playwright[^:]*' /tmp/full-classpath.txt

# Getting Playwright's authoritative dependency tree
mvn -B org.apache.maven.plugins:maven-dependency-plugin:3.6.1:tree -Dincludes=com.microsoft.playwright
```

---

## Kubernetes / kubectl Commands

```bash
# Cluster setup verification
kubectl get nodes

# --- cert-manager ---
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/latest/download/cert-manager.yaml
kubectl get pods -n cert-manager --watch
kubectl apply -f k8s/max/cluster-issuer.yaml
# (first attempt failed due to wrong working directory + filename typo:
#   error: the path "k8s/max/cluster-issuer.yaml" does not exist)
kubectl get clusterissuer letsencrypt-prod

# --- namespace / config / storage ---
kubectl apply -f k8s/max/namespace.yaml
kubectl apply -f k8s/max/configmap.yaml
kubectl apply -f k8s/max/pvc.yaml
kubectl get pvc -n billbull

# --- secret ---
kubectl apply -f k8s/max/secret.yaml
kubectl get secret -n billbull max-backend-secret

# --- backend deployment ---
kubectl apply -f k8s/max/deployment.yaml
kubectl get pods -n billbull -l app=max-backend --watch
kubectl get pods -n billbull -l app=max-backend
kubectl logs -n billbull deploy/max-backend --tail=50
kubectl logs -n billbull deploy/max-backend --tail=200 | grep -iE "error|exception|failed|started application|flyway"

# --- frontend + ingress ---
kubectl apply -f k8s/max/frontend.yaml
kubectl apply -f k8s/max/ingress.yaml
kubectl get pods -n billbull -l app=billbull-frontend
kubectl get ingress -n billbull max-ingress
kubectl get certificate -n billbull max-tls

# --- Traefik/ServiceLB investigation ---
sudo kubectl get pods -A 2>&1 | head -20
sudo kubectl get svc -n kube-system traefik -o wide
sudo kubectl get pods -n kube-system -l app.kubernetes.io/name=traefik
sudo kubectl get pods -n kube-system -l svccontroller.k3s.cattle.io/svcname=traefik
sudo kubectl describe svc -n kube-system traefik | tail -20
sudo kubectl logs -n kube-system svclb-traefik-6204ef53-psctq -c lb-port-80 --tail=30
# → error: container lb-port-80 is not valid for pod ... out of: lb-tcp-80, lb-tcp-443
sudo kubectl logs -n kube-system svclb-traefik-6204ef53-psctq -c lb-port-443 --tail=30
# → error: container lb-port-443 is not valid for pod ... out of: lb-tcp-80, lb-tcp-443

# --- (proposed but not actually needed — day-2 ops reference) ---
kubectl rollout restart deployment/max-backend -n billbull
kubectl rollout status deployment/max-backend -n billbull
kubectl rollout restart deployment/billbull-frontend -n billbull
kubectl describe pod -n billbull <pod-name>
kubectl logs -n billbull deploy/max-backend -f
kubectl exec -it -n billbull deploy/max-backend -- /bin/sh
```

---

## k3s-Specific Commands

```bash
# Installation
curl -sfL https://get.k3s.io | sh -
sudo systemctl status k3s

# kubeconfig setup
mkdir -p ~/.kube
sudo cp /etc/rancher/k3s/k3s.yaml ~/.kube/config
sudo chown $(id -u):$(id -g) ~/.kube/config

# Image management (containerd, not the Docker daemon)
sudo k3s ctr images ls | grep billbull

# (proposed alt-port Traefik config — drafted in the original runbook plan,
#  ultimately NOT executed, since the decision was made to stop nginx outright instead)
sudo systemctl stop k3s
sudo mkdir -p /etc/rancher/k3s
cat <<'EOF' | sudo tee /etc/rancher/k3s/config.yaml
disable:
  - traefik
EOF
sudo systemctl start k3s
kubectl apply -f https://raw.githubusercontent.com/traefik/traefik-helm-chart/master/traefik/values.yaml 2>/dev/null || true
```

---

## nginx Commands

```bash
sudo systemctl status nginx
sudo nginx -T 2>/dev/null | grep -A5 "server_name.*nest"

# The hard cutover actually performed (user-authorized)
sudo systemctl stop nginx
sudo systemctl disable nginx
```

---

## systemd Commands

```bash
# Step 0 investigation
sudo systemctl cat billbull-max
systemctl show billbull-max -p WorkingDirectory

# billbull-max service investigation (the "was it broken?" false alarm)
sudo systemctl status billbull-max --no-pager
sudo journalctl -u billbull-max --since "11:20" --until "11:30" --no-pager

# Retiring the old service after successful k8s cutover
sudo systemctl stop billbull-max     # (had already been stopped earlier in the session)
sudo systemctl disable billbull-max
sudo systemctl status billbull-max --no-pager
```

---

## PostgreSQL Commands

```bash
# Initial discovery
sudo -u postgres psql -c "\l" 2>/dev/null | grep -i max
cat /etc/postgresql/*/main/postgresql.conf 2>/dev/null | grep -i listen_addresses

# Config file location + current listen_addresses value
sudo -u postgres psql -c "SHOW config_file;"
sudo -u postgres psql -c "SHOW listen_addresses;"

# First sed attempt (FAILED — matched zero lines silently)
sudo sed -i "s/^listen_addresses = 'localhost'/listen_addresses = '*'/" /etc/postgresql/16/main/postgresql.conf
grep "^listen_addresses" /etc/postgresql/16/main/postgresql.conf
# → (empty output, no error — the real line was commented out)

# Diagnosis
grep -n "listen_addresses" /etc/postgresql/16/main/postgresql.conf
# → 60:#listen_addresses = 'localhost'              # what IP address(es) to listen on;

# Corrected, line-anchored sed
sudo sed -i "60s/^#listen_addresses = 'localhost'/listen_addresses = '*'/" /etc/postgresql/16/main/postgresql.conf
grep -n "listen_addresses" /etc/postgresql/16/main/postgresql.conf
# → 60:listen_addresses = '*'               # what IP address(es) to listen on;

# pg_hba.conf rule addition
echo "host    billbull_max    postgres    10.42.0.0/24    md5" | sudo tee -a /etc/postgresql/16/main/pg_hba.conf
tail -5 /etc/postgresql/16/main/pg_hba.conf

# Restart and verification
sudo systemctl restart postgresql
sudo systemctl status postgresql --no-pager
# → active (exited) — the Debian/Ubuntu meta-unit trap
sudo systemctl status postgresql@16-main --no-pager
# → active (running) — the real daemon

sudo ss -tlnp | grep 5432
sudo -u postgres psql -c "SHOW listen_addresses;"
```

---

## Networking / Linux General Debugging Commands

```bash
# Interface / IP discovery
ip addr show | grep 'inet '

# Uploads folder discovery (across two legacy path families)
find / -maxdepth 6 -type d -iname uploads 2>/dev/null

# Port-conflict diagnosis
curl -sI http://nest.billbull.app 2>&1 | head -5
curl -sI http://hilite.billbull.app 2>&1 | head -5
curl -sI http://albadar.billbull.app 2>&1 | head -5
sudo ss -tlnp | grep -E ':80|:443'

# Testing with Host header directly (bypassing DNS) to isolate nginx vs. k8s
curl -sI -H "Host: nest.billbull.app" http://127.0.0.1:80
curl -sI http://127.0.0.1:80 -H "Host: doesnotexist.example.com"

# After stopping nginx — confirming Traefik really is serving, when `ss` said nothing was
curl -sI http://127.0.0.1:80

# Pod CIDR confirmation
sudo kubectl cluster-info dump 2>/dev/null | grep -m1 -o 'cluster-cidr=[^ "]*' || sudo cat /etc/rancher/k3s/k3s.yaml | grep -i cluster-cidr
cat /var/lib/rancher/k3s/server/manifests/*.yaml 2>/dev/null | grep -i cidr
ip route | grep 10.42
```

---

## PowerShell / Local (Windows) Repo Commands

```powershell
# (run by the user directly, not instructed)
git add .
git commit -m "Build images directly on 77.37.49.42"
git push origin feature/bbpos
```

---

## Local Bash Commands (run in this session, against the local Windows repo, not the remote server)

```bash
# Directory setup
mkdir -p "c:\Users\harik\Desktop\Billbull_Retail\docs\migration-log" 2>/dev/null

# Confirming .gitignore location before editing
test -f "c:\Users\harik\Desktop\Billbull_Retail\.gitignore" && echo exists || echo missing

# Various git status/diff checks against the local repo throughout
git status --short billbull-backend/src/main/resources/application.properties
git diff billbull-backend/Dockerfile | head -60
git status --short billbull-backend/Dockerfile
git diff --stat dc93c43 847fd91
git diff dc93c43 847fd91 -- billbull-backend/src/main/resources/application.properties
git log --oneline origin/feature/bbpos -5
git log --oneline feature/bbpos -5
git log --oneline -3
git log --oneline origin/feature/bbpos -3
git diff dc93c43 HEAD --stat
git log --all -p -- k8s/max/RUNBOOK.md | grep -B5 -i "'root'\|(\`root\`)" | head -40
grep -n -i "password\|jwt.secret\|root\b" k8s/max/RUNBOOK.md
grep -i "root|password|secret|billbull-super" k8s/max/RUNBOOK.md
```

---

*(Continued in Part 4: Every Configuration File, With Full Content and Rationale)*
