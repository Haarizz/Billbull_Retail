# Topic 3 — Rate Limiting Strategy

> **RESEARCH / DESIGN ONLY — not implemented. No code, config, or dependency in this document has been added.**

Goal: design a complete rate-limiting strategy covering login/auth, public and internal APIs, per-user and per-IP limits, burst protection, brute-force protection, recommended libraries/middleware, configuration, logging, monitoring, and error handling.

---

## 1. Current system behavior

- **Only one rate limiter exists:** `security/LoginRateLimiter` — an in-memory (`ConcurrentHashMap`), per-IP sliding-window limiter applied **only** to `POST /api/auth/login`.
  - Limits: `MAX_ATTEMPTS = 10` / `WINDOW_SECONDS = 60`, lockout `LOCKOUT_SECONDS = 300` (5 min).
  - Called in `AuthController.login` **before** credential validation; `recordSuccess(ip)` clears the bucket on success.
  - Client IP resolved via `X-Forwarded-For` (first hop) → `getRemoteAddr()`.
  - Returns HTTP 429 (`TOO_MANY_REQUESTS`) with a fixed message.
- **`security/LoginRateLimiter.recordSuccess` removes the bucket on success**, so a valid login resets the attacker's counter for that IP — a minor weakness (see §2).
- **No rate limiting on any other endpoint** — all other `/api/**` routes are unthrottled. No per-user limits, no burst control, no global limits.
- **Hard limits are constants**, not configurable via `application.properties` (unlike the many `rbac.*` toggles).
- **In-memory only** — state is per-JVM. In a multi-instance deployment behind a load balancer, limits are per-instance, not global. (Current deployments appear single-instance per tenant.)
- **No dedicated rate-limit logging/metrics**; 429s are not specifically audited via `security/AuditLogService`.
- **No Redis, Bucket4j, Resilience4j, or Caffeine** dependency present (`pom.xml` checked).

---

## 2. Challenges and edge cases

1. **Shared/NAT IPs.** Many retail users behind one office/router IP share an IP. Aggressive per-IP login limits can lock out an entire branch. Need per-**username** brute-force tracking in addition to per-IP.
2. **`X-Forwarded-For` spoofing.** The header is client-controllable; behind a trusted reverse proxy only the proxy-appended value is trustworthy. Must configure a trusted-proxy count / use the correct hop.
3. **Success resets the counter (current behavior).** An attacker can interleave a known-good credential to reset the IP bucket. Brute-force tracking should key on *failed* attempts per **username**, and not be fully cleared by one unrelated success.
4. **Multi-instance state.** In-memory limits diverge across JVMs. If horizontal scaling is ever used, a shared store (Redis) is required for global limits. Single-instance-per-tenant deployments can stay in-memory.
5. **Distinguishing endpoint classes.** Login/auth needs strict brute-force protection; heavy report/export endpoints need concurrency/cost limits; normal CRUD needs generous burst-tolerant limits; public endpoints (`/api/client-logs/**`, `permitAll`) need abuse protection since they're unauthenticated.
6. **Legit bursts.** Bulk operations (product import, barcode batch print, POS rapid scanning) legitimately fire many requests quickly. Limits must tolerate genuine bursts (token bucket) without blocking real work.
7. **Idempotency & retries.** The frontend attaches `X-Request-Id`; retried requests shouldn't be double-counted punitively.
8. **Fair error signaling.** 429 responses should include `Retry-After` and rate-limit headers so the client can back off gracefully.
9. **Admin/service exemptions.** Background jobs, schedulers, and admin bulk tools shouldn't trip user-facing limits.
10. **Memory growth.** The current `ConcurrentHashMap` never evicts stale buckets — unbounded growth under IP churn. A real solution needs eviction/TTL (Caffeine or Bucket4j-with-expiry).

---

## 3. Possible implementation approaches

### Approach A — Bucket4j + Caffeine (in-memory), Redis-backed when scaled — RECOMMENDED
- **Bucket4j** provides token-bucket algorithms (burst + sustained rate) with pluggable backends.
- Back it with **Caffeine** for local, TTL-evicting in-memory buckets (fixes the current unbounded-map issue) on single-instance deployments.
- Swap the Bucket4j backend to **Redis (via `bucket4j-redis`/Lettuce)** if/when multi-instance global limits are needed — same API, distributed state.
- Apply via a **servlet `OncePerRequestFilter`** (registered before/around `JwtFilter`) that classifies the request, picks a bucket key, and consumes a token.
- **Pros:** proper token-bucket burst handling, TTL eviction, single API for local→distributed, mature library. **Cons:** new dependency; filter ordering must be correct.

### Approach B — Spring Cloud Gateway / API gateway rate limiting
- Offload to an edge gateway (Spring Cloud Gateway `RequestRateLimiter` with Redis, or an nginx/Kong/Cloudflare layer in front).
- **Pros:** protects the app before requests hit it; centralized. **Cons:** the app is a single Spring Boot service (no gateway today); adds infra; per-user (post-auth) limits are harder at the edge since auth happens in-app.

### Approach C — Resilience4j `RateLimiter`
- Annotation/decorator-based limiting around specific methods.
- **Pros:** fine-grained per-method. **Cons:** method-level, not request/IP/user-key aware out of the box; awkward for per-IP/per-user keys; better suited to protecting downstream calls than inbound API throttling.

### Approach D — Extend the existing hand-rolled limiter
- Generalize `LoginRateLimiter` into a configurable, multi-bucket in-memory limiter with eviction.
- **Pros:** no new dependency; consistent with current code. **Cons:** reinventing token-bucket, eviction, and distribution correctly is error-prone; Bucket4j already solves this.

**Recommendation: Approach A (Bucket4j + Caffeine, Redis-ready).** Keep an **edge/nginx layer (Approach B)** as an optional outer defense for volumetric/DDoS traffic. Retain the specialized **brute-force logic for auth** (keyed on username + IP) as a distinct policy on top of the generic limiter.

---

## 4. Recommended architecture

**Two complementary layers:**

### Layer 1 — Generic request rate limiter (filter-based)
A `RateLimitFilter extends OncePerRequestFilter`, ordered **before `JwtFilter`** for IP-based limits and able to read the authenticated principal for per-user limits (so the auth check may split: coarse per-IP pre-auth, finer per-user post-auth — or run a second pass). It:
1. Classifies the request into a **policy** by path/class (auth, public, read, write, report/export, admin).
2. Computes a **bucket key**: `policy + (userId if authenticated else clientIp)`.
3. Consumes a token from the matching Bucket4j bucket (Caffeine-backed).
4. On success, adds informational headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`).
5. On exhaustion, returns **429** with `Retry-After`, logs, and increments a metric.

### Layer 2 — Brute-force / credential-stuffing protection (auth-specific)
Keeps the specialized policy for `POST /api/auth/login` (and `change-password`, any future OTP/reset endpoints):
- Track **failed** attempts per **username** and per **IP** independently.
- Progressive backoff / lockout on repeated failures per username (protects against distributed low-and-slow attacks across many IPs).
- Do **not** fully reset the username failure counter on a single success from a *different* context (mitigates the current reset weakness).
- Integrate with `security/AdminSafeguardService` so lockout can't permanently brick the last admin (allow admin recovery path).

### Policy classes (starting proposal)

| Policy | Scope key | Example limit (tune per tenant) | Notes |
|---|---|---|---|
| `auth-login` | IP **and** username | 10/min per IP; 5 failures/15min per username → lockout | Layer 2 brute-force |
| `auth-other` (change-pw, reset) | user + IP | 5/min | Sensitive |
| `public` (`/api/client-logs/**`) | IP | 60/min, burst 100 | Unauthenticated → abuse-prone |
| `read` (GET) | user | 300/min, burst 100 | Generous |
| `write` (POST/PUT/DELETE) | user | 120/min, burst 40 | Tolerates POS bursts |
| `report-export` (heavy) | user | 10/min, concurrency 2 | Cost-based |
| `admin/bulk` | user | exempt or high | Import/backfill tools |

All numbers **configurable via `application.properties`** (see §5), defaulting to conservative values, overridable per tenant profile.

---

## 5. Configuration (design — properties, no values committed now)

Follow the existing `rbac.*` toggle convention. Proposed keys:

```
ratelimit.enabled=true
ratelimit.backend=inmemory            # inmemory | redis
ratelimit.redis.url=                  # used when backend=redis

ratelimit.auth.login.ip.capacity=10
ratelimit.auth.login.ip.window-seconds=60
ratelimit.auth.login.user.max-failures=5
ratelimit.auth.login.user.window-seconds=900
ratelimit.auth.login.lockout-seconds=300

ratelimit.public.capacity=60
ratelimit.public.burst=100

ratelimit.read.capacity=300
ratelimit.write.capacity=120
ratelimit.report.capacity=10
ratelimit.report.max-concurrency=2

ratelimit.trusted-proxy-count=1       # how many XFF hops to trust
ratelimit.exempt-roles=ADMIN          # roles exempt from generic limits
```

Per-tenant overrides live in each `application-{client}.properties` (same mechanism as branch/RBAC config today). A global kill-switch `ratelimit.enabled=false` restores current behavior.

---

## 6. Backend changes

- **Add dependencies** (design note): `bucket4j-core`, `bucket4j-caffeine` (or `caffeine`), optionally `bucket4j-redis` + Lettuce for the distributed path.
- **`RateLimitFilter`** (`OncePerRequestFilter`) registered relative to `JwtFilter` (IP checks before auth; user checks after principal resolution — either two filters or one filter reading the security context late).
- **`RateLimitPolicyResolver`** — maps request path/method/principal → policy.
- **`RateLimitService`** — owns Bucket4j buckets keyed by `policy+key`, Caffeine-backed with TTL eviction; pluggable Redis backend.
- **Refactor `LoginRateLimiter`** into the Layer-2 brute-force component: add **per-username failure tracking**, configurable limits, eviction, and integration with the generic service. Keep `AuthController` calling it (minimal churn) but broaden `recordFailure`/`recordSuccess` semantics.
- **Trusted-proxy handling**: centralize client-IP resolution (currently duplicated in `AuthController.resolveClientIp`) into a shared util that respects `ratelimit.trusted-proxy-count`.
- **Error handling**: a consistent 429 response body (via `GlobalExceptionHandler`) with `Retry-After` and rate-limit headers.
- **Config toggle**: `ratelimit.enabled` — when false, filter is a no-op (preserves current behavior for safe rollout).
- **Exemptions**: skip generic limits for `ratelimit.exempt-roles` and internal scheduler/job threads.

---

## 7. Frontend changes

- **Graceful 429 handling** in `api/axiosConfig.js`: detect 429, read `Retry-After`, show a friendly "please slow down / try again in N seconds" toast, and optionally auto-retry once after the delay for idempotent GETs.
- **Login page**: already surfaces the lockout message; extend to show remaining wait time from `Retry-After`.
- **Bulk operations** (import, batch barcode print): throttle client-side request rate or batch requests to stay under `write`/`report` limits; show progress rather than firing hundreds of parallel calls.
- No change to normal flows when limits are set generously.

---

## 8. API changes

- **Backward compatible.** Endpoints unchanged; they may now return **429** with headers:
  - `Retry-After: <seconds>`
  - `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
- Standardize the 429 JSON body shape via `GlobalExceptionHandler` (matches existing error envelope).
- Document rate-limit policies in API docs so integrators can back off correctly.

---

## 9. Security considerations

- **Brute-force must key on username, not only IP** — defends against distributed attacks and avoids NAT lockout of whole branches.
- **Don't let a valid login fully reset failed-username counters** (current weakness).
- **Trust `X-Forwarded-For` only from known proxies** — otherwise attackers rotate the header to bypass per-IP limits. Configure trusted-proxy count; ignore untrusted XFF.
- **Protect unauthenticated `permitAll` endpoints** (`/api/client-logs/**`, `/uploads/**` static, `/tools/**`) — these are the easiest abuse targets and currently unthrottled.
- **Fail-open vs. fail-closed:** if the Redis backend is down, decide whether to allow (fail-open, availability) or block (fail-closed, security). Recommend **fail-open with alerting** for general APIs, **fail-closed for auth**.
- **Lockout recovery for admins**: ensure `AdminSafeguardService` semantics — a locked-out last admin must have a recovery path.
- **Log denied attempts** through `security/AuditLogService` (respecting `rbac.audit.log-denied`) for forensic trails, especially auth 429s.
- **Avoid leaking valid usernames** via differential lockout messages — keep responses generic.

---

## 10. Performance considerations

- Token-bucket check is O(1) in-memory — negligible latency.
- **Caffeine TTL eviction** fixes the current unbounded-map growth risk.
- Filter runs on **every request** — keep policy resolution cheap (precompiled path matchers, no per-request regex compilation).
- **Redis backend** adds a network round-trip per limited request; use it only when multi-instance global limits are actually required, and pipeline/async where possible.
- Report/export **concurrency limits** protect the DB and the Playwright/POI export machinery (heavy) from overload — arguably more valuable than raw rate limits for those endpoints.
- Order the filter to reject over-limit requests **early** (before JWT parsing and DB hits) for IP-based policies.

---

## 11. Migration / rollout strategy

1. **Phase 0 — dependency + config, disabled.** Add Bucket4j/Caffeine; add `ratelimit.*` config with `ratelimit.enabled=false`. No behavior change.
2. **Phase 1 — refactor auth brute-force.** Replace/extend `LoginRateLimiter` with username+IP tracking, eviction, configurable limits. Ship behind the toggle; validate on one tenant.
3. **Phase 2 — generic filter in "monitor" mode.** Run the `RateLimitFilter` in **log-only / dry-run** mode: count what *would* be limited, emit metrics, block nothing. Tune limits from real traffic.
4. **Phase 3 — enforce public + auth.** Turn on enforcement for `auth-*` and `public` policies first (highest security value, lowest false-positive risk).
5. **Phase 4 — enforce write/read/report** with tuned, generous limits; watch metrics for legit-burst false positives (POS, import).
6. **Phase 5 — Redis backend** only if/when horizontal scaling is introduced.
7. Kill-switch (`ratelimit.enabled=false`) available throughout for instant rollback.

---

## 12. Logging, monitoring & error handling

- **Logging**: log every 429 with policy, key (hashed IP/user), path, and count via SLF4J + `RequestLoggingFilter`/`LogContext` (which already carries userId/branch). Route auth denials to `AuditLogService`.
- **Metrics**: expose Micrometer counters (`ratelimit.rejected{policy}`, `ratelimit.allowed{policy}`, `auth.lockout`) for Prometheus/Actuator dashboards. Alert on spikes (possible attack) and on high false-positive rates (limits too tight).
- **Dry-run metrics** (Phase 2) drive limit tuning before enforcement.
- **Error handling**: uniform 429 via `GlobalExceptionHandler` with `Retry-After` + rate-limit headers; friendly client messaging; never expose internal bucket details.
- **Dashboards**: track top limited IPs/users, lockout counts, and per-policy rejection rates for ongoing tuning and abuse detection.

---

## 13. Risks and dependencies

- **Risk: false positives blocking real users** (NAT, POS bursts, imports). Mitigation: dry-run tuning phase, generous burst-tolerant token buckets, per-user keys post-auth, role exemptions.
- **Risk: XFF spoofing bypass.** Mitigation: trusted-proxy config; ignore untrusted headers.
- **Risk: multi-instance divergence.** Mitigation: Redis backend when scaled; document that in-memory limits are per-instance until then.
- **Risk: admin lockout.** Mitigation: `AdminSafeguardService` recovery path; fail-open policy consideration.
- **Risk: memory growth** (existing map). Mitigation: Caffeine TTL eviction.
- **Dependency: reverse-proxy topology** must be known to configure trusted hops correctly.
- **Dependency: Redis** only for the distributed path (optional).
- **Dependency: Micrometer/Actuator** for monitoring (verify present; add if needed).

---

## 14. Step-by-step implementation plan

1. Decide deployment topology (single-instance-per-tenant vs. scaled) → determines in-memory vs. Redis. (Open question §15.)
2. Add Bucket4j + Caffeine deps; add `ratelimit.*` config (default `enabled=false`).
3. Refactor `LoginRateLimiter` → configurable username+IP brute-force limiter with eviction; keep `AuthController` wiring.
4. Centralize trusted-proxy client-IP resolution into a shared util.
5. Build `RateLimitService` (Bucket4j/Caffeine) + `RateLimitPolicyResolver` + `RateLimitFilter`, ordered around `JwtFilter`.
6. Standardize 429 handling in `GlobalExceptionHandler` (Retry-After + headers).
7. Add Micrometer metrics + audit logging for denials.
8. Run filter in dry-run/monitor mode on a pilot tenant; collect metrics; tune limits.
9. Enforce `auth` + `public` policies; then `write`/`read`/`report`.
10. Frontend: graceful 429 handling in `axiosConfig`; client-side throttling for bulk ops.
11. (Optional) add Redis backend for horizontal scaling.
12. Document policies; set up dashboards/alerts.

---

## 15. Open questions / clarifications

1. **Deployment topology:** is any tenant multi-instance now or planned? (Determines Redis need.)
2. **Reverse proxy:** what sits in front (nginx? Cloudflare? none)? How many trusted XFF hops?
3. **Limit values:** desired defaults per policy — need product/ops input, ideally tuned from Phase-2 dry-run data.
4. **Fail-open vs. fail-closed** on backend outage — per policy class?
5. **Brute-force lockout UX:** progressive delay, CAPTCHA, or hard lockout? Any account-lock (vs. IP-lock) requirement?
6. **Exempt roles/service accounts:** which principals bypass generic limits?
7. **Public endpoints:** is `/api/client-logs/**` volume expected to be high (client log flushing)? Sets the `public` limit.
8. **Monitoring stack:** is Prometheus/Actuator available for Micrometer metrics, or is another sink preferred?
9. **Report/export concurrency:** acceptable max concurrent heavy exports per user/tenant given Playwright/POI cost?
