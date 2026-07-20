# Search & Indexing — Implementation Roadmap

> **Status: APPROVED FOR EXECUTION.** Design is locked in [`08-search-and-indexing.md`](08-search-and-indexing.md) (stay in PostgreSQL: `pg_trgm` GIN for fuzzy/substring + B-tree for exact/prefix + optional `tsvector` for descriptions; global search as a branch-scoped, ranked SQL UNION; reserve an external engine for a future scale threshold). This document is the execution plan; it does **not** authorize coding ahead of the phase it describes.
>
> **Golden rules for every phase below**
> - Each phase is **independently deployable**; index additions are additive (reversible by drop), search-behaviour changes gated by `search.*` flags.
> - **All search results are branch-scoped** (and ownership-scoped once Topic 02 lands) — global search must never leak another branch's/user's records.
> - Search/autocomplete endpoints are **cheap to spam** → rate-limit them (Topic 03) and debounce + min-length client-side.
> - Index changes are **Flyway-guarded** (`to_regclass`); `CREATE EXTENSION IF NOT EXISTS pg_trgm` per tenant is additive and safe.
> - **Barcode/SKU exact match stays exact** — the POS resolve path (`/api/pos/resolve`) is unchanged; only fuzzy/substring gets trigram.

## Baseline verified against the codebase (2026-07-11)

| Design assumption | Verified? | Note |
|---|---|---|
| Catalog scale ~12,181 products (single branch) | ✅ (per design §1) | Seq scans on `%term%` are the real hotspot. |
| `PosLookupService` uses `ILIKE`; POS resolve distinguishes exact vs. filter | ✅ (per design §1 + memory `pos_unified_smart_search`) | Keep exact-vs-filter; add trigram for fuzzy only. |
| No `pg_trgm`/`tsvector`/external engine present | ✅ (per design §1) | Phase 1 enables `pg_trgm`. |
| Product list paged + `@Cacheable("productList")` | ✅ (per design §1) | Caching coordinates with Topic 06/10 (branch-aware keys). |
| `ListScope` DB-predicate scoping exists | ✅ (repo read) | Search predicates AND with `ListScope`. |
| Next Flyway version | ⚠️ | Docs say "V30"; tree at **V33** → new migration **V34**. |

---

## Phase map

| # | Phase | Ships behaviour change? | Toggle-gated? | Complexity |
|---|---|---|---|---|
| 0 | Scope + bilingual + ranking decisions | No | n/a | S |
| 1 | Enable `pg_trgm` + trigram GIN + composite B-tree indexes | No (indexes only) | n/a (additive) | S |
| 2 | Branch-scoped trigram search + autocomplete repo methods | Yes (behind flag) | Yes | M |
| 3 | `GlobalSearchService` + `/api/search` + dashboard wiring | Yes (behind flag) | Yes | L |
| 4 | Per-module autocomplete + recent-search chips | Yes | Yes | M |
| 5 | Short-TTL caching for hot search/autocomplete | Yes | Config | S |
| 6 | (Optional) full-text `tsvector` + search history/suggestions | Yes | Flag | M |

Complexity key: **S** ≤ ~1 day · **M** ~2–4 days · **L** ~1 week+.

---

## Phase 0 — Scope + bilingual + ranking decisions

**Objective.** Decide whether global search includes transactional docs, whether to index Arabic `localName` now, and the ranking model. No code.

**Scope.** Written decisions.

**Files/modules affected.** None.

**Database/Backend/Frontend/API changes.** None.

**Risks.** Building global search before scope is set → rework. Mitigation: this phase gates §16.

**Testing checklist.**
- [ ] Global search scope: masters-only vs. include invoices/LPOs/GRNs/payments (§16.2).
- [ ] Bilingual (AR `localName`) indexed now? (§16.3).
- [ ] Ranking expectation: exact-first / similarity / recency-weighted (§16.5).
- [ ] Search history/suggestions wanted? (§16.4, ties Topic 02).

**Estimated complexity.** S. **Dependencies.** None.

**Exit criteria.** Signed decisions on §16.2–16.5.

---

## Phase 1 — Enable `pg_trgm` + trigram GIN + composite B-tree indexes

**Objective.** Land the indexes that turn `%term%` seq scans into index scans. No behaviour change (queries don't use them yet). Overlaps Topic 06 Phase 7 — coordinate to avoid duplicate migrations.

**Scope.** One Flyway migration.

**Files/modules affected.** `.../db/migration/V34__search_indexes.sql`.

**Database changes.**
- `CREATE EXTENSION IF NOT EXISTS pg_trgm;` (per tenant).
- GIN trigram on `products.name`, `products.code`, `products.local_name` (if §0 says index AR), `customers.name`, vendor `name`, invoice/purchase/payment numbers where substring search is needed.
- B-tree (exact/prefix) on `products.code`, `product_barcodes.barcode`, document numbers; composite B-trees for common search+sort combos.
- All additive, `to_regclass`-guarded.

**Backend changes.** None (indexes only).

**Frontend/API changes.** None.

**Risks.** GIN write cost on bulk product import. Mitigation: import is async (Topic 07); measure write overhead; indexes are drop-reversible.

**Testing checklist.**
- [ ] Migration idempotent; extension + indexes created.
- [ ] `EXPLAIN` on `name ILIKE '%x%'` shows GIN index scan (not seq scan).
- [ ] Bulk import write overhead measured + acceptable.
- [ ] `mvn -o compile` + boot clean.

**Estimated complexity.** S. **Dependencies.** Phase 0.

**Exit criteria.** Indexes present; `EXPLAIN` confirms index scans; import overhead acceptable.

---

## Phase 2 — Branch-scoped trigram search + autocomplete repo methods

**Objective.** Add search/autocomplete queries that use the indexes and AND with branch scope. Behind `search.trgm.enabled`.

**Scope.** Search repo methods + service wiring.

**Files/modules affected.** Product/customer/vendor search repositories (trigram: `WHERE name % :q ORDER BY similarity(name,:q) DESC`, limited); autocomplete methods (prefix + trigram, limit N); services applying `ListScope`.

**Database changes.** None.

**Backend changes.** Trigram queries AND with `currentListScope()` branch predicate. Keep exact barcode/SKU resolution on the existing exact path (POS resolve unchanged). Gated by `search.trgm.enabled` (falls back to current `ILIKE`/`Containing` when off).

**Frontend changes.** None yet. **API changes.** `GET /api/{module}/search?q=`, `GET /api/{module}/autocomplete?q=` (backward compatible; POS resolve untouched).

**Risks.** Search leaking cross-branch results. Mitigation: branch predicate mandatory in every search query; a test that branch A search never returns branch B rows.

**Testing checklist.**
- [ ] Trigram search returns similarity-ranked results, branch-scoped.
- [ ] Autocomplete limited + fast (index-backed, `EXPLAIN`-verified).
- [ ] Exact barcode/SKU still resolves exactly (POS unchanged).
- [ ] Toggle off → current `ILIKE` behaviour.
- [ ] No cross-branch leakage.

**Estimated complexity.** M. **Dependencies.** Phase 1.

**Exit criteria.** Fuzzy search + autocomplete index-backed and branch-scoped; exact path intact; toggle-off = legacy.

---

## Phase 3 — `GlobalSearchService` + `/api/search` + dashboard wiring

**Objective.** One global search box across entities (branch-scoped, ranked), wired to the dashboard.

**Scope.** Global search service + endpoint + dashboard UI.

**Files/modules affected.** New `GlobalSearchService` (UNION of per-entity trigram queries, per-entity limits before ranking, ranked by `similarity()` + entity weight, branch/ownership-scoped, paged); `GET /api/search?q=&types=&limit=`; dashboard global-search box wiring (debounced typeahead, grouped results, keyboard nav).

**Database changes.** None.

**Backend changes.** Bound each per-entity subquery with a limit before merge/rank. Include transactional docs per §0 decision. Branch-scoped throughout; ownership-scoped once Topic 02 lands.

**Frontend changes.** Wire the existing dashboard "Search invoices, LPOs, GRNs, products, customers, quotations…" box to `/api/search`; grouped results (Products/Customers/Invoices/…); reuse POS unified-search UX patterns.

**API changes.** `GET /api/search` (new).

**Risks.** Global-search ranking quality / UNION performance. Mitigation: per-entity limits before ranking; acceptable for current scale (design §14); rate-limit the endpoint (Topic 03).

**Testing checklist.**
- [ ] Global search returns grouped, ranked, branch-scoped results.
- [ ] Per-entity limits applied before ranking (bounded work).
- [ ] Dashboard box wired, debounced, keyboard-navigable.
- [ ] No cross-branch leakage in any entity group.
- [ ] `npm run build` + `npm run lint` green.

**Estimated complexity.** L. **Dependencies.** Phase 2.

**Exit criteria.** Dashboard global search works end-to-end, branch-scoped and ranked, within latency budget.

---

## Phase 4 — Per-module autocomplete + recent-search chips

**Objective.** Consistent debounced autocomplete + recent-search UX across module search surfaces.

**Scope.** Per-module search UIs.

**Files/modules affected.** Module list/search pages (debounced autocomplete via Phase-2 endpoints; recent-search chips; consistent advanced filters).

**Database changes.** None (recent-search client-side unless §0 chose server history → Phase 6). **Backend changes.** None new.

**Frontend changes.** Debounced typeahead, min-length gate, recent-search chips.

**API changes.** None new.

**Risks.** Autocomplete spam. Mitigation: debounce + `search.autocomplete.min-chars` + rate-limit (Topic 03).

**Testing checklist.**
- [ ] Autocomplete debounced, min-length enforced.
- [ ] Recent-search chips function.
- [ ] `npm run build` + `npm run lint` green.

**Estimated complexity.** M. **Dependencies.** Phase 2.

**Exit criteria.** Consistent autocomplete UX across modules; endpoint load controlled.

---

## Phase 5 — Short-TTL caching for hot search/autocomplete

**Objective.** Cache hot queries to cut DB load. Ties to Topic 10 (Caffeine).

**Scope.** Search/autocomplete cache.

**Files/modules affected.** Search/autocomplete services (`@Cacheable` short TTL, branch-aware key).

**Database changes.** None.

**Backend changes.** Short-TTL Caffeine cache keyed by `q + branchId` (30–60s); relies on Topic 10's Caffeine manager.

**Frontend/API changes.** None.

**Risks.** Cross-branch cache leak (branch missing from key). Mitigation: branch in key (mandatory); test.

**Testing checklist.**
- [ ] Repeated hot query served from cache (hit-rate visible).
- [ ] Branch A cached results never returned to branch B.
- [ ] TTL expiry works.

**Estimated complexity.** S. **Dependencies.** Phase 2; Topic 10 (Caffeine).

**Exit criteria.** Hot search/autocomplete cached with branch-aware keys; measurable hit rate; no leak.

---

## Phase 6 — (Optional) full-text `tsvector` + search history/suggestions

**Objective.** Add ranked full-text for long descriptive fields and, if wanted, per-user search history/suggestions.

**Scope.** `tsvector` indexes + optional history.

**Files/modules affected.** Flyway: generated `tsvector` column(s) + GIN (or expression index) on descriptions; optional `search_history` table (per user — ties Topic 02 ownership).

**Database changes.** Additive `tsvector` GIN; optional `search_history`.

**Backend changes.** Full-text query methods for descriptions; optional history capture + suggestions endpoint.

**Frontend changes.** Suggestion chips from history (if adopted).

**API changes.** Optional history/suggestions endpoints.

**Risks.** Token-based full-text weak on partial SKUs/barcodes (design §4). Mitigation: full-text for descriptions only; keep trigram for names/codes.

**Testing checklist.**
- [ ] Description full-text search ranked correctly.
- [ ] Search history captured per user (if adopted), ownership-scoped.
- [ ] Load test at production catalog size; tune limits.

**Estimated complexity.** M. **Dependencies.** Phase 2/3; Topic 02 for history ownership.

**Exit criteria.** Full-text descriptions searchable; optional history/suggestions validated. **Optional** — only if §16.4/description search is needed.

---

## Blocking decisions to resolve before the phase that needs them

| Open question (design §16) | Needed by | Recommended default |
|---|---|---|
| §16.1 `pg_trgm`/full-text sufficient vs. external engine | Phase 0 | Postgres now; external engine deferred |
| §16.2 Global search includes transactional docs? | Phase 3 | Include invoices/LPOs/GRNs/payments (branch-scoped) |
| §16.3 Index Arabic `localName` now? | Phase 1 | Yes (trigram is language-agnostic) |
| §16.4 Search history/suggestions per user? | Phase 6 | Optional; ties Topic 02 ownership |
| §16.5 Ranking model | Phase 2/3 | Exact-first, then similarity-ranked |

---

## Cross-cutting testing strategy

- **Branch-scoped-results test** — every search/autocomplete/global-search path AND with `ListScope`; a standing test that branch A never sees branch B results. The core leak guard (extends to ownership once Topic 02 lands).
- **`EXPLAIN` index-scan test** — key `%term%` queries use the GIN index, not a seq scan, at production catalog size.
- **Exact-path invariance** — barcode/SKU exact resolution (POS `/api/pos/resolve`) is unchanged by any trigram work.
- **Toggle-off = legacy** — with `search.trgm.enabled=false`, search behaves as today's `ILIKE`/`Containing`.
- **Import-overhead test** — bulk product import write cost with GIN indexes stays acceptable (import is async).
- Run `mvn -o test` after each backend phase; `npm run build` + `npm run lint` after Phases 3–4.
