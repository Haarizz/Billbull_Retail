# Caching Strategy — Implementation Roadmap

> **Status: APPROVED FOR EXECUTION.** Design is locked in [`10-caching-strategy.md`](10-caching-strategy.md) (replace the unbounded default `ConcurrentMapCacheManager` with **Caffeine** — TTL + max-size + stats; cache permissions/settings/lookups first with **precise, branch-aware keys and targeted eviction**; short-TTL/pre-aggregation for dashboards + inventory on-hand; Redis only if horizontally scaled). This document is the execution plan; it does **not** authorize coding ahead of the phase it describes.
>
> **This roadmap deliberately overlaps Topic 06 (Performance) Phases 3–5.** Where a team runs both, treat Topic 06's cache phases and this document as the **same work** — do not build the cache twice. This file is the caching-focused, self-contained view.
>
> **Golden rules for every phase below**
> - **Correctness > speed for settings/permissions** — precise eviction on change + conservative TTL; never serve stale RBAC.
> - **Branch (and future owner) in every scoped cache key** — a missing branch key is a cross-branch data leak, not a perf bug.
> - Each phase is **independently deployable and reversible** (disable per cache); the default cache manager remains the fallback until Caffeine is wired.
> - Fix the current **`allEntries=true` coarseness** on `productList` — targeted eviction, not full flush.
> - **Redis is deferred** until horizontal scaling is real; single-instance-per-tenant needs only Caffeine.

## Baseline verified against the codebase (2026-07-11)

| Design assumption | Verified? | Note |
|---|---|---|
| `@EnableCaching` + default `ConcurrentMapCacheManager`; only `@Cacheable("productList")` | ✅ (per design §1) | Unbounded, no TTL, `allEntries=true` evict. |
| No Caffeine/Redis dep in `pom.xml` | ✅ (per design §1) | Phase 1 adds Caffeine. |
| `productList` key = page+size+search+warehouseId (no branch) | ✅ (per design §1) | Add `branchId` to key (leak fix). |
| `GlAccountBalance` pre-agg + `GlBalanceRebuildJob` | ✅ (CLAUDE.md) | Pattern for dashboard/inventory pre-agg. |
| Single-instance-per-tenant deployment | ⚠️ business input | Determines Caffeine-only vs. Redis (§16.1). Assume single-instance. |
| Micrometer for hit-rate metrics | ⚠️ | Ties Topic 06 Phase 1 / Topic 03; add if absent. |

---

## Phase map

| # | Phase | Ships behaviour change? | Config-gated? | Complexity |
|---|---|---|---|---|
| 0 | Staleness tolerances + provider decision | No | n/a | S |
| 1 | Caffeine `CacheManager` + migrate `productList` (branch key + targeted evict) | Yes | Config | M |
| 2 | Cache permissions/RBAC + settings (precise eviction) | Yes | Config | M |
| 3 | Cache lookup/master data + customer reads | Yes | Config | S |
| 4 | Dashboard KPIs + inventory on-hand: short-TTL or pre-aggregation | Yes | Config | M |
| 5 | Cache metrics + tuning | No (observability) | Config | S |
| 6 | (Optional) Redis for horizontal scale | Yes | Config | M |

Complexity key: **S** ≤ ~1 day · **M** ~2–4 days · **L** ~1 week+.

---

## Phase 0 — Staleness tolerances + provider decision

**Objective.** Decide acceptable staleness per surface, provider (Caffeine vs. Redis), pre-agg vs. short-TTL for inventory, and whether to add HTTP caching. No code.

**Scope.** Written decisions.

**Files/modules affected.** None.

**Database/Backend/Frontend/API changes.** None.

**Risks.** Caching permission/settings too long → security/behaviour bugs. Mitigation: this phase sets conservative TTLs before any cache ships.

**Testing checklist.**
- [ ] Provider: Caffeine-only vs. Redis now (§16.1) — default Caffeine.
- [ ] Staleness tolerance per surface (settings/permissions/dashboard) (§16.2).
- [ ] Inventory on-hand: pre-aggregate vs. short-TTL (§16.3).
- [ ] HTTP caching (ETag/Cache-Control) for static lookups? (§16.4).
- [ ] Ownership in cache keys once Topic 02 lands (§16.5).

**Estimated complexity.** S. **Dependencies.** None.

**Exit criteria.** Signed decisions on §16.1–16.5; per-cache TTL/size table drafted from design §5.

---

## Phase 1 — Caffeine `CacheManager` + migrate `productList`

**Objective.** Replace the unbounded default with Caffeine (TTL + max-size + stats); fix `productList`'s key + eviction. (= Topic 06 Phase 3.)

**Scope.** Cache manager + `productList`.

**Files/modules affected.** `pom.xml` (Caffeine); `CacheManager` bean with per-cache TTL/size config; `ProductService` (`productList` key gains `branchId`; replace `allEntries=true` with targeted eviction); `cache.*` config keys.

**Database changes.** None.

**Backend changes.** Caffeine `CacheManager` (`expireAfterWrite`/`maximumSize`/`recordStats`, optional `refreshAfterWrite`). `productList` branch-keyed; product write evicts only affected key(s)/branch, not the whole cache.

**Frontend changes.** None. **API changes.** None.

**Risks.** Cross-branch leakage if branch omitted from key (mandatory, design §10). Mitigation: branch in key + a leak test.

**Testing checklist.**
- [ ] `productList` cached per branch; branch A ≠ branch B.
- [ ] Product write evicts targeted keys, not all entries.
- [ ] Cache bounded (max-size) + TTL expiry works.
- [ ] Hit rate visible (metrics).
- [ ] `mvn -o compile` + boot clean.

**Estimated complexity.** M. **Dependencies.** Phase 0.

**Exit criteria.** Caffeine live; `productList` branch-keyed + finely evicted; no leak; bounded.

---

## Phase 2 — Cache permissions/RBAC + settings (precise eviction)

**Objective.** Cache the highest-frequency, security-sensitive reads with immediate eviction on change. Correctness-critical.

**Scope.** Permissions/RBAC + branch/company settings.

**Files/modules affected.** `RolePermissionService`/`ModulePermissionService` reads; branch/company settings services; eviction on role/permission/settings change.

**Database changes.** None.

**Backend changes.** `@Cacheable` with conservative TTL (permissions 5–15m, settings 10–30m) + **immediate `@CacheEvict` on change** (branch-aware keys where scoped). TTL is only a safety net; eviction is the real mechanism.

**Frontend changes.** None. **API changes.** Transparent.

**Risks.** Stale RBAC/settings causing security bugs (design §3/§10). Mitigation: evict-on-change + short TTL; a test that a permission change is reflected immediately, not after TTL.

**Testing checklist.**
- [ ] Permission/role change → evicted immediately (not stale).
- [ ] Settings save → evicted.
- [ ] Branch-scoped caches keyed by branch (no leak).
- [ ] Hit rate improved for these surfaces.

**Estimated complexity.** M. **Dependencies.** Phase 1.

**Exit criteria.** Permissions/settings cached with immediate eviction; no stale-permission window; hit-rate gain.

---

## Phase 3 — Cache lookup/master data + customer reads

**Objective.** Cache low-volatility master data + customer-by-id.

**Scope.** Departments/brands/units/currencies/payment terms + customer read.

**Files/modules affected.** Lookup/master services; customer read-by-id service.

**Database changes.** None.

**Backend changes.** Longer TTL (30–60m) for master data, evict on master change; customer-by-id 5–10m, evict on update. Branch in key where scoped.

**Frontend changes.** None. **API changes.** Optional ETag/Cache-Control on stable lookups (§16.4).

**Risks.** Stale lookup after a master edit. Mitigation: evict on master change.

**Testing checklist.**
- [ ] Master data cached; evicted on change.
- [ ] Customer-by-id cached; evicted on update.
- [ ] No cross-branch leak on scoped lookups.

**Estimated complexity.** S. **Dependencies.** Phase 1.

**Exit criteria.** Master + customer reads cached with correct eviction.

---

## Phase 4 — Dashboard KPIs + inventory on-hand: short-TTL or pre-aggregation

**Objective.** Stop recomputing expensive aggregates every load. (= Topic 06 Phase 5, extended to inventory on-hand.)

**Scope.** Dashboard KPIs + inventory on-hand.

**Files/modules affected.** `dashboard/*` KPI services; inventory on-hand read paths; optional pre-agg table(s) + `@Scheduled` refresh (mirroring `GlAccountBalance`).

**Database changes.** Optional additive pre-aggregation table(s), guarded.

**Backend changes.** Per §0: short-TTL branch-keyed cache **or** pre-aggregation. Inventory on-hand: evict/refresh on stock movement (seconds–1m TTL) or pre-agg. Values within the agreed tolerance.

**Frontend changes.** Optional "as of" timestamp. **API changes.** None.

**Risks.** Stale dashboard/on-hand numbers misleading users. Mitigation: tolerance from Phase 0; short TTL; "as of" label; on-hand invalidation on stock movement if cached.

**Testing checklist.**
- [ ] KPI/on-hand computed once per TTL/refresh, not per request.
- [ ] Per-branch keyed.
- [ ] Values within agreed staleness tolerance.
- [ ] On-hand cache (if used) invalidated on stock movement.

**Estimated complexity.** M. **Dependencies.** Phase 1/2. (Inventory on-hand ties Topic 01 branch-scoped aggregates.)

**Exit criteria.** Dashboard + on-hand no longer recomputed each load; within tolerance; latency improved.

---

## Phase 5 — Cache metrics + tuning

**Objective.** Instrument hit rates; tune TTL/size from real data.

**Scope.** Micrometer cache metrics.

**Files/modules affected.** `CacheManager` (`recordStats`) → Micrometer; dashboards.

**Database changes.** None.

**Backend changes.** Expose per-cache hit/miss/eviction metrics (Micrometer — coordinate Topic 06 Phase 1); tune TTL/max-size from hit rates; drop caches with low hit / high volatility.

**Frontend/API changes.** None.

**Risks.** Caching low-hit data (wasted memory). Mitigation: metrics-driven tuning; remove poor caches.

**Testing checklist.**
- [ ] Per-cache hit/miss/eviction metrics visible.
- [ ] TTL/size tuned from observed hit rates.
- [ ] Low-value caches identified + removed.

**Estimated complexity.** S. **Dependencies.** Phases 1–4; Micrometer (Topic 06).

**Exit criteria.** Cache behaviour observable; TTL/size tuned to hit rates.

---

## Phase 6 — (Optional) Redis for horizontal scale

**Objective.** Only if a tenant becomes multi-instance — shared cache coherence across nodes.

**Scope.** `cache.provider=redis` path.

**Files/modules affected.** `CacheManager` provider switch; per-tenant Redis config + keyspacing.

**Database changes.** None (Redis).

**Backend changes.** Redis-backed (or two-tier Caffeine+Redis) with per-tenant keyspaces + pub/sub invalidation. Secure the Redis instance.

**Frontend/API changes.** None.

**Risks.** Per-tenant keyspace collisions; Redis outage. Mitigation: tenant-prefixed keys; graceful degradation to source-of-truth on outage; alerting.

**Testing checklist.**
- [ ] Cache coherent across 2 app instances.
- [ ] Tenant keyspaces isolated.
- [ ] Redis down → app still serves (degraded, from DB), alert fires.

**Estimated complexity.** M. **Dependencies.** Real multi-instance need.

**Exit criteria.** Shared cache verified across instances; outage degradation graceful. **Defer until horizontal scale is real.**

---

## Blocking decisions to resolve before the phase that needs them

| Open question (design §16) | Needed by | Recommended default |
|---|---|---|
| §16.1 Distributed cache now? | Phase 0/1/6 | Caffeine-only (single-instance) |
| §16.2 Staleness per surface | Phase 2/4 | settings 10–30m, permissions 5–15m+evict, dashboard 1–5m |
| §16.3 Pre-aggregate inventory on-hand vs. short-TTL | Phase 4 | Short-TTL first; pre-agg if latency demands (ties Topic 01) |
| §16.4 HTTP caching (ETag/Cache-Control) for static lookups | Phase 3 | Optional; server cache sufficient initially |
| §16.5 Ownership in cache keys (Topic 02) | Phase 1+ | Add ownerId to scoped keys once Topic 02 lands |

---

## Cross-cutting testing strategy

- **Branch-key leakage test** — a standing test that no branch-scoped cache returns another branch's data. The core cache-correctness guard (extends to ownership once Topic 02 lands).
- **Stale-permission test** — a permission/role/settings change is reflected immediately (evict), never after TTL. The core security guard.
- **Targeted-eviction test** — a product write evicts only the affected `productList` key(s), not all entries (fixes the current coarseness).
- **Bounded-memory test** — caches respect `maximumSize` (fixes the current unbounded map).
- **Staleness-tolerance test** — cached dashboard/on-hand values stay within the agreed tolerance of live.
- Run `mvn -o test` after each backend phase.
