# Topic — Caching Strategy

> **RESEARCH / DESIGN ONLY — not implemented. No code, schema, or migration here has been applied.**

Goal: design a complete caching strategy across the requested surfaces.

---

## 1. Current system behavior / existing analysis

- **Caching is enabled** (`@EnableCaching` on `BillbullBackendApplication`) but uses Spring's **default `ConcurrentMapCacheManager`** — **no Caffeine or Redis dependency** in `pom.xml`. That means: **unbounded** (no max size), **no TTL/expiration**, **not distributed** (per-JVM).
- **Only one cache in use:** `@Cacheable("productList")` in `ProductService` (key = `page + '_' + size + '_' + search + '_' + warehouseId`), with `@CacheEvict(value="productList", allEntries=true)` on every product create/update/delete → **coarse full-flush** on any write.
- **Uncached hot reads** (recomputed every request): branch settings, company settings, permissions/RBAC lookups, dashboard aggregates, lookup/master data (departments, brands, units, currencies, payment terms), customer/inventory reads, reports.
- **Pre-aggregation as a cache substitute:** `GlAccountBalance` materialized table (rebuilt by `GlBalanceRebuildJob`) already caches finance balances at the DB level — a good pattern to emulate.
- Multi-tenant = **DB-per-client**, typically single-instance per tenant.

## 2. Missing functionality

- No **TTL/eviction** → the current map cache can grow unbounded and never expires (staleness risk + memory risk).
- No caching on the highest-frequency, low-volatility reads (settings/permissions/lookups/dashboard).
- **Coarse invalidation** — `allEntries=true` negates cache benefit under write-heavy product editing.
- No **distributed cache** (irrelevant while single-instance, needed if scaled).
- No **branch-scoped keys** on cached data (risk of cross-branch leakage if applied naively to settings/lists).
- No cache metrics/monitoring.

## 3. Challenges and edge cases

1. **Correctness > speed for settings/permissions** — stale RBAC or settings can cause security/behavior bugs. Invalidate precisely on change; use short TTL as a safety net.
2. **Branch (and future owner) must be in the cache key** for any scoped data, or one branch sees another's cached list/settings.
3. **Invalidation on writes** — must evict the right keys, not flush everything (fix the `allEntries=true` coarseness).
4. **Multi-tenant** — a distributed cache needs per-tenant keyspaces; local caches are naturally isolated per JVM/tenant.
5. **Memory bounds** — replace unbounded map with size-capped Caffeine.
6. **Dashboard aggregates** — expensive but tolerant of short staleness → short-TTL cache or pre-aggregation.
7. **Cold-start / thundering herd** on popular keys → Caffeine `refreshAfterWrite` / async loading.

## 4. Possible technologies (comparison)

| Option | Fit | Pros | Cons |
|---|---|---|---|
| **Caffeine (local, TTL + size + stats) — RECOMMENDED default** | Very high | Drop-in Spring cache manager; TTL, max-size, eviction, refresh, metrics; no infra; per-tenant isolated | Per-instance (not shared across nodes) |
| **Redis (distributed)** | Medium (only if scaled) | Shared across instances; survives restart; pub/sub invalidation | New infra; per-tenant keyspacing; network hop |
| **Two-tier (Caffeine + Redis)** | Situational | Fast local + shared coherence | Most complex; only if multi-instance |
| **DB pre-aggregation (materialized tables)** | High for aggregates | Already proven (`GlAccountBalance`); durable | Not general-purpose caching |
| **Status quo (ConcurrentMap)** | Low | Zero change | Unbounded, no TTL, coarse eviction |

**Recommendation:** **Caffeine** as the default cache manager (TTL + max-size + stats), keep **DB pre-aggregation** for heavy aggregates (dashboard/finance), and adopt **Redis only if/when horizontal scaling** is introduced (single-instance-per-tenant doesn't need it yet).

## 5. Recommended caching plan (per surface)

| Surface | Cache | Key | TTL | Invalidation |
|---|---|---|---|---|
| Company settings | Caffeine | tenant (implicit) | 10–30 min | evict on settings save |
| Branch settings | Caffeine | branchId | 10–30 min | evict on branch update |
| Permissions / RBAC | Caffeine | userId or roleId | 5–15 min + evict | evict on role/permission change |
| Lookup/master data (dept/brand/unit/currency/terms) | Caffeine | type (+branch if scoped) | 30–60 min | evict on master change |
| Product lists | Caffeine (replace map) | page+size+search+**branchId**+warehouseId | 1–5 min | **fine** evict by affected branch/key, not allEntries |
| Product search / autocomplete | Caffeine | q+branchId | 30–60 s | short TTL only |
| Dashboard KPIs | Caffeine or pre-agg | branchId+period | 1–5 min | short TTL / scheduled refresh |
| Reports | Caffeine (short) or job-cached | filters+branch | 1–5 min | short TTL |
| Customer data | Caffeine (by id) | customerId | 5–10 min | evict on update |
| Inventory on-hand | pre-agg or short TTL | product+branch | seconds–1 min | evict on stock movement |

## 6. Database / schema impact (design only)

- None required for app-level caching. Optionally add pre-aggregation tables for dashboard KPIs / inventory on-hand (mirroring `GlAccountBalance`), additive + refreshed by `@Scheduled` jobs.

## 7. Backend changes

- Add Caffeine dependency + `CacheManager` bean (per-cache TTL/size config).
- Add `@Cacheable`/`@CacheEvict`/`@CachePut` on settings, permissions, lookups, customer, dashboard services with **branch-aware keys**.
- Replace `productList` coarse `allEntries=true` eviction with targeted eviction.
- Optional pre-aggregation jobs for dashboard/inventory.
- Cache metrics via Micrometer (Topic 06).

## 8. Frontend changes

- Minimal. Optionally leverage HTTP caching headers for truly static lookups; rely on server cache otherwise. Ensure client refetches after mutations (already typical).

## 9. API changes

- Transparent. Optionally add `Cache-Control`/`ETag` on stable lookup endpoints.

## 10. Security considerations

- **Branch/owner in every scoped key** — mandatory to prevent cross-tenant/branch/user leakage.
- Never cache sensitive/permission-bearing data longer than a safe TTL; evict on permission/role/user changes immediately.
- Distributed cache (if adopted) must namespace per tenant and secure the Redis instance.

## 11. Performance considerations

- Biggest wins: permissions/settings/lookups (hit on nearly every request) and dashboard aggregates.
- Caffeine `refreshAfterWrite` avoids stampedes; `maximumSize` bounds memory (fixes current unbounded map).
- Measure hit rates (Micrometer) and tune TTL/size; don't cache low-hit/high-volatility data.

## 12. Configuration requirements

- `cache.provider=caffeine|redis`, per-cache `cache.<name>.ttl`, `cache.<name>.max-size`, `cache.redis.url` (if used), `cache.metrics.enabled`. Toggle convention as existing.

## 13. Migration strategy

1. Add Caffeine + configured `CacheManager`; move `productList` onto it with branch-aware key + targeted eviction. 2. Cache settings/permissions/lookups with precise eviction. 3. Cache dashboard (short TTL) or pre-aggregate. 4. Add metrics; tune. 5. Redis only if scaled. Reversible (disable per cache).

## 14. Risks and dependencies

- Risk: stale permissions/settings → precise eviction + conservative TTL.
- Risk: cross-branch leakage → branch in keys (mandatory).
- Risk: memory growth → Caffeine max-size (fixes current gap).
- Dependency: Caffeine dep; Micrometer for hit-rate visibility (Topic 06); Redis only if multi-instance.

## 15. Step-by-step implementation plan

1. Add Caffeine + `CacheManager` with per-cache TTL/size config.
2. Migrate `productList` to Caffeine; add `branchId` to key; replace `allEntries` with targeted eviction.
3. Cache branch/company settings + permissions/RBAC with eviction on change.
4. Cache lookup/master data + customer reads.
5. Short-TTL cache (or pre-aggregate) dashboard KPIs + reports.
6. Add cache metrics; tune TTL/size from hit rates.
7. Introduce Redis only when horizontal scaling is real.

## 16. Open questions

1. Distributed cache needed now, or is single-instance-per-tenant the norm (→ Caffeine only)?
2. Acceptable staleness per surface (settings, permissions, dashboard)?
3. Pre-aggregate inventory on-hand (like `GlAccountBalance`) or short-TTL cache?
4. Add HTTP caching (ETag/Cache-Control) for static lookups?
5. Cache-key strategy once ownership filtering (Topic 02) lands — include ownerId where applicable?

## 17. Recommendation

Replace the unbounded default `ConcurrentMapCacheManager` with **Caffeine** (TTL + max-size + stats) and cache the highest-frequency, low-volatility reads first — **permissions/RBAC, branch & company settings, and lookup/master data** — with **precise, branch-aware keys and targeted eviction** (fixing the current `allEntries=true` coarseness on `productList`). Use **short-TTL caching or DB pre-aggregation** (following the proven `GlAccountBalance` pattern) for dashboards and inventory on-hand. Keep everything local (per-tenant) and add **Redis only if horizontal scaling** materializes. Instrument hit rates with Micrometer and tune.
