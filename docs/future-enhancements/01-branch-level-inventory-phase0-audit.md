# Branch-Level Inventory — Phase 0 Pre-Flight Audit Report

> **Phase 0 of the [Branch-Level Inventory roadmap](01-branch-level-inventory-roadmap.md). Read-only audit — no production code, no migrations, no schema/behaviour changes were made.**
>
> **Audit date:** 2026-07-11 · **Auditor:** engineering · **Scope of live data audit:** the local `testdb` database only (PostgreSQL 17.6). Static/code verification applies to the whole codebase.
>
> **Historical note (added post-audit):** this report was written when the plan was **Approach A** (global catalog). On 2026-07-11 the business confirmed **Approach C, module-wide** (branch-scope *everything*, including master data) — see the design doc's Revision Changelog. This audit's *findings remain valid and are unaffected*: every product being null-branch (finding L) now means "all existing catalog is shared/global and stays visible in every branch," which is exactly the backward-compatible starting point the revised plan relies on. References to "Approach A" below are preserved as-written for the historical record.

---

## 1. Executive Summary

Phase 0 verified every assumption the roadmap makes for Phases 1–2 against **both the source code and a live database**. The design is sound and the schema is ready for the additive `stock_movements.branch_id` column.

**Headline results (on `testdb`):**
- All branch-related columns and foreign keys the roadmap depends on **exist and are correctly nullable**.
- `stock_movements` has **no `branch_id`** — confirming the single most important schema gap the whole topic addresses.
- Warehouse data is **clean**: every warehouse has a branch; **zero** orphan or null-warehouse stock movements; the Phase-1 backfill would populate **100 %** of movements with no rows left stranded.
- The product catalog is **entirely global** (`branch_id = NULL` on all 12,181 products) — a perfect fit for Approach A, with **no** code-uniqueness conflict risk.

**One real finding (non-blocking for Phase 1):** one of the two branches has **no `default_warehouse` set** (§14.7). This does **not** affect Phases 1–2 but **must be resolved before Phase 9** (POS/purchase default-warehouse stamping), and the decision is owed by the business.

**Two scope caveats the reader must hold:**
1. **`testdb` is a dev database, not production.** 101 stock movements is trivially small; it validates *correctness and data shape* but **not backfill performance/locking at production volume**. The backfill sizing exit-criterion is only partially met (see §4, Blocker B-1).
2. **This audit covered one of 14 tenant databases.** The same diagnostics must be re-run per tenant before Phase 1 is applied to that tenant (see §4, Blocker B-2).

**Recommendation: GO for Phase 1**, conditional on running the same diagnostics against each production tenant DB (§7). The code and data model are ready; the only unknowns are per-tenant data hygiene and production backfill sizing, both of which Phase 1's guarded, idempotent migration is explicitly designed to tolerate.

---

## 2. Verified Assumptions

### 2.1 Roadmap baseline table (re-verified)

| Roadmap assumption | Method | Result |
|---|---|---|
| `BranchAccessService.ListScope` / `currentListScope()` / `canAccessBranch()` / `assertWarehouseMatchesBranch()` exist | Code read (`settings/branch/BranchAccessService.java`) | ✅ Confirmed — all present (verified in roadmap creation; unchanged). |
| `StockMovement` has **no** `branch_id` (only `warehouseId`) | Code read + live `information_schema` | ✅ Confirmed both ways. Entity has `warehouseId`, `productId`, no `branchId`; DB `stock_movements` has `warehouse_id`, `product_id`, **no `branch_id`**. |
| On-hand aggregates reach branch via a `warehouses` join | Code read (`StockMovementRepository.findActiveProductStockSummary`) | ✅ Confirmed — `LEFT JOIN warehouses w ... w.branch_id`. This is the join the denormalized column removes. |
| Next Flyway migration is **V34** | File listing | ✅ Confirmed — tree is at `V33__pos_session_card_closing.sql`; `V34` is free. No migration adds `stock_movements.branch_id` (a `V3` grep hit is a false positive — it indexes `pos_sessions.branch_id`/`audit_logs.branch_id`, never `stock_movements.branch_id`). |
| `products.branch_id`, `warehouses.branch_id` FKs exist | Live `pg_constraint` query | ✅ Confirmed — both exist as Hibernate-generated FKs (see §2.3). |

### 2.2 Column existence & nullability (live `testdb`)

| Table | Column | Type | Nullable | Notes |
|---|---|---|---|---|
| `warehouses` | `branch_id` | bigint | **YES** | ✅ Matches design; null = global warehouse. |
| `products` | `branch_id` | bigint | **YES** | ✅ Null = company-wide product. |
| `branches` | `default_warehouse_id` | bigint | **YES** | ✅ Nullable → **not guaranteed set** (see §3 finding). |
| `stock_movements` | `warehouse_id`, `product_id` | bigint | YES | Present; **`branch_id` absent** (the gap). |
| `inventory_balances` | `warehouse_id` | bigint | NO | **No `branch_id`** — materialized table, relevant to Phase 4. |
| `stock_take_sessions` | `warehouse_id` | bigint | YES | **No `branch_id`** — matches Phase 7 (branch derived via warehouse). |

### 2.3 Foreign keys (live `testdb`)

| Constraint | Child → Parent | Origin |
|---|---|---|
| `fkcyjuy4jv0nys4buvnm452bxmn` | `warehouses.branch_id` → `branches.id` | Hibernate (`@ManyToOne Warehouse.branch`) |
| `fkirxc2n6ymen0s4s4296xujgoj` | `products.branch_id` → `branches.id` | Hibernate (`@ManyToOne Product.branch`) |
| `fkjr7l2yfawhspepds7davc6xot` | `branches.default_warehouse_id` → `warehouses.id` | Hibernate (`@ManyToOne Branch.defaultWarehouse`) |
| `fk_sm_warehouse` | `stock_movements.warehouse_id` → `warehouses.id` | Flyway `V8__fk_constraints.sql` |
| `fk_sm_product` | `stock_movements.product_id` → `products.id` | Flyway `V8` |

**Nuance for Phase 1:** the branch FKs are **Hibernate-generated, not declared in Flyway**. `V8__fk_constraints.sql` deliberately does *not* cover `warehouses.branch_id` / `products.branch_id` (they are real `@ManyToOne` associations, which Hibernate constrains itself). Phase 1's new `stock_movements.branch_id` FK should be added **in the Flyway migration** (matching the `fk_sm_*` precedent), using `V8`'s proven guard pattern (skip if table/column absent, skip if FK already present, skip + `NOTICE` on orphans). `V8` is the reference implementation for the Phase-1 backfill guards.

### 2.4 Entity-level confirmations (code)

- **`Product`** — `@UniqueConstraint(columnNames = "code")` (global unique code, Approach A intact), `@Index idx_product_branch`, nullable `@ManyToOne Branch branch`. ✅
- **`Warehouse`** — nullable `@ManyToOne(LAZY) Branch branch` on `branch_id`. ✅
- **`Branch`** — nullable `@ManyToOne(LAZY) Warehouse defaultWarehouse` on `default_warehouse_id`. ✅ (nullable is the source of the §3 finding).
- **`InventoryBalance`** — **is a materialized table** (`inventory_balances`, unique `(product_id, warehouse_id)`), updated atomically per `StockMovement`. It has **no `branch_id`**. → Confirms roadmap Phase 4's "if materialized" branch is the **live** path: Phase 4 will need an additive `branch_id` here (roadmap's `V35`).
- **`StockTakeSession`** — `warehouseId`, no `branchId`. ✅ Matches Phase 7.

---

## 3. Data Quality Findings (live `testdb`)

| # | Check | Result | Verdict |
|---|---|---|---|
| E | Warehouses total / with branch / null-branch | **3 / 3 / 0** | ✅ Clean — no null-branch warehouses. |
| F | Orphan stock_movements (warehouse_id → missing warehouse) | **0** | ✅ Clean. |
| F | stock_movements with NULL warehouse_id | **0** | ✅ Clean. |
| G | Backfill projection: total / would-get-branch / stay-null | **101 / 101 / 0** | ✅ 100 % populated, none stranded. |
| H | Branches total / with default_wh / **missing** | **2 / 1 / 1** | ⚠️ **Finding F-1** — one branch has no default warehouse. |
| H | default_warehouse_id dangling / cross-branch | **0** | ✅ The one set default warehouse is valid + same-branch. |
| I | Movements by warehouse→branch | WH1→br1: 100; WH2→br2: 1 | ✅ All derivable; spans both branches. |
| J | inventory_balances branch-derivable via warehouse | 2 rows, all derivable | ✅ Ready for Phase-4 backfill. |
| K | stock_take_sessions branch-derivable via warehouse | 4 rows, all derivable | ✅ Ready for Phase-7 join. |
| L | products branch-owned / global-null | **0 / 12,181** | ✅ Entirely global catalog (Approach A). |

### Finding F-1 — Branch "Warehouse Branch" (BR02, id=2) has no `default_warehouse`

| id | name | code | default_warehouse_id | HQ? |
|---|---|---|---|---|
| 1 | HILITE BUILDING MATERIALS TRADING - L.L.C - O.P.C - BRANCH | BR-01 | 1 (valid) | yes |
| 2 | Warehouse Branch | BR02 | **NULL** | no |

This is the concrete instance of design **§14.7** ("is `Branch.defaultWarehouse` always set?"). Answer on this tenant: **no.** It is **not a Phase-1 blocker** (Phase 1 backfills from `warehouses.branch_id`, which is fully populated — it never reads `default_warehouse`). It becomes relevant at **Phase 2** (a fallback path if a write ever lacks an explicit warehouse) and is a hard prerequisite for **Phase 9** (POS/purchase default-warehouse stamping).

---

## 4. Potential Blockers

| ID | Blocker | Severity for **Phase 1** | Detail |
|---|---|---|---|
| **B-1** | **Production backfill sizing not established** | Low (advisory) | `testdb` has 101 movements — the backfill is instant here. Production tenants may have millions of rows; the exit-criterion "per-tenant backfill sizing" is **not met** for real tenants. Phase 1's migration must decide inline-`UPDATE` vs. batched backfill from real counts. Does not block *building* Phase 1; blocks *applying* it to a large tenant blind. |
| **B-2** | **13 of 14 tenant DBs un-audited** | Medium (process) | This audit covered `testdb` only. Profiles exist for: client1, client2, client4, client5, client6, demo, geebu, hilite, leroyalflowers, leroyalgifts, prod, qa, royaltools, testing. Each may have null-branch warehouses or orphans that `testdb` does not. The per-tenant audit (§7) must run before Phase 1 touches that tenant. |
| **B-3** | **Branch without default warehouse (F-1)** | None for Phase 1 · Blocks Phase 9 | See Finding F-1. No action needed to start Phase 1; flagged so it is resolved before Phase 9. |

**No hard blockers for Phase 1 exist.** B-1 and B-2 are satisfied by construction: Phase 1's migration is **idempotent, additive, nullable, and orphan-tolerant** (per the `V8` guard pattern), so it is *safe to apply* even to an un-sized or slightly-dirty tenant — but each tenant should still be sized/audited first for operational predictability.

---

## 5. Risks

| Risk | Likelihood | Impact | Mitigation (documentation only — not applied) |
|---|---|---|---|
| Backfill `UPDATE` slow/lock-heavy on a large production tenant | Unknown (unsized) | Medium | Size per tenant (§7); for very large tenants use a batched out-of-band backfill with a no-op migration guard, per roadmap Phase 1 risk note. |
| A tenant has null-branch warehouses → those movements stay `branch_id = NULL` | Possible on un-audited tenants | Low (by design: null = global/visible) | Must be *known* per tenant before enabling read-path scoping (Phase 3+), not discovered in production. Captured by the §7 per-tenant audit. |
| Orphan `warehouse_id` on some tenant → backfill silently skips those rows | Low | Low | Backfill join simply leaves them null; the `V8`-style `NOTICE` surfaces them. Flag any found in the per-tenant audit. |
| `inventory_balances` needs its own `branch_id` (materialized) | Certain | Medium (Phase 4, not Phase 1) | Roadmap already accounts for this as `V35`; confirmed here that the table is genuinely materialized and lacks `branch_id`. |
| Stale-schema hazard on existing-client upgrade | Low | High if violated | Phase 1 column is **nullable** — safe for `ddl-auto=update` fleets per `project_stale_schema_upgrade_hazard`. Confirmed the design honors this. |

---

## 6. Recommended Fixes (documentation only — NOT applied in Phase 0)

These are **recommendations to act on in the appropriate later phase**, not changes made now:

1. **(Before Phase 9, business decision)** Decide policy for branches lacking a `default_warehouse` (F-1): either mandate one per branch, or define a fallback. Set BR02's default warehouse, or confirm it is intentionally unset. — *Owner: business + engineering.*
2. **(Phase 1)** Follow the `V8__fk_constraints.sql` guard pattern for the new `stock_movements.branch_id` FK and backfill: `to_regclass`/`information_schema` existence guards, "skip if FK already present", and an orphan-tolerant backfill (`LEFT JOIN`, null stays null). Add the FK **in Flyway** (branch FKs elsewhere are Hibernate-generated; the `stock_movements` FKs are the Flyway precedent to match).
3. **(Phase 1, per large tenant)** Capture `SELECT count(*) FROM stock_movements` per tenant and choose inline vs. batched backfill accordingly.
4. **(Phase 4)** Plan the additive `inventory_balances.branch_id` (roadmap `V35`) — confirmed necessary since `InventoryBalance` is materialized.
5. **(Ongoing)** Re-run §7's diagnostic script against every tenant DB and archive results before that tenant proceeds to Phase 1.

**Nothing above was executed.** No SQL that mutates data was run; every query in this audit was read-only (`SELECT`/`information_schema`/`pg_constraint`).

---

## 7. Per-Tenant Audit Script (to run before Phase 1 on each tenant)

Read-only. Run against each tenant DB; archive the output alongside this report. (This is the exact diagnostic set used for `testdb`.)

```sql
-- 1. Branch columns/FKs present & nullable
SELECT table_name, column_name, is_nullable
FROM information_schema.columns
WHERE table_schema='public'
  AND (table_name,column_name) IN
      (('warehouses','branch_id'),('products','branch_id'),
       ('branches','default_warehouse_id'),('inventory_balances','warehouse_id'),
       ('stock_take_sessions','warehouse_id'),('stock_movements','warehouse_id'));

-- 2. stock_movements must NOT already have branch_id (proves Phase 1 not yet applied)
SELECT count(*) AS has_branch_id_col FROM information_schema.columns
WHERE table_schema='public' AND table_name='stock_movements' AND column_name='branch_id';

-- 3. Warehouse branch coverage + null-branch detail
SELECT count(*) total, count(branch_id) with_branch, count(*)-count(branch_id) null_branch FROM warehouses;
SELECT id, name, status FROM warehouses WHERE branch_id IS NULL ORDER BY id;

-- 4. Orphans + null warehouse_id on the ledger
SELECT count(*) AS orphan_movements FROM stock_movements sm
WHERE sm.warehouse_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM warehouses w WHERE w.id = sm.warehouse_id);
SELECT count(*) AS null_wh_movements FROM stock_movements WHERE warehouse_id IS NULL;

-- 5. Backfill sizing + projection
SELECT count(*) total_movements,
       count(*) FILTER (WHERE w.branch_id IS NOT NULL) would_get_branch,
       count(*) FILTER (WHERE sm.warehouse_id IS NOT NULL AND w.branch_id IS NULL) stay_null_wh_no_branch,
       count(*) FILTER (WHERE sm.warehouse_id IS NULL) stay_null_no_wh,
       count(*) FILTER (WHERE sm.warehouse_id IS NOT NULL AND w.id IS NULL) stay_null_orphan
FROM stock_movements sm LEFT JOIN warehouses w ON w.id = sm.warehouse_id;

-- 6. Branch.defaultWarehouse coverage (§14.7)
SELECT count(*) total_branches, count(default_warehouse_id) with_default_wh,
       count(*)-count(default_warehouse_id) missing_default_wh FROM branches;
SELECT b.id, b.name, b.default_warehouse_id, w.id AS wh_exists, w.branch_id AS wh_branch
FROM branches b LEFT JOIN warehouses w ON w.id = b.default_warehouse_id
WHERE b.default_warehouse_id IS NOT NULL AND (w.id IS NULL OR w.branch_id IS DISTINCT FROM b.id);
```

**Green criteria per tenant:** query 2 returns `0`; queries 3–4 orphan/null counts are `0` (or documented); query 5 `stay_null_*` are `0` (or the null-branch warehouses are business-confirmed as intentionally global); query 6 missing-default-wh is captured (not a Phase-1 blocker).

---

## 8. Phase 0 Exit-Criteria Checklist

Roadmap Phase 0 exit: *"Written go/no-go with per-tenant backfill sizing and the null-branch-warehouse list; sign-off that the 'null = global' outcome is acceptable for those rows."*

| Exit criterion | Status | Note |
|---|---|---|
| Backfill row-count estimate captured per tenant DB | ⚠️ **Partial** | `testdb` sized (101, instant). Other 13 tenants pending — B-1/B-2. |
| Null-branch warehouse list reviewed with business | ✅ / ⚠️ | `testdb`: **none exist** (nothing to review). Other tenants pending §7. |
| No orphan `warehouse_id`, or orphans documented | ✅ | `testdb`: zero orphans. Other tenants pending §7. |
| `products.branch_id` / `warehouses.branch_id` exist on every tenant | ✅ (testdb) / ⚠️ (others) | Confirmed on `testdb`; §7 confirms per tenant. |
| Written go/no-go | ✅ | This report (§9). |

---

## 9. Go / No-Go Recommendation

### ✅ GO for Phase 1 — conditional

**On `testdb`, Phase 1 is unconditionally safe:** schema is ready, data is clean, backfill would populate 100 % of movements with nothing stranded, and no blockers exist.

**The condition is operational, not technical:** before Phase 1's migration is *applied to any given production tenant*, run the §7 per-tenant audit against that tenant and archive the result (closes B-1 sizing and B-2 coverage). Because Phase 1's migration is additive, nullable, idempotent, and orphan-tolerant by construction, this is a **prudence gate, not a correctness gate** — a tenant with a null-branch warehouse or a slow backfill is *handled safely*, it just must not be a *surprise*.

**Explicitly NOT blockers:** Finding F-1 (branch without default warehouse) does not affect Phases 1–2; it is owed as a business decision before Phase 9.

**Do not start Phase 1 until** the reviewer of this report signs off on the GO and the Approach-A catalog decision (§14.1) is formally confirmed (the data already reflects it — all products global).

---

## Appendix — Evidence summary (live `testdb`, 2026-07-11)

```
Tables present:            branches, inventory_balances, products, stock_movements,
                           stock_take_sessions, warehouses          → all present
stock_movements.branch_id: ABSENT                                    → gap confirmed
Branch FKs:                warehouses.branch_id→branches (HB),
                           products.branch_id→branches (HB),
                           branches.default_warehouse_id→warehouses (HB),
                           stock_movements.warehouse_id/product_id (Flyway V8)
Row counts:                products 12,181 · stock_movements 101 · warehouses 3 ·
                           branches 2 · inventory_balances 2 · stock_take_sessions 4
Warehouses:                3 total / 3 with branch / 0 null-branch
Orphan movements:          0 · null warehouse_id: 0
Backfill projection:       101 total / 101 would-get-branch / 0 stranded
Branch default warehouse:  2 branches / 1 set / 1 MISSING (BR02)     → Finding F-1
Products branch dist:      0 branch-owned / 12,181 global-null       → Approach A intact
Toggle inventory.branch-scope.enabled: NOT present                   → Phase 3 introduces it
```

*All queries read-only. No data modified. No migration created. No entity/repository/service/controller/frontend/API changed.*
