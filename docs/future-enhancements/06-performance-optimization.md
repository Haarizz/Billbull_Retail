# Topic — Performance Optimization

> **RESEARCH / DESIGN ONLY — not implemented. No code, schema, or migration here has been applied.**

Goal: identify system-wide performance improvements, grounded in the current architecture, prioritized by impact.

---

## 1. Current system behavior / existing analysis

The codebase already shows meaningful performance engineering (per CLAUDE.md + memories):
- **Indexing:** entities carry explicit `@Index` sets (e.g. `Product` has 8 indexes incl. composite `(is_active, name)`; `StockMovement` has `(product_id, source_type, created_at)`; `AuditLog` has `(username, access_time)` / `(branch_id, access_time)`). Flyway `V3__missing_indexes.sql` adds column-guarded index packs.
- **JDBC batching tuned:** `batch_size=50`, `order_inserts/updates=true`, `default_batch_fetch_size=50`; Hikari `max=25/min-idle=5`.
- **Caching enabled:** `@EnableCaching` + `@Cacheable("productList")` on the product list query (default `ConcurrentMapCacheManager` — no Caffeine/Redis dep).
- **Server-side pagination** already done for LPO + Payments (`ListScope` branch-scope helper, real `/page` endpoints, N+1 killed) — per `project_pagination_perf` memory; report row-payload pagination deferred.
- **Async writes** for audit (`AuditLogWriter @Async`).
- **Pre-aggregated finance balances** (`GlAccountBalance` table + `GlBalanceRebuildJob`) instead of summing ledgers live.
- **Lazy associations** widely used (`@ManyToOne(fetch = LAZY)` on Product.branch, Warehouse.branch, etc.).
- **Frontend:** Vite with `manualChunks` + `chunkSizeWarningLimit: 1500`; large page components own their own state; charts via `recharts`.

## 2. Missing functionality / gaps

- **Cache manager is in-memory `ConcurrentMap`** — no eviction/TTL, not distributed, only `productList` cached. Many hot read paths (branch/company settings, permissions, lookup data, dashboards) are uncached.
- **Reports still load full row payloads** (report pagination deferred) — the biggest remaining hotspot per memory.
- **Java-side branch/ownership filtering** (`filterBranchScoped`) on large lists instead of DB predicates in some paths.
- **No `@EntityGraph`/fetch-join discipline audit** — potential N+1 on association-heavy list serializations (e.g. Product→pricing/inventory/tax OneToOne, invoice→lines→product).
- **No frontend list virtualization** — 12k+ product lists render 50/page (paged) but other long lists may render fully; no `react-window`/`@tanstack/virtual` dependency present.
- **No monitoring/metrics** — no Actuator/Micrometer; slow queries invisible.
- **Synchronous heavy work on request threads**: PDF (Playwright), Excel (POI), imports — see Topic 08 (background jobs).
- **`@CacheEvict(allEntries=true)`** on every product write flushes the whole product-list cache — coarse; heavy write workloads negate the cache.

## 3. Challenges and edge cases

1. **Multi-tenant (DB-per-client):** a distributed cache (Redis) would need per-tenant keyspacing; local caches are simpler but per-instance.
2. **Branch/ownership scoping in cache keys:** cached lists must include branch (and future owner) in the key or they'll leak across branches. `productList` key already includes `warehouseId` but not branch — verify.
3. **Cache invalidation correctness** is harder than the perf win — stale settings/permissions are dangerous.
4. **N+1 detection** needs query logging/profiling that isn't currently on.
5. **Large exports/reports** can OOM if fully materialized — need streaming/paging.
6. **Frontend re-renders** on large pages (POS, product grid) can jank without memoization/virtualization.

## 4. Prioritized improvements (by impact)

### P0 — Highest impact, lower effort
1. **Report pagination / streaming** (the known deferred hotspot): push filters + pagination into DB queries; stream Excel/PDF for large reports (ties to Topic 08).
2. **Swap default cache → Caffeine** (add dep) with TTL + max-size + eviction; cache branch settings, company settings, permissions, lookup/master data (departments/brands/units), and dashboard aggregates with short TTL. Include branch in keys.
3. **Push branch/ownership filtering into SQL** everywhere still using Java-side `filterBranchScoped` on large lists (continue the `ListScope` DB-predicate direction already established).
4. **Add Actuator + Micrometer** + slow-query logging (`spring.jpa.properties.hibernate.session.events.log.LOG_QUERIES_SLOWER_THAN_MS`) to make hotspots visible before further tuning.

### P1 — High impact
5. **N+1 audit + `@EntityGraph`/fetch joins** on list endpoints serializing associations (invoices→lines→product, product→pricing/inventory/tax). Use projections/DTOs for list views to avoid loading full graphs.
6. **Dashboard optimization:** pre-aggregate KPIs (mirror `GlAccountBalance` pattern) or cache with short TTL per branch; avoid recomputing sales/stock aggregates on every load.
7. **Product search optimization:** move `ILIKE`/`Containing` scans to trigram (`pg_trgm`) or full-text indexes (ties to Topic 05/Search doc); add composite indexes for common search+sort combos.
8. **Finer cache eviction** for `productList` (evict by affected key/branch instead of `allEntries=true`).

### P2 — Medium impact
9. **Frontend virtualization** (`react-window`/`@tanstack/react-virtual`) for very long lists/tables (audit, ledgers, POS product grid) + `React.memo`/`useMemo`/`useCallback` on hot components.
10. **Bundle optimization:** route-level code splitting / lazy `import()` for heavy pages (Financials, Reports, POS) beyond current `manualChunks`; tree-shake `jspdf`/`exceljs`/`recharts`.
11. **Image optimization:** serve product/brand images resized + lazy-loaded; use `loading="lazy"`, responsive sizes; consider WebP.
12. **Batch processing:** ensure bulk writes use `saveAll` + the tuned JDBC batching (already configured); chunk large imports.

### P3 — Lower / situational
13. **Print optimization:** reuse a warm Playwright browser/context pool in `HtmlPdfService` (avoid per-request browser launch); move to background (Topic 08).
14. **Memory:** bound in-memory job registries (`ProductImportService`), audit buffers, and add cache size caps.
15. **DB indexing sweep:** review pg `EXPLAIN` on top queries once monitoring is on; add missing composite indexes; drop unused ones.

## 5. Database / schema impact (design only)

- Add composite/trigram/full-text indexes for search + report filters (additive, Flyway-guarded); e.g. `pg_trgm` GIN on `products.name/code`, `customers.name`, invoice numbers.
- Optional pre-aggregation tables for dashboard KPIs (like `GlAccountBalance`).
- No destructive changes.

## 6. Backend changes

- Add Caffeine cache manager + `@Cacheable` on settings/permissions/lookup/dashboard with keys including branch; refine evictions.
- Add Actuator/Micrometer; enable slow-query logging.
- Convert remaining Java-side scoped filters to DB predicates; add `@EntityGraph`/DTO projections to kill N+1.
- Report/export pagination + streaming; warm Playwright pool.

## 7. Frontend changes

- Virtualize long lists; memoize hot components; route-level lazy loading; image lazy-load/resize; verify paged endpoints used everywhere.

## 8. API changes

- Report endpoints gain pagination/streaming params; list endpoints return lean DTOs. Backward compatible.

## 9. Security considerations

- Cache keys must include branch (and future owner) to prevent cross-branch/user data leakage.
- Actuator endpoints must be secured (not publicly exposed).

## 10. Performance considerations

- Measure first (P0 monitoring) to avoid speculative tuning.
- Prefer DB-side work + indexes over app-side loops; prefer projections over full-entity loads for lists.

## 11. Configuration requirements

- Add `cache.*` (TTL, max-size, provider), `management.endpoints.*` (Actuator), slow-query threshold props. Follow `*.enabled` toggle convention.

## 12. Migration strategy

1. Turn on monitoring (measure). 2. Report pagination/streaming. 3. Caffeine cache + key hygiene. 4. N+1/EntityGraph fixes. 5. Dashboard pre-agg. 6. Search indexes. 7. Frontend virtualization/bundle/image. Each independent + reversible.

## 13. Risks and dependencies

- Risk: stale cache serving wrong settings/permissions → conservative TTL + explicit eviction.
- Risk: cross-branch cache leakage → branch in keys (mandatory).
- Risk: index bloat/write slowdown → measure, add selectively.
- Dependency: Actuator/Micrometer + (optional) Redis for distributed cache; `pg_trgm` extension for search.

## 14. Step-by-step implementation plan

1. Add Actuator/Micrometer + slow-query logging; capture baselines.
2. Implement report pagination/streaming (top hotspot).
3. Introduce Caffeine + cache settings/permissions/lookups/dashboard with branch-aware keys; refine evictions.
4. Audit + fix N+1 with EntityGraph/DTO projections.
5. Add search indexes (pg_trgm/full-text).
6. Frontend: virtualization, memoization, lazy routes, image optimization.
7. Warm Playwright pool + move heavy gen to background (Topic 08).
8. Re-measure; iterate on EXPLAIN findings.

## 15. Open questions

1. Distributed cache (Redis) needed, or is per-instance Caffeine sufficient given single-instance-per-tenant?
2. Acceptable dashboard staleness (TTL) per tenant?
3. Is `pg_trgm`/full-text acceptable, or is an external search engine planned (see Search doc)?
4. Monitoring sink: Actuator/Prometheus or hosted APM?
5. Largest report/list sizes in production (to size streaming/virtualization)?

## 16. Recommendation

Lead with **measurement (Actuator/Micrometer + slow-query logging)**, then attack the two highest-ROI, already-identified hotspots — **report pagination/streaming** and a **proper Caffeine cache** for settings/permissions/lookups/dashboards with branch-aware keys. Continue the established pattern of pushing scoping into SQL and pre-aggregating (as `GlAccountBalance` already does), fix N+1 with `@EntityGraph`/DTO projections, and add search indexes. Treat frontend virtualization/bundle/image work as P2 and background offloading (Topic 08) for heavy PDF/Excel as complementary.
