# BillBull Kubernetes Migration — Complete Engineering Log

**Part 6 of N: Every Discussion — Full Reasoning and Architectural Decisions**

This section preserves the full reasoning behind every architectural decision made during this migration, not just the conclusions. Organized by topic, in the order each topic first arose.

---

## Why Kubernetes at all (vs. staying on systemd, or a lighter alternative)

**The full reasoning given, early in the conversation, before any implementation began:**

For a single-node, ~14-tenant Spring Boot + React application with an external Postgres database, Kubernetes was assessed as heavier than the problem strictly requires. The argument: what Kubernetes buys you — self-healing, declarative rolling deploys, horizontal scaling — mostly collapses to "restart on crash" when running on one node, and `systemd` with `Restart=on-failure` already provides that today, for free, with far less operational surface area (no cert-manager CRDs to learn, no Ingress controller quirks, no PVC storage-class gotchas).

A lighter middle-ground alternative was explicitly proposed: Docker Compose + Traefik/Caddy, which would get most of the "one command, reproducible deploy per client" benefit (via hostname-based routing and automatic TLS) without the full Kubernetes learning curve and its larger set of failure modes.

**The counter-consideration also given:** Kubernetes starts paying off for real once you have multiple nodes, need genuine autoscaling, or the team already has k8s expertise as a standard platform. None of those were confirmed to be true for BillBull at the time this was raised.

**How the decision was actually resolved:** Not by technical argument, but by the user's direct answer to a clarifying question — the trigger was that "pm asked for to setup the kubernetes for the project." This reframed the discussion: the migration was not being undertaken because a rigorous cost-benefit analysis favored k8s over the lighter alternative, but because it was an explicit organizational directive. This distinction was carried forward and revisited explicitly near the end of the migration (see "Was this a good decision" below), where the honest framing given was: the right call *given the stated goal* (the PM's directive plus a secondary, real goal of cleaner per-client deploy tooling), not an unconditionally superior architecture at BillBull's current scale.

---

## Why Docker (multi-stage builds specifically)

**The core problem multi-stage builds solve, as explained:** A full build toolchain (Maven, JDK compiler, the entire `~/.m2` dependency cache) is needed to *produce* a runnable artifact, but is not needed to *run* that artifact. If a single-stage Dockerfile were used, the final shipped image would carry all of that build tooling permanently — larger image size, larger attack surface, slower to pull/transfer, and exposing build-time capabilities (like a compiler) inside a production container unnecessarily.

**The mechanism:** two (or more) `FROM` lines in one Dockerfile, where a later stage can `COPY --from=<earlier-stage-name>` selectively pull just the specific output artifact (here, the compiled `.jar`) across, discarding everything else from the earlier stage. This was applied identically to both the backend (Maven+JDK build stage → JRE-only runtime stage) and the frontend (Node+npm build stage → nginx-only runtime stage).

**Why the instruction ordering inside a stage matters (layer caching reasoning):** Docker builds an image as a stack of cached layers, one per instruction; if a layer's inputs are unchanged from a previous build, Docker reuses the cached result rather than re-executing it. The backend Dockerfile deliberately does `COPY pom.xml .` and `RUN mvn dependency:go-offline` *before* `COPY src ./src` and the actual `mvn package` — because `pom.xml` (dependencies) changes far less frequently than `src/` (application code). If this order were reversed or combined, editing a single Java file would invalidate the dependency-download cache layer too, forcing a full re-download of the entire Maven dependency tree on every single code change. This reasoning was directly validated by observed real build output later in the migration, where cached layers completed in `0.0s` on rebuilds that only touched later instructions.

---

## Why `.dockerignore`

**Direct parallel drawn to `.gitignore`:** just as `.gitignore` tells `git` what to exclude from version control, `.dockerignore` tells `docker build` what to exclude from the *build context* — the set of files transferred to the Docker daemon before a build even starts. Without it, the frontend build was observed transferring ~370MB of `node_modules` into the build context on every single build (measured at 16.4 seconds for that step alone), even though `npm ci` followed by `COPY . .` inside the container immediately overwrites/reinstalls it anyway. This was purely a build-speed inefficiency, not a correctness bug — flagged and fixed as a minor cleanup after the frontend image had already built successfully once.

---

## Why the Playwright installation approach changed (full reasoning chain)

This is documented in exhaustive command-level detail in Part 5, Error #3. The architectural reasoning, independent of the specific commands, is:

**The general principle being applied:** running any class from a third-party dependency, outside of the context of your own application's full runtime, requires understanding exactly how that class becomes reachable on a Java classpath. There are only two valid shapes: (1) the target jar's own manifest declares a `Main-Class`, making `java -jar that.jar` self-sufficient, or (2) you assemble an explicit classpath containing the target class plus every class it depends on, and invoke via `java -cp`.

**Why the Spring Boot fat jar path was tried first and rejected:** because the application's own compiled artifact (`app.jar`) already has Playwright as a Maven dependency, it seemed natural to assume its classes would be reachable via `-cp app.jar`. This is incorrect because Spring Boot's packaging format nests dependencies inside `BOOT-INF/lib/*.jar` — a structure understood only by Spring Boot's own custom class loader (`JarLauncher`), not by the JVM's plain classpath mechanism.

**Why the "just use Playwright's own jar" path was tried second and rejected:** the instinct that a library's own jar should be independently runnable is reasonable but not guaranteed — it depends entirely on whether that specific jar's build process attached a `Main-Class` manifest entry, which Playwright's does not (it's designed as a library to be embedded in another application, with the CLI entry point being a secondary, less-central use case that assumes a full classpath is already assembled by the consuming build).

**Why the third approach (assembling a dependency-only classpath folder) is the architecturally correct one:** it directly follows from principle (2) above — Playwright's own documentation for running its CLI standalone (outside a full app) expects exactly this: gather the class plus its dependencies into one place, invoke with `-cp`. The remaining sub-error (the `-DincludeArtifactIds` vs `-DincludeGroupIds` Maven flag confusion) was a tooling-specific detail about how to correctly gather "the dependencies," not a flaw in the overall architectural approach.

---

## Why Kubernetes objects were introduced in the specific order they were (Namespace → ConfigMap/Secret/PVC → Deployment → Service → Ingress → ClusterIssuer)

**The reasoning given when teaching this, and followed in practice:** a Namespace must exist before anything else can be created inside it. A Deployment references a ConfigMap and Secret by name via `envFrom`, and a PersistentVolumeClaim by name via `volumes` — while Kubernetes does not *strictly* enforce that these must exist first (a Pod referencing a missing ConfigMap will simply get stuck in a `CreateContainerConfigError` state rather than the `kubectl apply` itself failing), creating them in dependency order avoids confusing, hard-to-diagnose failure states and was adopted as the working convention throughout. Similarly, a ClusterIssuer should exist before an Ingress that references it by name, or cert-manager has nothing to satisfy the certificate request against.

---

## Why `replicas: 1` and `strategy: Recreate` for the backend specifically

**Full reasoning chain, not just the conclusion:**

1. The `/uploads` directory needs to survive pod restarts (an uploaded product image must not vanish the next time the container recreates) — this requires a `PersistentVolumeClaim`.
2. The chosen storage class, `local-path` (k3s's built-in provisioner), only supports `ReadWriteOnce` access mode — meaning the underlying volume can only be mounted by one pod at a time, on one node.
3. Given constraint (2), running more than one replica of the backend simultaneously would mean a second pod attempting to mount an already-mounted `ReadWriteOnce` volume — which fails.
4. Therefore, `replicas: 1` is not a scaling choice made freely — it is **forced** by the storage architecture decision made earlier (accepting a local-disk PVC now, deferring object storage to later).
5. Given `replicas: 1` is fixed, the deployment *strategy* still matters for how updates are rolled out. Kubernetes' default (`RollingUpdate`) would, even with `replicas: 1`, briefly start a *new* pod before terminating the *old* one during an update (to avoid a gap in availability) — but this would momentarily require **two** pods to exist simultaneously, which conflicts directly with the `ReadWriteOnce` constraint from (2)/(3).
6. `strategy: Recreate` avoids this entirely: it fully terminates the old pod first, then starts the new one — guaranteeing only one pod ever exists at a time, matching what the storage layer requires.
7. A secondary, independent justification also given: `spring.jpa.hibernate.ddl-auto=update` means the application can alter database schema at startup. Running two different application versions against the same database simultaneously (even briefly, during a rolling update) is inherently riskier than a short, deliberate downtime window — reinforcing the choice of `Recreate` even setting aside the storage constraint.
8. Explicitly framed as **matching current behavior, not regressing it**: today's systemd deployment already only ever runs one instance per client and already incurs a brief downtime window on every `systemctl restart` — so `Recreate` strategy is not introducing new downtime risk relative to the status quo, it is faithfully reproducing the existing operational characteristic under new tooling.

---

## Why PVC (PersistentVolumeClaim) — and the honest tradeoff acknowledged

**Why storage is needed at all:** a container's own filesystem is ephemeral — anything written to it (an uploaded file) is lost the instant the container is recreated (crash, redeploy, or otherwise). A PVC is Kubernetes' abstraction for storage that outlives any individual pod's lifecycle.

**Why `local-path` specifically, rather than a more sophisticated storage backend:** it's k3s's built-in, zero-additional-setup storage provisioner — it just carves out a real directory on the node's own disk. This was judged the pragmatic choice for a single-node pilot, directly analogous to what today's systemd-based deployment already does (a local `uploads/` directory on the one server).

**The tradeoff made explicit, repeatedly, across the conversation:** this decision constrains every client backend to `replicas: 1` forever, on the specific node holding that PVC's data, unless and until file storage is migrated to something location-independent (object storage such as S3 or self-hosted MinIO). This was never framed as a permanent architectural end-state — it was explicitly scoped as "PVC now (Option A), object storage later (Option B)" from the very first planning document, chosen because Option A requires zero backend code changes and directly mirrors today's already-accepted single-instance-per-client operational model, whereas Option B (while architecturally superior — no replica constraint, no node-pinning) requires real code changes to `FileUploadUtil` and was judged unnecessary complexity to take on before the pilot itself was even proven to work.

---

## Why Postgres stayed outside the Kubernetes cluster entirely

**The direct reasoning given:** running a production database *inside* Kubernetes is technically possible (via `StatefulSet` objects, dedicated storage-replication tooling, k8s-native backup operators) but introduces substantial operational complexity that is not justified here, given that the existing, already-working Postgres installation on the host already has established backup processes and known-good behavior. The pattern applied — "stateful services stay external to the cluster, at least initially" — is described as a common, deliberate architectural choice, not a limitation being reluctantly accepted.

**What actually had to change as a result of this choice, and why each change was necessary:**
- `listen_addresses` needed to change from `localhost`-only to accept connections from other addresses, because a Kubernetes pod — despite running on the exact same physical machine — operates inside its own network namespace and connects via a real (internal, pod-network) IP address, never via `127.0.0.1`. Without this change, Postgres would refuse the connection at the TCP level before even reaching authentication.
- `pg_hba.conf` needed an explicit new rule, because opening the network port alone is not sufficient — Postgres separately enforces host-based access control (which client IP ranges may attempt to authenticate, for which database, as which user). This was scoped as narrowly as possible: only the k3s pod network CIDR, only for the one database (`billbull_max`), only for the one user (`postgres`) — explicitly not a blanket "accept connections from anywhere" change.

---

## Why Traefik (rather than installing a separate Ingress controller like nginx-ingress)

**The reasoning given:** Traefik ships as k3s's *built-in*, default Ingress controller — it requires no separate installation or configuration to get a working baseline. Since k3s was already the chosen Kubernetes distribution (see "why k3s" below), accepting its bundled default was the lower-friction choice, rather than disabling it and installing a different Ingress controller for no articulated benefit.

**The real, non-trivial consequence of this choice that had to be worked through:** Traefik, once k3s is installed, immediately attempts to bind the host's real ports 80 and 443 (via k3s's ServiceLB mechanism) — directly conflicting with nginx, which was already bound to those same ports serving three other live clients (`nest`, `hilite`, `albadar`) on the same server. This was not a hidden or discovered-late problem — it was anticipated *before* k3s was even installed (flagged explicitly in the original planning document as a known risk requiring a decision), and the original plan called for running Traefik on alternate ports during the pilot to avoid disrupting the other clients. At execution time, this plan was explicitly revisited and changed — see "Why the plan changed mid-execution" below.

---

## Why cert-manager (rather than continuing to use certbot manually)

**The direct problem being solved:** today's certificate management is entirely manual — `certbot` run by hand, per client, with renewal presumably relying on a cron job or manual repetition. This is exactly the kind of maintenance task that silently breaks (an expired certificate nobody notices until a client reports the site is down) and does not scale cleanly to a growing number of clients.

**How cert-manager addresses this, mechanically:** it runs as a small set of pods *inside* the cluster (observed directly: `cert-manager`, `cert-manager-cainjector`, `cert-manager-webhook`, all reaching `1/1 Running` within about 15 seconds of installation). It watches for `Ingress` objects carrying a specific annotation (`cert-manager.io/cluster-issuer: letsencrypt-prod`), and for each one, automatically requests a certificate from Let's Encrypt via the ACME protocol, proves domain ownership using the HTTP-01 challenge type (a temporary, automatically-served response at a well-known URL that Let's Encrypt's servers check), stores the resulting certificate in a Kubernetes `Secret` (here, `max-tls`), and automatically renews it ahead of expiry — all without further manual intervention once set up.

**Why this was judged a clear, low-risk win** (explicitly distinguished, later in the conversation, from other parts of the migration that were more of a genuine tradeoff): certificate automation has almost no downside and directly eliminates a known failure mode (silent expiry) that manual certbot management is exposed to.

---

## Why a ClusterIssuer object is separate from the Ingress

**The reasoning:** a ClusterIssuer expresses configuration that is meaningful *once per cluster* — which ACME server to use, which account email to register, which challenge type/Ingress class to use for domain validation. This information does not vary per client. Structuring it as a separate, cluster-scoped object (rather than duplicating this configuration inside every single client's Ingress) means every client's Ingress can simply reference the one ClusterIssuer by name, and the underlying ACME account/configuration only needs to be created and reasoned about a single time, regardless of how many clients are eventually migrated.

---

## Why a Service exists as a distinct object from a Deployment/Pod

**The core problem explained:** individual Pods are inherently ephemeral — when a Pod is recreated (crash recovery, a rollout, rescheduling), it typically receives a new internal IP address. Anything that needs to reliably reach "the backend for `max`" cannot hardcode a Pod's IP, because that IP is not stable across the Pod's lifecycle.

**How a Service solves this:** it provides one stable, unchanging name/address, and continuously discovers which Pod(s) currently match a given label selector (here, `app: max-backend`), routing traffic to whichever Pod(s) are currently valid — including load-balancing across multiple Pods if more than one exists (relevant for the frontend's `replicas: 2`, not the backend's `replicas: 1`).

**Why the Service's own `port` and the Pod's `targetPort` are deliberately different values (8080 vs. 8082) rather than kept identical:** this indirection means nothing else in the cluster (critically, the Ingress) ever needs to know or care what port the actual container process binds to internally. If that internal port needs to change in the future (as it, in fact, did during this exact migration, from an initially-wrong 8080 assumption to the correct 8082), only the Service definition needs updating — nothing that references the Service by its stable external port needs to change at all.

---

## Why Ingress, and why routing is expressed as it is (`/api` and `/uploads` to backend, `/` to frontend)

**Direct conceptual parallel drawn:** an Ingress object is described as the Kubernetes equivalent of an nginx `server { server_name ...; ... }` block — it is the mechanism for routing external, internet-facing traffic to the correct internal Service based on hostname and/or URL path.

**Why the specific path-based split (`/api/*` and `/uploads/*` to the backend Service; everything else, `/`, to the shared frontend Service) was chosen:** this mirrors exactly how the existing React frontend already communicates with the backend today — API calls are made against `/api/...` paths (per the codebase's `axiosConfig.js` convention, using either an explicit `VITE_API_BASE_URL` or the page's own origin), and uploaded file references are served from `/uploads/...`. Routing was designed to preserve this existing contract exactly, rather than requiring any frontend code changes to accommodate the new infrastructure.

**A caveat explicitly raised, not glossed over:** this path list was flagged as needing verification against the frontend's actual full set of backend-served paths (e.g., confirming there wasn't also a `/ws/**` WebSocket path or similar not accounted for) before treating the Ingress routing as definitively complete — the specific two paths chosen were a reasonable, evidence-based starting point, not asserted as exhaustively verified.

---

## Why the migration plan changed mid-execution (Traefik took ports directly, rather than using the planned alt-port workaround)

**The original plan, as written before touching the server:** run Traefik on alternate ports (e.g. 8443/8080) during the `max` pilot specifically so that nginx could continue serving `nest`, `hilite`, and `albadar` undisturbed while `max` was being tested — deferring the "hand real ports 80/443 to Traefik" cutover until all four clients on the server were ready to move together.

**Why this plan was reconsidered at the actual moment of execution:** upon discovering the live port-conflict risk in concrete terms (Traefik's Service already showing the host's real IP as its intended `EXTERNAL-IP`, meaning the conflict was not hypothetical but actively latent), the question was put directly to the user rather than silently proceeding with either option. The user's own reasoning, in their words, was that `nest`, `hilite`, and `albadar` "are not currently required" — i.e., an explicit, informed judgment that the original plan's goal of *simultaneously* keeping those three clients alive was not actually necessary for the pilot's purposes.

**Why this was treated as a legitimate plan change rather than a deviation to be resisted:** the original alt-port plan existed specifically to protect three services the user did not, in the moment, need protected. Once the user supplied that missing piece of context directly and explicitly authorized taking them offline, continuing to insist on the more complex alt-port workaround would have added engineering effort in service of a constraint that no longer actually applied. The decision was still handled carefully — a second, more explicit clarifying question was asked specifically because handing Traefik the real ports would immediately take three live services offline, to ensure this consequence was fully understood and deliberately chosen, not a side effect the user hadn't considered.

---

## Why the images were built and imported locally rather than pushed to a container registry

**The reasoning given when this was decided:** setting up a registry (e.g. GitHub Container Registry) requires additional authentication setup (a GitHub Personal Access Token with `write:packages` scope, `docker login` configuration) that was judged unnecessary friction for a first, single-server pilot. `k3s ctr images import` (loading a locally-built image directly into k3s's containerd image store) achieves the same practical outcome — a running pod using that image — without that setup overhead.

**The tradeoff explicitly acknowledged, not hidden:** this approach does not scale to multiple servers or multiple developers — every server that needs the image would need its own local build, and there is no shared, single source of truth for "what image is actually deployed." This was framed as an intentional, temporary pilot-scope decision, with the recommendation that a real registry become part of the plan once templating the deployment via Helm for the remaining clients (a later, not-yet-executed phase).

---

## Why `imagePullPolicy: Never` was added to the Deployment manifests

**Direct causal link to the registry decision above:** because no registry is being used for the pilot, and the image instead only exists locally (imported directly into this one node's containerd store), the default Kubernetes image-pull behavior (`IfNotPresent` or `Always`, depending on tag) would cause kubelet to attempt to *pull* the image from a registry — which does not exist for `billbull-backend:pilot`, causing a pull failure. `imagePullPolicy: Never` explicitly instructs kubelet to skip any pull attempt and use only what's already present locally on the node, which is a mandatory setting given the "build and import locally" approach, not an optional optimization.

---

## Was moving to Kubernetes actually a good decision? (final retrospective discussion)

**The question, asked directly by the user after the migration was complete:** "is it better or good decision to move from our old setup to this new?"

**The full, balanced answer given — deliberately not a simple endorsement:**

*Clear wins, argued as genuinely unambiguous:*
- Certificate management: automated renewal removes a real, demonstrated failure mode (silent expiry across many manually-managed clients) with essentially no downside.
- Onboarding a new client: today requires picking a free port, copying a systemd unit file, adding an nginx block, running certbot by hand; the k8s + (future) Helm path reduces this to copying one values file and running one command — and this benefit compounds with every additional client onboarded, which matters directly given BillBull already operates 12+ clients.
- Consistency across environments: the same built image is guaranteed identical everywhere it runs, directly contrasted against a real problem *discovered during this very migration* — the uncommitted, drifted `application.properties` edit found on 77.37.49.42 that had silently existed outside version control.
- Self-healing: acknowledged as *not* fully new (systemd's `Restart=always` already provides crash recovery on one machine today) but noted as extending uniformly and, in a future multi-node setup, adding automatic rescheduling that systemd cannot offer at all.

*Explicitly acknowledged as a wash or even a step down, not glossed over:*
- Real, demonstrated operational complexity increase: directly pointed back at the session's own troubleshooting record — the Playwright classpath bug, the silently-no-op `sed`, the Traefik port conflict, the `ss`-vs-`curl` diagnostic false alarm — none of which would have existed under the old systemd + nginx + certbot setup. This was framed honestly as complexity Kubernetes *introduces*, not complexity it removes, for a deployment at this current scale.
- No actual scaling or high-availability benefit has been realized *yet*: every client remains pinned to `replicas: 1` with `Recreate` strategy, due to the unresolved local-disk PVC constraint — meaning, as stated plainly, "you've mostly gained a more complex way to do what systemd already did," until and unless uploads move to object storage.

*The final framing given, explicitly avoiding blanket praise:* the decision was judged good specifically *relative to the stated goal* — the PM's directive plus the secondary, real goal of reducing per-client deployment toil at BillBull's current and growing client count — not as an unconditionally superior architecture in every dimension. It was explicitly noted that the migration should not be considered "done" or fully paying for itself yet, since only one of twelve-plus clients has actually been migrated, and the deferred benefits (Helm templating, a real registry, object storage for uploads) are what convert the current complexity cost into the intended long-term payoff.

---

*(Continued in Part 7: Architecture Evolution, With Diagrams)*
