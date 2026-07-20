# Performance Optimization — Implementation Roadmap

> **Status: APPROVED FOR EXECUTION.** Design is locked in [`06-performance-optimization.md`](06-performance-optimization.md) (lead with measurement; attack the two highest-ROI hotspots — report pagination/streaming + a real Caffeine cache — then N+1/EntityGraph, search indexes, and frontend virtualization). This document is the execution plan; it does **not** authorize coding ahead of the phase it describes.
>
> **Golden rules for every phase below**
> - **Measure before tuning.** Phase 1 (monitoring) ships first; no speculative optimization lands without a baseline.
> - Each phase is **independently deployable and reversible**; caching/monitoring gated by config (`cache.*`, `management.*`).
> - **Branch (and future owner) must be in every scoped cache key** — a missing branch key leaks data across branches. This is a correctness requirement, not a perf nicety.
> - **Correctness > speed for settings/permissions** — conservative TTL + precise eviction; never serve stale RBAC.
> - Schema changes (indexes, pre-agg tables) are **additive, Flyway-guarded**.
> - Actuator endpoints must be **secured**, never publicly exposed.

## Baseline verified against the codebase (2026-07-11)

| Design assumption | Verified? | Note |
|---|---|---|
| `@EnableCaching` with default `ConcurrentMapCacheManager`; only `@Cacheable("productList")` | ✅ (per design §1) | No Caffeine/Redis dep; unbounded, no TTL, `allEntries=true` coarse evict. |
| Server-side pagination done for LPO + Payments; report pagination deferred | ✅ (memory `pagination_perf`) | Reports = the known remaining hotspot. |
| `GlAccountBalance` pre-agg table + `GlBalanceRebuildJob` | ✅ (CLAUDE.md) | The pattern to emulate for dashboard/inventory KPIs. |
| No Actuator/Micrometer confirmed | ⚠️ | Design §2 says "no monitoring"; confirm in Phase 0/1 (shared with Topic 03 §13). |
| `findActiveProductStockSummary(branchId)` already branch-parametrized | ✅ (repo read) | Example of DB-pushed scoping to extend. |
| JDBC batching + Hikari tuned | ✅ (CLAUDE.md) | No change needed. |

---

## Phase map

| # | Phase | Ships behaviour change? | Toggle/config-gated? | Complexity |
|---|---|---|---|---|
| 0 | Baseline capture plan + decisions | No | n/a | S |
| 1 | Monitoring: Actuator + Micrometer + slow-query logging | No (observability) | Config | S |
| 2 | Report pagination / streaming (top hotspot) | Yes | No | L |
| 3 | Caffeine cache manager + branch-aware keys + targeted eviction | Yes | Config | M |
| 4 | Cache settings/permissions/lookups/customer | Yes | Config | M |
| 5 | Dashboard KPIs: short-TTL cache or pre-aggregation | Yes | Config | M |
| 6 | N+1 audit + `@EntityGraph`/DTO projections | Yes | No | M |
| 7 | Search indexes (`pg_trgm`/composite) | Yes | No (additive) | M |
| 8 | Frontend virtualization / memoization / lazy routes / images | Yes | No | M |
| 9 | Warm Playwright pool + heavy-gen offload (→ Topic 07) | Yes | Config | M |

Complexity key: **S** ≤ ~1 day · **M** ~2–4 days · **L** ~1 week+.

---

## Phase 0 — Baseline capture plan + decisions

**Objective.** Decide staleness tolerances, cache provider (Caffeine vs. Redis), and monitoring sink. No code.

**Scope.** Written decisions + the metrics to baseline.

**Files/modules affected.** None.

**Database/Backend/Frontend/API changes.** None.

**Risks.** Optimizing the wrong thing without a baseline. Mitigation: this phase + Phase 1 establish evidence before Phases 2–9.

**Testing checklist.**
- [ ] Acceptable staleness per surface (settings/permissions/dashboard) decided (§15.2).
- [ ] Cache provider decision (Caffeine-only vs. Redis — §15.1) — default Caffeine (single-instance).
- [ ] Monitoring sink decided (Actuator/Prometheus vs. APM — §15.4).
- [ ] Largest report/list sizes in production captured (§15.5) to size streaming/virtualization.

**Estimated complexity.** S. **Dependencies.** None.

**Exit criteria.** Signed decisions on §15.1/§15.2/§15.4/§15.5; list of baseline metrics to capture in Phase 1.

---

## Phase 1 — Monitoring: Actuator + Micrometer + slow-query logging

**Objective.** Make hotspots visible. Ships first so every later phase is measured.

**Scope.** Actuator + Micrometer + Hibernate slow-query logging.

**Files/modules affected.** `pom.xml` (Actuator/Micrometer if absent — coordinate Topic 03); `application.properties` (`management.endpoints.*` secured; `spring.jpa.properties.hibernate.session.events.log.LOG_QUERIES_SLOWER_THAN_MS`).

**Database changes.** None.

**Backend changes.** Enable metrics + slow-query logging; secure Actuator (auth-gated, not public). Capture Phase-0 baseline metrics.

**Frontend changes.** None. **API changes.** None (Actuator endpoints internal).

**Risks.** Exposing Actuator publicly (info leak). Mitigation: secure endpoints; expose only what's needed.

**Testing checklist.**
- [ ] Actuator reachable only to authorized principals.
- [ ] Slow queries logged above threshold.
- [ ] Baseline metrics recorded (request latency, slow-query list, cache hit rate=0 today).
- [ ] `mvn -o compile` + boot clean.

**Estimated complexity.** S. **Dependencies.** Phase 0.

**Exit criteria.** Monitoring live + secured; production baseline captured to prioritize Phases 2–9.

---

## Phase 2 — Report pagination / streaming (top hotspot)

**Objective.** Stop loading full report row payloads; push filters + pagination into DB queries; stream large Excel/PDF.

**Scope.** Report services + export.

**Files/modules affected.** `inventory/reports/*` and other report services loading full payloads; Excel (POI) / PDF (Playwright) export paths; report DTOs.

**Database changes.** Possibly supporting composite indexes for report filter+sort combos (additive, guarded).

**Backend changes.** DB-pushed filters + pagination on report queries; stream large exports (chunked POI / paged PDF) rather than materializing everything (ties to Topic 07 for background offload of the largest). Preserve existing report outputs (same numbers, same shape).

**Frontend changes.** Report screens consume paged/streamed endpoints (verify existing report UIs; Sales reports already use a VM registry per `sales_reports_pipeline`).

**API changes.** Report endpoints gain pagination/streaming params (backward compatible).

**Risks.** OOM on very large reports if still materialized; output drift. Mitigation: stream/paginate; a byte-diff test that paged output equals pre-change output for a fixed dataset.

**Testing checklist.**
- [ ] Large report no longer materializes full payload (memory bounded).
- [ ] Paged output identical to pre-change for a control dataset.
- [ ] Export of a large report streams without OOM.
- [ ] Latency improved vs. Phase-1 baseline.

**Estimated complexity.** L. **Dependencies.** Phase 1 (measure).

**Exit criteria.** Top-hotspot reports paginated/streamed; memory + latency improved vs. baseline; output unchanged.

---

## Phase 3 — Caffeine cache manager + branch-aware keys + targeted eviction

**Objective.** Replace the unbounded default cache with Caffeine (TTL + max-size + stats); fix `productList` key + eviction.

**Scope.** Cache manager + `productList` migration.

**Files/modules affected.** `pom.xml` (Caffeine); a `CacheManager` bean with per-cache TTL/size config; `ProductService` (`productList` key gains `branchId`; replace `allEntries=true` with targeted eviction).

**Database changes.** None.

**Backend changes.** Caffeine `CacheManager` (TTL, `maximumSize`, `recordStats`, optional `refreshAfterWrite`). Move `productList` onto it with a **branch-aware key**; evict by affected branch/key on write, not full flush.

**Frontend changes.** None. **API changes.** None.

**Risks.** Cross-branch cache leakage if branch omitted from key (design §9 — mandatory). Mitigation: branch in key + a test proving branch A never sees branch B's cached list.

**Testing checklist.**
- [ ] `productList` cached per branch; branch A ≠ branch B results.
- [ ] Product write evicts only affected key(s), not all entries.
- [ ] Cache bounded (max-size) + TTL expiry works.
- [ ] Hit rate visible via Micrometer.

**Estimated complexity.** M. **Dependencies.** Phase 1.

**Exit criteria.** Caffeine in place; `productList` branch-keyed + finely evicted; no cross-branch leak; hit rate observable.

---

## Phase 4 — Cache settings/permissions/lookups/customer

**Objective.** Cache the highest-frequency, low-volatility reads (hit on nearly every request) with precise eviction.

**Scope.** Settings/permissions/lookup/customer services.

**Files/modules affected.** Branch/company settings services, `RolePermissionService`/`ModulePermissionService` reads, lookup/master services (departments/brands/units/currencies/payment terms), customer read-by-id.

**Database changes.** None.

**Backend changes.** `@Cacheable`/`@CacheEvict`/`@CachePut` with **branch-aware keys** where scoped; conservative TTL for settings/permissions + **immediate evict** on role/permission/settings change. Lookup data longer TTL, evict on master change.

**Frontend changes.** None. **API changes.** Transparent (optional ETag/Cache-Control on stable lookups).

**Risks.** Stale RBAC/settings causing security/behaviour bugs (design §3/§13). Mitigation: precise eviction on change + short TTL safety net; a test that a permission change is reflected immediately (evict), not after TTL.

**Testing checklist.**
- [ ] Permission/role change → evicted immediately (not stale).
- [ ] Settings save → evicted.
- [ ] Branch-scoped caches keyed by branch (no leak).
- [ ] Lookup data cached + evicted on master change.
- [ ] Hit rate improved for these surfaces.

**Estimated complexity.** M. **Dependencies.** Phase 3.

**Exit criteria.** Hot low-volatility reads cached with correct, immediate eviction; no stale-permission window; measurable hit-rate gain.

---

## Phase 5 — Dashboard KPIs: short-TTL cache or pre-aggregation

**Objective.** Stop recomputing dashboard aggregates every load.

**Scope.** Dashboard KPI services.

**Files/modules affected.** `dashboard/*` aggregate services; optional pre-agg table + `@Scheduled` refresh (mirroring `GlAccountBalance`/`GlBalanceRebuildJob`).

**Database changes.** Optional additive pre-aggregation table(s) for KPIs, guarded.

**Backend changes.** Short-TTL branch-keyed cache for KPIs, **or** pre-aggregate on a schedule per the chosen staleness tolerance (§15.2). Preserve exact KPI values within tolerance.

**Frontend changes.** None (optionally label as "as of" timestamp). **API changes.** None.

**Risks.** Users seeing stale dashboard numbers. Mitigation: tolerance from Phase 0; short TTL; optional "as of" indicator.

**Testing checklist.**
- [ ] KPI computed once per TTL/refresh, not per request.
- [ ] Per-branch KPIs keyed by branch.
- [ ] Values within agreed staleness tolerance of live.

**Estimated complexity.** M. **Dependencies.** Phase 3/4.

**Exit criteria.** Dashboard load no longer recomputes aggregates each time; values within tolerance; latency improved.

---

## Phase 6 — N+1 audit + `@EntityGraph`/DTO projections

**Objective.** Kill N+1 on association-heavy list serializations; use lean DTOs for list views.

**Scope.** List endpoints serializing associations (invoices→lines→product, product→pricing/inventory/tax).

**Files/modules affected.** Association-heavy list services/repositories; add `@EntityGraph`/fetch joins or DTO projections.

**Database changes.** None.

**Backend changes.** With Phase-1 slow-query logging on, identify N+1 hotspots; convert list views to projections/DTOs or `@EntityGraph` fetch joins; keep full-entity loads for detail views.

**Frontend changes.** None (leaner payloads). **API changes.** List endpoints return lean DTOs (backward compatible fields).

**Risks.** Over-fetching via fetch joins (cartesian blow-up). Mitigation: prefer projections for lists; verify query counts drop via monitoring.

**Testing checklist.**
- [ ] Query count per list request drops (measured) — no N+1.
- [ ] List payloads unchanged in the fields the frontend uses.
- [ ] Detail views still load full graph correctly.

**Estimated complexity.** M. **Dependencies.** Phase 1 (to find them).

**Exit criteria.** Identified N+1 hotspots eliminated (query-count-verified); list latency improved.

---

## Phase 7 — Search indexes (`pg_trgm`/composite)

**Objective.** Turn `ILIKE '%x%'` seq scans into index scans; add composite indexes for search+sort combos. (Coordinates with Topic 08 — this phase is the index subset.)

**Scope.** Trigram + composite B-tree indexes.

**Files/modules affected.** Flyway migration enabling `pg_trgm` + GIN trigram indexes on hot text columns; composite B-trees for common search+sort.

**Database changes.** `CREATE EXTENSION IF NOT EXISTS pg_trgm` (per tenant); GIN trigram on `products.name/code`, `customers.name`, invoice numbers; composites — all additive, guarded.

**Backend changes.** None required for the index alone; search repo methods to exploit them are Topic 08's scope.

**Frontend/API changes.** None.

**Risks.** GIN index write cost on bulk product import. Mitigation: import is async (Topic 07); measure write overhead.

**Testing checklist.**
- [ ] `EXPLAIN` shows index scan (not seq scan) for `%term%` on indexed columns.
- [ ] Bulk import write overhead acceptable (measured).
- [ ] Migration idempotent.

**Estimated complexity.** M. **Dependencies.** Phase 1; overlaps Topic 08.

**Exit criteria.** Hot text searches index-backed (`EXPLAIN`-verified); import overhead acceptable.

---

## Phase 8 — Frontend virtualization / memoization / lazy routes / images

**Objective.** Reduce render jank on long lists/heavy pages; shrink bundles; lazy-load images.

**Scope.** Long lists + heavy pages + images.

**Files/modules affected.** Long-list/table pages (audit, ledgers, POS product grid); heavy route bundles (Financials, Reports, POS); image rendering.

**Database/Backend/API changes.** None.

**Frontend changes.** Add virtualization (`react-window`/`@tanstack/react-virtual`) for very long lists; `React.memo`/`useMemo`/`useCallback` on hot components; route-level lazy `import()` beyond current `manualChunks`; `loading="lazy"` + responsive/resized images (WebP where feasible).

**Risks.** Virtualization breaking existing table behaviours (sticky headers, selection). Mitigation: incremental per-list adoption; visual regression check.

**Testing checklist.**
- [ ] `npm run build` + `npm run lint` green; bundle size reduced for lazy routes.
- [ ] Long list scrolls smoothly (virtualized) with correct row behaviour.
- [ ] Images lazy-load; no layout shift.

**Estimated complexity.** M. **Dependencies.** Phase 2 (paged endpoints exist).

**Exit criteria.** Long lists virtualized without behaviour regressions; heavy routes code-split; images lazy-loaded.

---

## Phase 9 — Warm Playwright pool + heavy-gen offload (→ Topic 07)

**Objective.** Stop launching a browser per PDF; move heavy generation to the background queue.

**Scope.** `HtmlPdfService` pooling + offload hooks.

**Files/modules affected.** `document/HtmlPdfService.java` (warm browser/context pool); heavy PDF/Excel/report generation enqueued via Topic-07 job queue.

**Database changes.** None.

**Backend changes.** Reuse a warm Playwright browser/context pool; route large/slow generation to background jobs (Topic 07), keeping a sync fast path for small receipts/PDFs.

**Frontend changes.** "Queued → notify when ready" UX for large exports (Topic 07). **API changes.** None (or job endpoints per Topic 07).

**Risks.** Browser-pool memory/leaks. Mitigation: bounded pool, recycle contexts, monitor memory.

**Testing checklist.**
- [ ] PDF generation reuses a warm browser (no per-request launch).
- [ ] Large gen runs in background; small gen stays sync.
- [ ] Pool bounded; no memory leak under load.

**Estimated complexity.** M. **Dependencies.** Phase 1; Topic 07 for offload.

**Exit criteria.** PDF generation uses a warm pool; heavy gen offloaded; request threads freed.

---

## Blocking decisions to resolve before the phase that needs them

| Open question (design §15) | Needed by | Recommended default |
|---|---|---|
| §15.1 Distributed cache (Redis) needed? | Phase 3 | Caffeine-only (single-instance-per-tenant) |
| §15.2 Acceptable dashboard/settings staleness (TTL) | Phase 4/5 | Short TTL: settings 10–30m, permissions 5–15m+evict, dashboard 1–5m |
| §15.3 `pg_trgm`/full-text vs. external engine | Phase 7 | Postgres `pg_trgm` (see Topic 08) |
| §15.4 Monitoring sink | Phase 1 | Actuator + Micrometer |
| §15.5 Largest report/list sizes | Phase 0/2/8 | Capture from production before sizing |

---

## Cross-cutting testing strategy

- **Measure-before/after every phase** — Phase 1's baseline is the yardstick; each phase must show a metric improvement (latency, query count, hit rate, memory) or it doesn't ship.
- **Branch-key leakage test** — a standing test that no branch-scoped cache returns another branch's data. The core cache-correctness guard.
- **Stale-permission test** — a permission/role change is reflected immediately (evict), never after TTL.
- **Report output-parity test** — paged/streamed report output is byte-identical to pre-change for a fixed dataset.
- **Query-count regression** — list endpoints keep their reduced query counts (no N+1 creeps back).
- Run `mvn -o test` after each backend phase; `npm run build` + `npm run lint` after Phase 8.
