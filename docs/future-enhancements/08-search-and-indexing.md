# Topic — Search & Indexing

> **RESEARCH / DESIGN ONLY — not implemented. No code, schema, or migration here has been applied.**

Goal: improve searching across large datasets; recommend the best indexing strategy.

---

## 1. Current system behavior / existing analysis

- **Scale is real:** the product catalog shown in the UI is **12,181 products** (single branch) — search must stay fast at 5–6 figures of rows.
- **Existing search:** `pos/search/PosSearchService` + `PosLookupService` resolve barcode/product/customer via `/api/pos/resolve` (unified smart search + scan — pins exact barcode/batch/code/customer, per `project_pos_unified_smart_search` memory). `PosLookupService` uses `ILIKE` (the only current full-text-ish usage found).
- **Product list/search** is paged + cached (`@Cacheable("productList")`, key includes page/size/search/warehouseId) in `ProductService`.
- **Indexes exist** on `products` (`code`, `name`, `is_active`, composites), `stock_movements`, `audit_logs`, plus Flyway index packs. But name/code search likely uses `LIKE`/`Containing`/`ILIKE` which cannot use a plain B-tree index for leading-wildcard (`%term%`) queries → sequential scans at scale.
- **No `pg_trgm`, no PostgreSQL full-text (`tsvector`), no external search engine** (Elasticsearch/OpenSearch/Meilisearch) present.
- **No search suggestions/auto-complete/history** infrastructure beyond the POS resolve endpoint.

## 2. Missing functionality

- **Fast fuzzy/substring search** on large text columns (product name/code/SKU, customer/vendor name, invoice/purchase/payment numbers). Leading-wildcard `ILIKE '%x%'` = seq scan.
- **Unified global search** across entities (products, customers, vendors, invoices, LPOs, GRNs, quotations) — the dashboard has a "Search invoices, LPOs, GRNs, products, customers, quotations…" box implying an intended global search.
- **Auto-complete / typeahead** with ranking.
- **Search suggestions & history** (recent/frequent searches).
- **Advanced filters** consistently across search surfaces.
- **Typo tolerance / relevance ranking.**

## 3. Challenges and edge cases

1. **Leading-wildcard search** needs trigram (`pg_trgm` GIN) or full-text indexes — plain B-tree won't help.
2. **Barcode/SKU exact match** vs. **name fuzzy match** are different query shapes — the POS resolve already distinguishes exact vs. filter; keep that.
3. **Branch/ownership scoping** must apply to search results (a branch user shouldn't see another branch's transactions) — search predicates AND with `ListScope`.
4. **Multi-column, multi-entity global search** ranking and pagination is non-trivial in pure SQL.
5. **Index maintenance cost** — GIN indexes slow writes slightly; product import (bulk) must tolerate it.
6. **Multi-tenant DB-per-client** — an external engine (ES) would need per-tenant indices + sync; heavier ops.
7. **Bilingual data** (EN/AR names, `localName`) — search should cover both; tokenization differs.
8. **Cache coherence** — cached search results must key on branch + filters and invalidate on writes.

## 4. Possible implementation approaches

| Option | Fit | Pros | Cons |
|---|---|---|---|
| **PostgreSQL `pg_trgm` (GIN) for fuzzy/substring (RECOMMENDED core)** | Very high | No new infra; indexes `ILIKE '%x%'`, similarity ranking, typo tolerance; per-tenant automatic | Slight write cost; ranking simpler than ES |
| **PostgreSQL full-text (`tsvector`/`GIN`)** | High | Native ranked full-text, stemming; good for descriptions | Token-based (weak on partial SKUs/barcodes); needs `tsvector` columns/triggers |
| **Composite B-tree indexes** | High for exact/prefix | Great for `code =`, `code LIKE 'x%'`, sort combos | Useless for `%x%` |
| **Materialized search view / denormalized search table** | Medium | One place to query for global search; precomputed | Refresh/sync complexity |
| **External engine (Elasticsearch/OpenSearch/Meilisearch/Typesense)** | Medium/low now | Best relevance, typo tolerance, facets, global search at scale | New infra + per-tenant index sync + ops; overkill until scale demands |

**Recommendation:** **`pg_trgm` GIN indexes** for fuzzy/substring across key text columns, **plus composite B-tree** for exact/prefix (barcode/SKU/code) and sort combos, **plus optional full-text (`tsvector`)** for long descriptive fields. Build **global search** as a SQL UNION over per-entity trigram queries (branch-scoped), cached. Defer an external engine (Meilisearch/Typesense are lighter than ES if ever needed) until catalog/transaction volume or relevance needs exceed Postgres.

## 5. Recommended indexing strategy (per search type)

| Search | Strategy |
|---|---|
| Product name (incl. `localName` AR) | `pg_trgm` GIN on `name`, `local_name` |
| Product code / SKU | B-tree (exact/prefix) + `pg_trgm` GIN for substring |
| Barcode | exact B-tree on `product_barcodes.barcode` (already resolves exact in POS) |
| Customer / Vendor name | `pg_trgm` GIN on `name` |
| Invoice / Purchase / Payment number | B-tree (prefix) + trigram if substring needed |
| Descriptions | full-text `tsvector` GIN (optional) |
| Global search | UNION of the above, branch-scoped, ranked by `similarity()` + entity weight |

## 6. Database / schema impact (design only)

- Enable `CREATE EXTENSION IF NOT EXISTS pg_trgm;` (per tenant) — additive.
- Add GIN trigram indexes on the columns above; composite B-trees for search+sort.
- Optional generated `tsvector` columns + GIN for descriptions (or expression indexes).
- All additive, Flyway-guarded (`to_regclass` checks), no drops. Note the stale-schema hazard: extensions/indexes are safe additive ops.

## 7. Backend changes

- Search repository methods using trigram (`WHERE name % :q ORDER BY similarity(name,:q) DESC`) with branch-scope predicates (`ListScope`).
- `GlobalSearchService` (UNION per-entity, ranked, paged, branch/ownership-scoped) behind `/api/search`.
- Auto-complete endpoints (limit N, prefix + trigram) with short-TTL caching.
- Optional `search_history` capture (per user) for suggestions.

## 8. Frontend changes

- Wire the dashboard global-search box to `/api/search` with debounced typeahead, grouped results (Products/Customers/Invoices/…), keyboard nav.
- Per-module search: debounced auto-complete, recent-search chips, consistent advanced filters.
- Reuse the POS unified-search UX patterns already in place.

## 9. API changes

- `GET /api/search?q=&types=&limit=` (global), `GET /api/{module}/search?q=` (scoped), `GET /api/{module}/autocomplete?q=`. Backward compatible; POS resolve endpoint unchanged.

## 10. Security considerations

- All search results branch-scoped (and ownership-scoped once Topic 02 lands) — never leak other branches'/users' records via global search.
- Rate-limit search/autocomplete endpoints (Topic 03) — they're cheap to spam.
- Sanitize query input (parameterized; trigram operators safe).

## 11. Performance considerations

- GIN trigram turns `%x%` seq scans into index scans — the primary win at 12k+ rows.
- Debounce + min-length (≥2–3 chars) on autocomplete to cut query volume; cache hot queries (Caffeine, Topic 06) keyed by branch.
- Bound global-search UNION with per-entity limits before ranking.
- Monitor GIN write overhead on bulk product import; import already async (Topic 07).

## 12. Configuration requirements

- `search.trgm.enabled`, `search.autocomplete.min-chars`, `search.global.per-type-limit`, cache TTLs, `search.history.enabled`. Toggle convention as existing.

## 13. Migration strategy

1. Enable `pg_trgm` + add GIN/B-tree indexes (additive). 2. Add trigram repo methods behind flags; validate query plans (`EXPLAIN`). 3. Ship module auto-complete. 4. Ship global search UNION + dashboard wiring. 5. Optional full-text for descriptions. 6. Optional search history/suggestions. Reversible (drop indexes / disable flags).

## 14. Risks and dependencies

- Risk: GIN index write cost on bulk imports → measure; imports are async.
- Risk: global-search ranking quality vs. ES → acceptable for current scale; revisit if needed.
- Risk: bilingual tokenization gaps → trigram is language-agnostic (mitigates for names).
- Dependency: `pg_trgm` extension availability; caching layer (Topic 06); rate limiting (Topic 03).

## 15. Step-by-step implementation plan

1. Enable `pg_trgm`; add trigram GIN + composite B-tree indexes (Flyway, guarded).
2. Add branch-scoped trigram search + autocomplete repo methods; verify with `EXPLAIN`.
3. Build `GlobalSearchService` + `/api/search`; wire dashboard box (debounced, grouped).
4. Add per-module autocomplete + recent-search chips.
5. Add short-TTL caching for hot search/autocomplete.
6. (Optional) full-text `tsvector` for descriptions; search history/suggestions.
7. Load-test at production catalog size; tune limits.

## 16. Open questions

1. Is Postgres `pg_trgm`/full-text sufficient, or is an external engine (Meilisearch/Typesense/ES) anticipated at higher scale?
2. Must global search include transactional docs (invoices/LPOs/GRNs/payments) or only masters (products/customers/vendors)?
3. Bilingual (AR) search priority — index `localName`/Arabic fields now?
4. Search history/suggestions per user (ties to Topic 02 ownership) desired?
5. Relevance/ranking expectations (exact-first, similarity-ranked, recency-weighted)?

## 17. Recommendation

Stay in **PostgreSQL**: enable **`pg_trgm` GIN** indexes for fuzzy/substring search on product/customer/vendor names and codes, keep **B-tree** for exact/prefix (barcode/SKU/number), and optionally add **full-text `tsvector`** for descriptions. Build **global search** as a branch-scoped, ranked SQL UNION behind `/api/search`, wire the existing dashboard search box, and add debounced auto-complete with short-TTL caching. This needs no new infrastructure, fits the DB-per-tenant model, and scales comfortably past the current 12k-product catalog. Reserve an external search engine for a future scale/relevance threshold.
