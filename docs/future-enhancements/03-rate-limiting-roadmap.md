# Rate Limiting — Implementation Roadmap

> **Status: APPROVED FOR EXECUTION.** Design is locked in [`03-rate-limiting.md`](03-rate-limiting.md) (Approach A — Bucket4j + Caffeine, Redis-ready; two layers: generic request limiter + auth brute-force). This document is the execution plan; it does **not** authorize coding ahead of the phase it describes.
>
> **Golden rules for every phase below**
> - Each phase is **independently deployable**; the global `ratelimit.enabled=false` kill-switch restores exactly today's behaviour.
> - **Enforcement is never turned on blind** — every enforced policy first runs in dry-run/monitor mode to tune limits from real traffic.
> - **Fail-open for general APIs, fail-closed for auth** on backend outage.
> - Brute-force keys on **username AND IP** — never IP alone (NAT lockout) — and a single success does **not** fully reset the username failure counter.
> - **Trust `X-Forwarded-For` only from configured proxies**; an untrusted XFF is ignored.

## Baseline verified against the codebase (2026-07-11)

| Design assumption | Verified? | Note |
|---|---|---|
| Only limiter today is `security/LoginRateLimiter` (in-memory, per-IP, login only) | ✅ (per design §1) | Confirm 10/60s + 300s lockout constants + `recordSuccess` bucket-clear in Phase 1. |
| No Bucket4j/Caffeine/Redis/Resilience4j dep | ✅ (per design §1, `pom.xml` checked) | Phase 0 adds Bucket4j + Caffeine. |
| Client IP resolved via XFF-first in `AuthController.resolveClientIp` | ✅ (per design §1) | Centralize into a shared trusted-proxy util (Phase 1). |
| `GlobalExceptionHandler` exists for uniform error envelope | ✅ (per CLAUDE.md `exception/`) | 429 body standardized here (Phase 2). |
| Micrometer/Actuator present? | ⚠️ unknown | Design §13 flags "verify present; add if needed" — confirm in Phase 0; overlaps Topic 06. |
| Deployment is single-instance-per-tenant | ⚠️ business input | Determines in-memory vs. Redis (Open Q §15.1). Assume single-instance until told otherwise. |

---

## Phase map

| # | Phase | Ships behaviour change? | Toggle-gated? | Complexity |
|---|---|---|---|---|
| 0 | Deps + config scaffolding (disabled) | No | n/a | S |
| 1 | Auth brute-force refactor (username+IP, eviction) | Yes (auth only) | Yes | M |
| 2 | Generic filter in monitor/dry-run mode | No (logs only) | Yes | M |
| 3 | Enforce `auth` + `public` policies | Yes | Yes | S |
| 4 | Enforce `write`/`read`/`report` (tuned) | Yes | Yes | M |
| 5 | Frontend graceful 429 + client throttling | Yes | Follows | S |
| 6 | Monitoring, metrics, alerting | No (observability) | n/a | S |
| 7 | (Optional) Redis backend for horizontal scale | Yes | Config | M |

Complexity key: **S** ≤ ~1 day · **M** ~2–4 days · **L** ~1 week+.

---

## Phase 0 — Deps + config scaffolding (disabled)

**Objective.** Add libraries + `ratelimit.*` config with everything **off**. No behaviour change.

**Scope.** `pom.xml` + `application.properties` + topology decision.

**Files/modules affected.** `billbull-backend/pom.xml`; base `application.properties`.

**Database changes.** None.

**Backend changes.** Add `bucket4j-core` + `bucket4j-caffeine` (or `caffeine`); optionally `bucket4j-redis`+Lettuce (unused yet). Add all `ratelimit.*` keys from design §5 with `ratelimit.enabled=false`. Confirm Actuator/Micrometer presence (coordinate with Topic 06).

**Frontend changes.** None. **API changes.** None.

**Risks.** Dependency bloat / version conflict with Spring Boot 3.5.9. Mitigation: pin compatible Bucket4j; `mvn -o compile` + boot smoke test.

**Testing checklist.**
- [ ] `mvn -o compile` + app boots with new deps, `ratelimit.enabled=false`.
- [ ] No filter registered / no behaviour change.
- [ ] Topology (single vs. multi-instance) and Actuator availability documented.

**Estimated complexity.** S. **Dependencies.** None.

**Exit criteria.** Deps resolve, app boots unchanged, config present and disabled, topology decision recorded.

---

## Phase 1 — Auth brute-force refactor (username + IP, eviction)

**Objective.** Replace/extend `LoginRateLimiter` with configurable **username + IP** tracking, TTL eviction, and no full-reset-on-success. Highest security value, lowest false-positive risk.

**Scope.** Auth limiter + shared client-IP util.

**Files/modules affected.**
- `security/LoginRateLimiter.java` → Layer-2 brute-force component (per-username failure tracking + per-IP; configurable; Caffeine-backed eviction).
- `AuthController.java` — keep calling it; broaden `recordFailure`/`recordSuccess` semantics; use shared IP util.
- New shared trusted-proxy client-IP util (centralizes `resolveClientIp`, respects `ratelimit.trusted-proxy-count`).
- Integrate with `security/AdminSafeguardService` recovery path.

**Database changes.** None (in-memory + eviction).

**Backend changes.** Track failed attempts per username and per IP independently; progressive lockout per username; a success from a different context does not clear the username counter. Gated by `ratelimit.enabled` (falls back to current behaviour when off).

**Frontend changes.** None yet (Phase 5).

**API changes.** Login still returns 429; now also considers username-failure lockout. Keep responses generic (no username enumeration).

**Risks.** Locking out the last admin. Mitigation: `AdminSafeguardService` recovery path; fail-closed for auth is acceptable but must allow admin recovery. NAT lockout mitigated by username keying.

**Testing checklist.**
- [ ] Unit: N failures/window per username → lockout; other usernames from same IP unaffected beyond IP cap.
- [ ] Unit: one success does not fully reset username failure counter.
- [ ] Unit: untrusted XFF ignored; trusted proxy hop honored.
- [ ] Stale buckets evicted (no unbounded growth).
- [ ] Toggle off → exactly current `LoginRateLimiter` behaviour.
- [ ] Last-admin recovery path intact.

**Estimated complexity.** M. **Dependencies.** Phase 0.

**Exit criteria.** Brute-force keyed on username+IP with eviction, validated on one tenant; toggle-off is byte-identical to today.

---

## Phase 2 — Generic filter in monitor/dry-run mode

**Objective.** Run `RateLimitFilter` counting what *would* be limited per policy, blocking **nothing**. Tune limits from real traffic.

**Scope.** Filter + policy resolver + service, all in dry-run.

**Files/modules affected.**
- New `RateLimitFilter` (`OncePerRequestFilter`, ordered around `JwtFilter`), `RateLimitPolicyResolver`, `RateLimitService` (Bucket4j/Caffeine, TTL eviction).
- `GlobalExceptionHandler` — standardized 429 body + headers (wired, not yet emitted in dry-run).

**Database changes.** None.

**Backend changes.** Classify request → policy (auth/public/read/write/report/admin); compute bucket key (`policy + userId|clientIp`); in dry-run, log + increment a "would-limit" metric instead of rejecting. Add informational rate-limit headers on responses.

**Frontend changes.** None. **API changes.** None (no 429s emitted yet).

**Risks.** Filter overhead on every request. Mitigation: precompiled path matchers, O(1) bucket check; measure latency delta.

**Testing checklist.**
- [ ] Policy resolver maps representative paths correctly (unit table test).
- [ ] Dry-run emits "would-limit" counts; blocks nothing.
- [ ] Latency overhead negligible under load test.
- [ ] Toggle off → filter is a no-op.

**Estimated complexity.** M. **Dependencies.** Phase 0 (deps); Phase 6 metrics ideally in place to observe (can run in parallel).

**Exit criteria.** Dry-run metrics collected on a pilot tenant for a representative window; per-policy limits tuned from real data.

---

## Phase 3 — Enforce `auth` + `public` policies

**Objective.** Turn on enforcement for the two highest-value, lowest-risk policy classes.

**Scope.** `auth-*` (with Layer-2 brute-force) + `public` (`/api/client-logs/**`, unauthenticated).

**Files/modules affected.** `RateLimitService`/filter config; `GlobalExceptionHandler` (emit 429 + `Retry-After`).

**Database changes.** None.

**Backend changes.** Enforce tuned limits for `auth` and `public`; return 429 with `Retry-After` + `X-RateLimit-*`. Fail-closed for auth on backend issues; exempt configured roles/service threads.

**Frontend changes.** None yet (Phase 5 handles UX).

**API changes.** `auth`/`public` endpoints may return 429 with headers.

**Risks.** Blocking legitimate `client-logs` flush bursts. Mitigation: dry-run-tuned `public` limit with burst; monitor false-positive rate post-enable.

**Testing checklist.**
- [ ] Over-limit login/public → 429 + `Retry-After`.
- [ ] Within-limit unaffected.
- [ ] Exempt roles bypass.
- [ ] Toggle off → no enforcement.
- [ ] `client-logs` normal flush not tripped (validate against real volume).

**Estimated complexity.** S. **Dependencies.** Phase 1, Phase 2.

**Exit criteria.** Auth + public enforced on a pilot tenant with acceptable false-positive rate; instant rollback via toggle proven.

---

## Phase 4 — Enforce `write`/`read`/`report` (tuned)

**Objective.** Enforce generous, burst-tolerant limits on the authenticated API classes without blocking real work (POS bursts, imports).

**Scope.** `read`/`write`/`report-export` policies (token-bucket burst; report concurrency cap).

**Files/modules affected.** Filter/service config; report/export concurrency guard.

**Database changes.** None.

**Backend changes.** Per-user token buckets with burst; `report-export` concurrency limit (protects Playwright/POI — ties to Topic 07). Idempotent retries (`X-Request-Id`) not double-counted punitively.

**Frontend changes.** Bulk-op client throttling (Phase 5).

**API changes.** Read/write/report endpoints may return 429 under sustained abuse.

**Risks.** POS rapid-scan / product-import false positives. Mitigation: token-bucket burst sized from Phase-2 dry-run; per-user keys post-auth; role exemptions for bulk/admin tools.

**Testing checklist.**
- [ ] POS burst (rapid scans) within burst allowance → not blocked.
- [ ] Sustained abuse beyond sustained rate → 429.
- [ ] Report concurrency cap enforced (N+1 concurrent heavy exports rejected/queued).
- [ ] Retried idempotent GET not punished.
- [ ] Toggle off → no enforcement.

**Estimated complexity.** M. **Dependencies.** Phase 2, Phase 3.

**Exit criteria.** Write/read/report enforced with tuned limits; POS/import false-positive rate ~0 in monitoring; rollback proven.

---

## Phase 5 — Frontend graceful 429 + client throttling

**Objective.** Handle 429 gracefully and prevent self-inflicted limit trips on bulk ops.

**Scope.** `api/axiosConfig.js` + login page + bulk-op UIs.

**Files/modules affected.** `src/api/axiosConfig.js`; login page; import/batch-barcode-print flows.

**Database/Backend changes.** None. **API changes.** None.

**Frontend changes.** Detect 429, read `Retry-After`, friendly toast + optional single auto-retry for idempotent GETs; login shows remaining wait; bulk ops batch/throttle client-side and show progress instead of firing hundreds of parallel calls.

**Risks.** Auto-retry storms. Mitigation: retry once, only idempotent GETs, respect `Retry-After`.

**Testing checklist.**
- [ ] `npm run build` + `npm run lint` green.
- [ ] 429 → friendly message with wait time; no crash.
- [ ] Bulk barcode print stays under `write` limit.
- [ ] Login lockout shows countdown.

**Estimated complexity.** S. **Dependencies.** Phase 3/4 (something emits 429).

**Exit criteria.** 429s surface gracefully; bulk ops no longer self-trip limits.

---

## Phase 6 — Monitoring, metrics, alerting

**Objective.** Make rate limiting observable — drives Phase-2 tuning and ongoing abuse detection.

**Scope.** Micrometer counters + audit + dashboards.

**Files/modules affected.** `RateLimitService` (metrics); `security/AuditLogService` (auth denials); `logging/RequestLoggingFilter`/`LogContext` (structured 429 logs).

**Database changes.** None.

**Backend changes.** Micrometer counters (`ratelimit.rejected{policy}`, `ratelimit.allowed{policy}`, `auth.lockout`); log every 429 with policy + hashed key + path; route auth denials to `AuditLogService` (respecting `rbac.audit.log-denied`). Add Actuator if missing (coordinate Topic 06).

**Frontend changes.** None. **API changes.** None.

**Risks.** Logging PII (raw IP/username). Mitigation: hash keys in logs/metrics.

**Testing checklist.**
- [ ] Counters increment on allow/reject.
- [ ] Auth 429 written to audit log.
- [ ] Keys hashed in logs.
- [ ] Actuator endpoints secured (not public).

**Estimated complexity.** S. **Dependencies.** Overlaps Topic 06; ideally before Phase 2 enforcement tuning.

**Exit criteria.** Per-policy dashboards live; alerts on rejection spikes + lockouts.

---

## Phase 7 — (Optional) Redis backend for horizontal scale

**Objective.** Only if a tenant becomes multi-instance — swap Bucket4j backend to Redis for global limits.

**Scope.** `ratelimit.backend=redis` path.

**Files/modules affected.** `RateLimitService` backend wiring; `bucket4j-redis`+Lettuce config; per-tenant Redis URL.

**Database changes.** None (Redis, not Postgres).

**Backend changes.** Same Bucket4j API, Redis-backed distributed buckets; per-tenant keyspacing. Fail-open (general) / fail-closed (auth) on Redis outage.

**Frontend/API changes.** None.

**Risks.** Redis outage behaviour; per-tenant keyspace collisions. Mitigation: documented fail-open/closed policy; tenant-prefixed keys; alerting on Redis health.

**Testing checklist.**
- [ ] Limits enforced globally across 2 app instances.
- [ ] Redis down → general APIs fail-open, auth fail-closed, alert fires.
- [ ] Tenant keyspaces isolated.

**Estimated complexity.** M. **Dependencies.** Real multi-instance need.

**Exit criteria.** Global limits verified across instances; outage behaviour matches policy. **Defer until horizontal scale is real.**

---

## Blocking decisions to resolve before the phase that needs them

| Open question (design §15) | Needed by | Recommended default |
|---|---|---|
| §15.1 Deployment topology (multi-instance now/planned?) | Phase 0 (backend choice), Phase 7 | Single-instance → Caffeine; Redis only when scaled |
| §15.2 Reverse proxy + trusted XFF hops | Phase 1 (IP util) | Confirm proxy; set `trusted-proxy-count` accordingly |
| §15.4 Fail-open vs. fail-closed per policy on outage | Phase 3/7 | Fail-open general APIs, fail-closed auth |
| §15.3 Limit values per policy | Phase 2 (tune) → 3/4 | Start conservative from design §4 table; finalize from dry-run |
| §15.6 Exempt roles/service accounts | Phase 3/4 | `ADMIN` + scheduler/job threads |
| §15.5 Lockout UX (progressive/CAPTCHA/hard) | Phase 1/5 | Progressive delay + generic message; CAPTCHA deferred |
| §15.8 Monitoring sink (Prometheus/Actuator/APM) | Phase 6 | Actuator + Micrometer (add if absent) |

---

## Cross-cutting testing strategy

- **Kill-switch invariance** — with `ratelimit.enabled=false`, behaviour is byte-identical to today (only `LoginRateLimiter`'s original semantics). Proven at every phase.
- **Dry-run-before-enforce** — no policy is enforced (Phases 3–4) until its Phase-2 dry-run data justifies the limit. This is the core false-positive guard.
- **False-positive watch** — POS burst + product-import + `client-logs` flush are the three legitimate-burst scenarios; each has a standing test and a monitored rejection metric.
- **Security tests** — username+IP brute-force, no-reset-on-success, untrusted-XFF-ignored, last-admin recovery, username-enumeration-safe responses.
- Run `mvn -o test` after each backend phase; `npm run build` + `npm run lint` after Phase 5.
