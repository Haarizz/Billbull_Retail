# Branch-Level Inventory — Implementation Roadmap

> **Status: APPROVED FOR EXECUTION. Phase 1 landed (`V34`).**
>
> **⚠️ REVISED 2026-07-11 — scope expanded to "branch-scope everything".** Design is locked in [`01-branch-level-inventory.md`](01-branch-level-inventory.md), now **Approach C applied module-wide** (branch-scoped everything, `NULL` = shared/global) — not the original Approach A. This changes the phase set: **master data (Departments, Sub-Departments, Brands, Units, Products, Barcodes) is now in scope**, adding new phases **6A, 6B, 9A** and a uniqueness-migration step. See the [Revision Changelog](#revision-changelog--2026-07-11-branch-scope-everything) at the end. This document is the execution plan; it does **not** authorize coding ahead of the phase it describes.
>
> **Golden rules for every phase below**
> - Each phase is **independently deployable** and leaves production behaviour unchanged until a feature toggle is flipped.
> - All schema changes are **additive, nullable, and type-guarded** (`to_regclass` / `information_schema`) per the stale-schema convention (`project_stale_schema_upgrade_hazard`). No column dropped, narrowed, or set NOT NULL; no data deleted. **The one exception is the uniqueness migration (Phase 6A): it drops *global* unique constraints and replaces them with stricter-or-equal partial unique indexes — no data is deleted, and existing all-null rows satisfy the new indexes immediately.**
> - The read-path behaviour change is gated by **`inventory.branch-scope.enabled`** (default `false`), toggled per tenant like the existing `rbac.<module>.enabled` flags.
> - Legacy `branch_id IS NULL` rows are **always visible** (the proven "null = shared/global" rule already implemented in `BranchAccessService`). **This applies to master data too** — existing global Departments/Brands/Units/Products stay visible in every branch with zero data migration.

## Baseline verified against the codebase (2026-07-11)

| Design assumption | Verified? | Note |
|---|---|---|
| `BranchAccessService.ListScope` / `currentListScope()` exist | ✅ | `settings/branch/BranchAccessService.java` — `ListScope(allBranches, branchIds)` record, `currentListScope()`, `currentExactScope()`, `canAccessBranch(userId, branchId)`, `assertWarehouseMatchesBranch(...)` all present. |
| `StockMovement` has **no** `branch_id` | ✅ | `purchase/stockmovement/StockMovement.java` — only `warehouseId`. Indexes: `idx_sm_product_id`, `idx_sm_warehouse_id`, `idx_sm_product_source_created`. |
| On-hand aggregates join `warehouses` to reach branch | ✅ | `findActiveProductStockSummary(branchId)` already does `LEFT JOIN warehouses w ... w.branch_id = :branchId`. This is precisely the join the denormalized column eliminates. |
| Next Flyway version | ⚠️ correction | Design doc says "V30 latest"; tree is at **V33** (`V33__pos_session_card_closing.sql`). **The new migration is `V34`.** All version numbers below are relative to this. |
| `products.branch_id`, `warehouses.branch_id` FKs exist | ✅ confirmed live | Phase 0 audit confirmed on `testdb` (Hibernate-generated FKs). |
| **Only `products` + `warehouses` have `branch_id` today** | ✅ confirmed live (2026-07-11) | All other inventory tables (`departments`, `sub_departments`, `brands`, `units`, `bins`, `bin_stock`, `barcode_templates`, `product_barcodes`, `inventory_balances`, `batch_master`, `stock_take_sessions`, `stock_take_items`, `stock_transfers`) **need a new nullable `branch_id`** — added by the new master-data phases. `stock_movements.branch_id` added by Phase 1 (`V34`). |
| **Global unique constraints exist on master data** | ✅ confirmed live | `products(code)`, `departments(code)`, `sub_departments(code)`+`(name,department_id)`, `brands(code)`+`(name)`, `units(name)`+`(symbol)` — all **global**; Phase 6A relaxes them to per-branch + global-null partial indexes. |

---

## Phase map

| # | Phase | Ships behaviour change? | Toggle-gated? | Complexity |
|---|---|---|---|---|
| 0 | Pre-flight audit & data hygiene | No | n/a | S |
| 1 | Additive schema: `stock_movements.branch_id` + backfill ✅ **DONE** | No | n/a | S |
| 2 | Write-path stamping | No (data only) | No | M |
| 3 | Branch-scoped aggregate repo methods + feature toggle | No (dormant code) | Yes (off) | M |
| 4 | Inventory balance & on-hand reads | Yes (behind toggle) | Yes | M |
| 5 | Warehouse / Bin list scoping | Yes (behind toggle) | Yes | S |
| **6A** | **NEW — Master-data schema: `branch_id` + per-branch uniqueness (dormant)** | No (schema only) | n/a | M |
| **6B** | **NEW — Master-data list/create scoping (Dept/Sub-Dept/Brand/Unit)** | Yes (behind toggle) | Yes | M |
| 6 | Product list/search + catalog identity scoping | Yes (behind toggle) | Yes | M |
| 7 | Stock-take scoping | Yes (behind toggle) | Yes | M |
| 8 | Stock-transfer cross-branch rules | Yes (behind toggle) | Yes | L |
| **9A** | **NEW — Barcode branch-scoping + branch-first resolution (global fallback)** | Yes (behind toggle) | Yes | M |
| 9 | POS availability scoping | Yes (behind toggle) | Yes | M |
| 10 | Inventory reports (active vs. All-Branches) | Yes (behind toggle) | Yes | M |
| 11 | Frontend labels & branch indicators (stock **+ master data**) | Yes (cosmetic) | Follows toggle | M |
| 12 | Per-tenant rollout & toggle-on | Yes (opt-in) | Flip | S |
| 13 | (Optional) `product_branch_availability` — hide *shared* items per branch | Yes | New toggle | L |
| **14** | **(Optional, post-rollout) Global → Branch Conversion Wizard** | Yes (new admin tool) | Admin/permission | L |

Complexity key: **S** ≤ ~1 day · **M** ~2–4 days · **L** ~1 week+ (one engineer, incl. tests).

**Governance & validation (design §15/§16), added 2026-07-11:** master-data *creation* governance is **configurable** (`inventory.global-master.creation-enabled` + `.allowed-roles`) and cross-branch **reference validation** (a branch record may reference own-branch or global masters only) are both delivered in **Phase 6B** (and reused by Phase 6/8). They are not separate phases — folded into the master-data write path.

**Sequencing note:** Phases 6A/6B/9A are additive insertions; the original phases keep their numbers. Dependency-wise: 6A (schema) has no dependency beyond Phase 0 and can land early alongside Phase 1–3; 6B depends on 6A + the toggle (Phase 3); 6 (products) depends on 6A for the uniqueness change; 9A depends on 6A + Phase 3. Master-data phases (6A/6B) and the ledger phases (1–5) are **independent tracks** that converge at Phase 11 (frontend) and Phase 12 (rollout).

---

## Phase 0 — Pre-flight audit & data hygiene

**Objective.** Prove the data is safe to denormalize before touching schema. No code ships.

**Scope.** Read-only diagnostics + a written go/no-go.

**Files/modules affected.** None (diagnostics via SQL / a throwaway `DbDiag`-style query). Optionally a short findings note under `docs/future-enhancements/`.

**Database changes.** None. Diagnostic queries only:
- Count `warehouses WHERE branch_id IS NULL` (backfill blind spots — these movements stay null/global).
- Count `stock_movements sm JOIN warehouses w ... WHERE w.branch_id IS NULL` (rows that will *remain* null after backfill).
- Confirm `products.branch_id` and `warehouses.branch_id` columns + FKs actually exist (design §1.1 assumes so).
- Row count of `stock_movements` (sizing the backfill `UPDATE`).
- Any `stock_movements` with `warehouse_id` pointing at a non-existent warehouse (orphans).

**Backend changes.** None.

**Frontend changes.** None.

**API changes.** None.

**Risks.** Discovering warehouses with null `branch_id` → those movements can't be backfilled and remain company-global. That's acceptable (null = visible to all) but must be *known* before rollout, not discovered in production. Orphan `warehouse_id` values would break the backfill join silently (they simply won't be updated — fine, but flag them).

**Testing checklist.**
- [ ] Backfill row-count estimate captured per tenant DB.
- [ ] List of null-branch warehouses reviewed with the business (are they intentionally global?).
- [ ] No orphan `warehouse_id` on `stock_movements`, or orphans documented.
- [ ] Confirmed `products.branch_id` / `warehouses.branch_id` exist on every tenant.

**Estimated complexity.** S.

**Dependencies.** None.

**Exit criteria.** Written go/no-go with per-tenant backfill sizing and the null-branch-warehouse list; sign-off that the "null = global" outcome is acceptable for those rows.

---

## Phase 1 — Additive schema: `stock_movements.branch_id` + backfill

**Objective.** Land the denormalized branch column and populate it. **Zero behaviour change** — nothing reads the column yet.

**Scope.** One Flyway migration.

**Files/modules affected.**
- `billbull-backend/src/main/resources/db/migration/V34__stock_movement_branch_id.sql` (new).
- `purchase/stockmovement/StockMovement.java` — add the nullable `branchId` field + getter/setter + index annotations (so Hibernate `validate` passes once tenants baseline; the column already exists from Flyway).

**Database changes.**
- `ALTER TABLE stock_movements ADD COLUMN branch_id BIGINT NULL` (guarded: only if column absent).
- FK → `branches(id)` (guarded; nullable, `ON DELETE` left as existing convention — likely no cascade).
- Indexes `idx_sm_branch_product (branch_id, product_id)` and `idx_sm_branch_warehouse (branch_id, warehouse_id)` (guarded `IF NOT EXISTS` / `to_regclass`).
- Backfill: `UPDATE stock_movements sm SET branch_id = w.branch_id FROM warehouses w WHERE sm.warehouse_id = w.id AND sm.branch_id IS NULL;`
- Column stays **nullable** forever (legacy/global rows keep null).

**Backend changes.** Entity field only (no service logic). Add matching `@Index` entries to `StockMovement`'s `@Table` so schema + entity stay consistent.

**Frontend changes.** None.

**API changes.** None.

**Risks.**
- Backfill `UPDATE` on the largest table can be slow / lock-heavy on big tenants. Mitigation: run in the migration (single statement is usually fine on Postgres with `HOT` updates), but for very large tenants consider a batched backfill script run out-of-band and a no-op guard in the migration. Decide per Phase 0 sizing.
- Stale-schema hazard: column must be nullable (it is) — safe for existing-client `ddl-auto=update` DBs.

**Testing checklist.**
- [ ] Migration is idempotent (re-run on an already-migrated DB is a no-op).
- [ ] On a fresh DB: column + indexes + FK created.
- [ ] On a seeded DB with movements: every movement whose warehouse has a branch gets `branch_id` populated; null-branch-warehouse movements stay null.
- [ ] `mvn -o compile` + Hibernate boots clean (entity ↔ column match).
- [ ] Existing `StockMovementRepository` queries unaffected (unit suite green).

**Estimated complexity.** S.

**Dependencies.** Phase 0.

**Exit criteria.** Migration applied on staging for at least one large tenant; spot-check `SELECT count(*) FROM stock_movements WHERE branch_id IS NULL` matches the Phase 0 prediction; app boots; no behaviour change observable.

---

## Phase 2 — Write-path stamping

**Objective.** Every **new** `StockMovement` carries the correct `branch_id`, derived from its warehouse. Reads still ignore the column, so no user-visible change — but from now on the column is trustworthy for new data.

**Scope.** `StockMovementService` write paths and all callers that build movements.

**Files/modules affected.**
- `purchase/stockmovement/StockMovementService.java` — central stamping point.
- Callers that construct `StockMovement` directly (audit for these): GRN receipt, purchase invoice, direct purchase, `sales/delivery/DeliveryNoteService`, sales-invoice deductions, `inventory/stocktake/*` adjustments, `inventory/stocktransfer/*`, POS checkout deductions. Prefer a **single choke point** in `StockMovementService.save(...)` that resolves branch from `warehouseId` so callers don't each need editing.

**Database changes.** None.

**Backend changes.**
- In the movement-write choke point: look up the warehouse's branch and set `movement.branchId`. Reuse `BranchAccessService.assertWarehouseMatchesBranch(warehouse, documentBranchId, label)` where a document branch is known, to catch a warehouse that doesn't belong to the document's branch.
- Where the caller already knows the branch (sales/purchase docs are branch-scoped), pass it and assert consistency; where only the warehouse is known (pure inventory ops), derive from `warehouse.branch_id`.
- Null-safe: if the warehouse has no branch, stamp null (stays global) — no exception.

**Frontend changes.** None.

**API changes.** None.

**Risks.**
- Missing a caller that bypasses the choke point → some new movements land with null branch. Mitigation: route **all** inserts through `StockMovementService`; add a defensive `@PrePersist`-style guard or a nightly reconciliation query that flags recently-created null-branch movements whose warehouse *does* have a branch.
- An over-strict `assertWarehouseMatchesBranch` could start rejecting previously-accepted writes. Mitigation: the assert already treats global warehouses / null document-branch permissively — verify no legitimate flow regresses; keep assertions where a document branch is authoritative, derive silently elsewhere.

**Testing checklist.**
- [ ] Unit: `StockMovementService` stamps branch from warehouse for a branch-owned warehouse.
- [ ] Unit: null-branch warehouse → movement.branchId null, no throw.
- [ ] Unit: warehouse/branch mismatch on a branch-stamped document → 400 (assert fires).
- [ ] Integration/manual: run a GRN, a sale, a stock-take adjustment, a transfer, a POS sale → inspect the resulting movements all carry the expected branch.
- [ ] Reconciliation query: no new null-branch movements against branch-owned warehouses after deploy.

**Estimated complexity.** M (the work is *finding every writer*, not the stamping logic).

**Dependencies.** Phase 1.

**Exit criteria.** For a defined soak window on staging, 100% of newly-created movements against branch-owned warehouses have a non-null, correct `branch_id`; the caller audit is documented (list of every movement writer and how each resolves branch).

---

## Phase 3 — Branch-scoped aggregate repo methods + feature toggle

**Objective.** Add the branch-aware query variants and the master toggle — all **dormant**. No path calls them yet.

**Scope.** `StockMovementRepository`, `InventoryBalanceRepository` (if materialized), config property.

**Files/modules affected.**
- `purchase/stockmovement/StockMovementRepository.java` — add `...AndBranchIdIn(...)` variants of the on-hand SUM / net-available / valuation queries. Keep every existing unscoped method untouched (admin / All-Branches path).
- `application*.properties` — introduce `inventory.branch-scope.enabled` (default `false`) in base `application.properties`; leave overrides to per-tenant profiles later.
- A small `InventoryBranchScopeProperties` / `@Value` holder + a helper (e.g. on `BranchAccessService` or a new `InventoryScopeResolver`) that returns the `ListScope` **only when the toggle is on**, otherwise signals "no scoping."

**Database changes.** None (new query methods reuse existing indexes + the Phase 1 composite indexes).

**Backend changes.**
- New repository methods mirroring the hot ones: `getTotalAvailableStockForProducts`, `getAvailableStockForProductsInWarehouse`, `findAllStockGroupedByProductAndWarehouse`, `getNetAvailableStock*`, `findActiveProductStockSummary` (already branch-parametrized — can be reused), each with a `branchIds IN (:ids) OR branch_id IS NULL` predicate.
- Toggle plumbing only; nothing wired into service reads yet.

**Frontend changes.** None.

**API changes.** None.

**Risks.** Low — dead code until wired. Main risk is query correctness (null-branch inclusion). Mitigation: unit-test the new methods directly against an embedded/H2-incompatible… → test against a real Postgres slice (native queries use Postgres casts), matching how existing repo tests run.

**Testing checklist.**
- [ ] Unit/repo test: branch-scoped SUM returns only in-branch + null-branch rows.
- [ ] Unit: toggle off → resolver reports "unscoped"; toggle on → returns active `ListScope`.
- [ ] Existing unscoped methods unchanged (regression-green).
- [ ] `mvn -o test` green.

**Estimated complexity.** M.

**Dependencies.** Phase 1 (indexes), Phase 2 (trustworthy data — not strictly required to *add* methods, but required before *enabling*).

**Exit criteria.** New methods merged and unit-tested; toggle present and defaulting off; no runtime behaviour change (grep confirms no caller yet).

---

## Phase 4 — Inventory balance & on-hand reads (behind toggle)

**Objective.** On-hand/available computations respect the active branch **when the toggle is on**; identical to today when off.

**Scope.** `InventoryBalanceService` and any service computing on-hand for display (not POS or reports — those are Phases 9/10).

**Files/modules affected.**
- `inventory/balance/InventoryBalanceService.java` (and `InventoryBalance` if materialized — add `branch_id` there in a follow-on additive migration `V35` if it's a real table; if derived, no schema).
- `inventory/warehouse/WarehouseStockService` (uses `findStockByWarehouse`).

**Database changes.** Only if `InventoryBalance` is a materialized table: additive nullable `branch_id` + backfill (mirror Phase 1) as `V35`. If it's computed on the fly, none.

**Backend changes.** Branch-aware branch: when `inventory.branch-scope.enabled` **and** `BranchScope` applies (not All-Branches), call the Phase-3 scoped aggregates; else the existing unscoped ones. Wrap the decision in the Phase-3 resolver so the toggle logic lives in one place.

**Frontend changes.** None yet (labels in Phase 11).

**API changes.** Behavioural only, gated: on-hand figures returned by existing endpoints become branch-specific when the toggle is on for that tenant.

**Risks.** On-hand appearing to "drop" when the toggle flips (it's now per-branch, not company-wide) — expected, but must be communicated. Mitigation: this is exactly why rollout is per-tenant + toggle; validate figures in Phase 12 before flipping.

**Testing checklist.**
- [ ] Toggle off → identical numbers to pre-change (byte-for-byte on a fixture).
- [ ] Toggle on, branch A active → on-hand = SUM over A's warehouses (+ null-branch).
- [ ] Toggle on, All-Branches (admin) → consolidated totals (unscoped path).
- [ ] Null-branch legacy stock still visible in every mode.

**Estimated complexity.** M.

**Dependencies.** Phase 3.

**Exit criteria.** With toggle off, zero diff vs. production; with toggle on in a test tenant, per-branch on-hand matches a hand-computed control set for 3+ products across 2 branches.

---

## Phase 5 — Warehouse / Bin list scoping (behind toggle)

**Objective.** Warehouse and bin **list** endpoints filter to the active branch when the toggle is on; single-record access still permissive for admins.

**Scope.** `WarehouseService`, `BinService`, `BinStockController`.

**Files/modules affected.**
- `inventory/warehouse/WarehouseService.java`, `.../BinService`, `.../BinStockController`.

**Database changes.** None (warehouses already have `branch_id`).

**Backend changes.**
- List endpoints: push `currentListScope()` into the query (or `filterBranchScopedByBranch(...)` for small lists) — gated by toggle.
- Create/update: assert the chosen branch is accessible (`canAccessBranch` / `assertTransactionBranchAccessible`).
- Bins inherit branch via their warehouse — filter by the warehouse's branch.

**Frontend changes.** None yet.

**API changes.** Warehouse/bin lists become branch-scoped when toggle on. Admins in All-Branches see everything.

**Risks.** A user losing sight of a warehouse they legitimately use cross-branch. Mitigation: null-branch (global) warehouses always visible; verify the business has no shared warehouses that should appear everywhere but carry a branch_id.

**Testing checklist.**
- [ ] Toggle off → full warehouse/bin lists (unchanged).
- [ ] Toggle on, branch A → only A's + global warehouses.
- [ ] Admin All-Branches → all warehouses.
- [ ] Create warehouse under a branch the user can't access → 403.

**Estimated complexity.** S.

**Dependencies.** Phase 3.

**Exit criteria.** List scoping demonstrated for a restricted user and an admin; no regression with toggle off.

---

## Phase 6A — Master-data schema: `branch_id` + per-branch uniqueness (NEW, dormant)

**Objective.** Land the additive `branch_id` on every inventory master table and switch global unique constraints to per-branch + global-null partial indexes. **Zero behaviour change** — nothing filters on the new columns yet, and existing all-null data satisfies the new indexes immediately.

**Scope.** One (or two) Flyway migrations + entity fields.

**Files/modules affected.**
- New `V35__inventory_master_branch_id.sql` (add `branch_id` to `departments`, `sub_departments`, `brands`, `units`, `barcode_templates`, `product_barcodes`; FKs guarded; `(branch_id)` indexes).
- New `V36__inventory_master_unique_per_branch.sql` (drop global unique constraints; add paired partial unique indexes). *May be merged into V35; kept separate here for reviewability and independent rollback.*
- Entity fields: add nullable `branchId` (+ getter/setter + index annotations) to `Department`, `SubDepartment`, `Brand`, `Unit`, `BarcodeTemplate`, `ProductBarcode`. (`Product` already has `branch`.) Update the `@Table` `uniqueConstraints`/`@Index` to match the new partial-index scheme (or drop the JPA `uniqueConstraints` and rely on the Flyway partial indexes, documenting that the DB owns uniqueness).

**Database changes.**
- `ADD COLUMN IF NOT EXISTS branch_id BIGINT` on the six master tables (guarded), FK → `branches(id)` via the `V8` pattern, `(branch_id)` index each.
- For each uniqueness column (`products.code`, `departments.code`, `sub_departments.code`, `sub_departments(name, department_id)`, `brands.code`, `brands.name`, `units.name`, `units.symbol`):
  - `ALTER TABLE t DROP CONSTRAINT IF EXISTS <name>` — resolve the actual constraint name dynamically from `pg_constraint` (Hibernate names them `uk<hash>`; look them up rather than hard-coding).
  - `CREATE UNIQUE INDEX IF NOT EXISTS ux_t_col_global ON t (col) WHERE branch_id IS NULL;`
  - `CREATE UNIQUE INDEX IF NOT EXISTS ux_t_col_branch ON t (col, branch_id) WHERE branch_id IS NOT NULL;`
- No `branch_id` backfill for master data (existing rows stay NULL = shared/global — the confirmed decision).

**Backend changes.** Entity fields + index annotations only. No service logic.

**Frontend changes.** None. **API changes.** None.

**Risks.**
- **Dropping a unique constraint is the one non-purely-additive step.** Mitigation: it is stricter-or-equal for existing (all-null) rows; guard with dynamic constraint-name resolution + `IF EXISTS`; the two partial indexes are created in the same migration so uniqueness is never unenforced. **Per-tenant pre-check (like Phase 0):** confirm no existing data would violate the null-tier index (it can't, since all rows are null-branch and the old global constraint already guaranteed uniqueness among them).
- Hibernate re-adding a dropped `uk<hash>` on boot if the entity still declares `uniqueConstraints`. Mitigation: remove the JPA `uniqueConstraints` from the entity in the same change so Hibernate does not recreate the global constraint; the DB partial indexes own uniqueness.

**Testing checklist.**
- [ ] Migration idempotent (re-run is a no-op; partial indexes `IF NOT EXISTS`).
- [ ] On seeded data: two branches can now insert the same `code` with different `branch_id`; a second global (null) row with the same code is rejected.
- [ ] Existing all-null rows unaffected; no duplicate-key error on boot.
- [ ] Hibernate does not recreate the global unique constraint (verify `pg_constraint` after boot).
- [ ] `mvn -o compile` + boot clean.

**Estimated complexity.** M.

**Dependencies.** Phase 0 (audit pattern). Independent of Phases 1–5.

**Exit criteria.** Columns + partial indexes present on staging; a branch can reuse a code that another branch/global uses; global-null uniqueness still enforced; no behaviour change with the toggle off.

---

## Phase 6B — Master-data list/create scoping + configurable governance + reference validation (behind toggle)

**Objective.** Department/Sub-Department/Brand/Unit **list/search** show the active branch's rows + global rows; **create** stamps the active branch (or null for a global item, per **configurable governance**); every branch-scoped reference is validated so a branch record never references another branch's master (**§16 validation matrix**). Identical to today when the toggle is off.

**Scope.** `DepartmentService`, `SubDepartmentService`, `BrandService`, `UnitService` (+ controllers), plus two new cross-cutting pieces (governance config + a reference-validation helper) reused by Phase 6 and Phase 8.

**Files/modules affected.**
- `inventory/department/DepartmentService.java`, `inventory/subdepartment/SubDepartmentService.java`, `inventory/brand/BrandService.java`, `inventory/units/UnitService.java` and their controllers.
- **NEW** `InventoryGlobalMasterProperties` (or `@Value` holder) reading `inventory.global-master.creation-enabled` + `inventory.global-master.allowed-roles`.
- **NEW** `assertMasterReferenceAccessible(parentBranchId, childBranchId, label)` helper (on `BranchAccessService` or a small `InventoryReferenceValidator`) encoding the §16 rule: ALLOW iff `parent IS NULL OR parent == child`; plus a global-child guard (a null-branch child may reference only null-branch parents).
- `application.properties` — `inventory.global-master.creation-enabled=true`, `inventory.global-master.allowed-roles=SUPER_ADMIN,ADMIN` (defaults).

**Database changes.** None (uses Phase-6A columns/indexes).

**Backend changes.**
- **List/search:** push `currentListScope()` (`branch_id IN (:ids) OR branch_id IS NULL`) into queries when the toggle is on.
- **Create — configurable governance (design §15):**
  - If the caller requests a **global** (null-branch) item: allow only when `creation-enabled=true` **and** the caller's role ∈ `allowed-roles`; otherwise reject with "Only {roles} may create shared/global master data on this tenant."
  - Otherwise stamp `branch_id` from `getRequiredCurrentUserBranch()` (branch-private).
- **Reference validation (design §16):** on create/update, for each branch-scoped reference (e.g. Sub-Department→Department), call `assertMasterReferenceAccessible(...)` — reject a reference to another branch's master; reject a branch parent under a global child.
- Update/delete: `assertTransactionBranchAccessible(branchId, label)`; editing a global row also requires an `allowed-roles` member (design §15 note).
- Surface a friendly "code already used in this branch" message when the per-branch partial index rejects a duplicate.
- **All new asserts gated by `inventory.branch-scope.enabled`** — a toggle-off tenant sees no new rejections.

**Frontend changes.** None yet (labels + create-scope indicator in Phase 11). **API changes.** Master lists become branch-scoped under toggle; create accepts/derives branch subject to governance; invalid cross-branch references return a clear 400. Backward compatible when toggle off.

**Risks.**
- A branch losing sight of a genuinely shared department/brand. Mitigation: global (null) rows always visible; only branch-private rows are hidden.
- Governance misconfiguration locking out legitimate creators. Mitigation: default is permissive (`creation-enabled=true`, `SUPER_ADMIN,ADMIN`); clear error messages; per-tenant override.
- An over-strict reference validator rejecting a legitimate global reference. Mitigation: the rule explicitly allows `parent IS NULL`; unit-test the global-parent path.

**Testing checklist.**
- [ ] Toggle off → full master lists + no new rejections (unchanged).
- [ ] Toggle on, branch A → A's rows + global rows only.
- [ ] Admin All-Branches → all rows.
- [ ] Create under branch A stamps `branch_id = A`; allowed-role admin in All-Branches → null (global).
- [ ] **Governance:** disallowed role attempting a global create → rejected; `creation-enabled=false` → all creates are branch-stamped / global create rejected.
- [ ] **Validation matrix:** Sub-Dept in A referencing a Dept in A ✅; referencing a global Dept ✅; referencing a Dept in B ❌; global Sub-Dept referencing a branch Dept ❌.
- [ ] Two branches create the same code successfully; same-branch duplicate rejected with a clear error.

**Estimated complexity.** M.

**Dependencies.** Phase 6A (schema/uniqueness), Phase 3 (toggle + `ListScope` resolver). **Design decisions §14.9 (governance — now configurable) resolved.**

**Exit criteria.** Master-data lists branch-scoped (+ global); configurable governance enforced (roles/tenant); §16 reference validation rejects cross-branch references and global-child→branch-parent; per-branch uniqueness works; toggle-off byte-identical.

---

## Phase 6 — Product list/search + catalog identity scoping (behind toggle)

**Objective.** The **product catalog is branch-scoped** (CHANGED from Approach A): list/search show the active branch's products + global products; the **stock/on-hand column** reflects the active branch. Catalog code uniqueness is now per-branch + global-null (from Phase 6A).

**Scope.** `ProductService` list/search, product DTO assembly, code/lookup resolution.

**Files/modules affected.**
- `inventory/product/ProductService.java` — list/search (catalog identity) **and** the on-hand enrichment paths (`getTotalAvailableStockForProducts` / `findActiveProductStockSummary`).

**Database changes.** None (products already have `branch_id`; uniqueness handled in Phase 6A).

**Backend changes.**
- **Catalog identity (CHANGED):** branch-filter list/search via `currentListScope()` (`branch_id IN (:ids) OR branch_id IS NULL`) — a branch sees its own products + global products, not another branch's private products.
- On-hand enrichment: swap to the Phase-3 branch-scoped aggregate when toggle on + branch active; consolidated when All-Branches (reuse `findActiveProductStockSummary(branchId)`).
- Code/SKU resolution: active-branch-first, then global fallback (§design 2.11).
- **Reference validation (design §16):** on product create/update, validate Department / Sub-Department / Brand / Unit references via the Phase-6B `assertMasterReferenceAccessible(...)` helper — a branch product may reference own-branch or global masters only; a global product may reference only global masters. Governance (design §15) applies to creating a global product.

**Frontend changes.** None yet (column label + catalog scoping copy in Phase 11).

**API changes.** Product list is now branch-scoped (identity + on-hand) under toggle; optional `?branchScope=active|all` for admins. **Behaviour change vs. original Approach A** (which kept catalog identity global) — documented in the changelog.

**Risks.** Hiding a shared product if the global-fallback is missed. Mitigation: `ListScope` always includes `OR branch_id IS NULL`; a test that a global product is visible in every branch. Search/pagination performance mitigated by the `(branch_id)` / Phase-1 composite indexes and DB-pushed `ListScope`.

**Testing checklist.**
- [ ] Toggle off → product list + stock identical to today.
- [ ] Toggle on, branch A → A's products + global products; **not** branch B's private products.
- [ ] Global (null-branch) product visible in every branch.
- [ ] Stock column = active-branch on-hand; Admin All-Branches → consolidated.
- [ ] Two branches with same-code private products both resolve correctly by code (branch-first).
- [ ] **Reference validation:** a branch product referencing another branch's Department/Brand/Unit is rejected; referencing own-branch or global is allowed.
- [ ] Pagination + search index-backed (query plan on a large tenant).

**Estimated complexity.** M.

**Dependencies.** Phase 3, Phase 4, **Phase 6A (uniqueness)**, **Phase 6B (`assertMasterReferenceAccessible` helper + governance config)**.

**Exit criteria.** Product list branch-scoped (identity + on-hand); global products visible everywhere; branch-private products isolated; per-branch code resolution correct; cross-branch master references rejected; toggle-off byte-identical.

---

## Phase 7 — Stock-take scoping (behind toggle)

**Objective.** Stock-take sessions list and operate within the active branch.

**Scope.** `inventory/stocktake/*` (`StockTakeService`, controllers, session creation).

**Files/modules affected.**
- `inventory/stocktake/StockTakeService.java` and session/list controllers.
- Optional additive migration `V36__stock_take_session_branch_id.sql` (nullable, backfilled from warehouse) — **only if** deriving via join proves too slow; start with the join.

**Database changes.** Optional `stock_take_sessions.branch_id` (additive, nullable, backfilled). Prefer join-derivation first (design §5.3 marks this optional).

**Backend changes.**
- Session list: filter by active branch (via the session's warehouse's branch) when toggle on.
- New session: warehouse already ties to a branch; assert the user can access it. Snapshot queries (`findStockTakeSnapshotIdentities`) already scope by warehouse — inherently branch-correct.

**Frontend changes.** None yet.

**API changes.** Stock-take session list becomes branch-scoped under toggle.

**Risks.** Per-unit batch-number model (`BatchNumberGenerator`, `-1..-N` rows) must be untouched — this phase only filters *which sessions are visible*, never the batch model. Mitigation: no changes to `stock_take_item_batches` or `BatchNumberGenerator`.

**Testing checklist.**
- [ ] Toggle off → all sessions listed.
- [ ] Toggle on, branch A → only sessions on A's warehouses.
- [ ] Session creation asserts warehouse branch access.
- [ ] Per-unit batch generation/parsing unchanged (existing `StockTakeServiceTest` green).

**Estimated complexity.** M.

**Dependencies.** Phase 3.

**Exit criteria.** Session visibility scoped correctly; `StockTakeServiceTest` suite green; no change to batch storage model.

---

## Phase 8 — Stock-transfer cross-branch rules (behind toggle)

**Objective.** Transfers work **across** branches: visible to both source and destination, arithmetic stays correct, authorization is explicit.

**Scope.** `inventory/stocktransfer/*`.

**Files/modules affected.**
- `inventory/stocktransfer/StockTransferService.java` + controller.

**Database changes.** None required (each leg is a movement stamped with its own warehouse's branch — Phase 2 already does this: OUT at source branch, IN at destination branch).

**Authorization: Option A "Split Authority" (§14.3 RESOLVED — design §17).** S = source-warehouse branch, D = destination-warehouse branch; access = `canAccessBranch(user, branch)` (admins/All-Branches pass; global/null branch always accessible). All assertions **toggle-gated**.

| Operation | Required access |
|---|---|
| create / edit / request-approval / cancel / **send** (`markSent`) | **source (S)** |
| **receive** (`markReceived`) | **destination (D)** |
| delete | existing `ROLE_ADMIN` gate (unchanged) |
| list / view | **either** S or D (admins: all) |

**Backend changes.**
- **Visibility:** the transfer *document* list filters on `sourceBranch ∈ scope OR destBranch ∈ scope` (global/null endpoints always visible); single-record `GET /{id}` guarded to permit access via either endpoint. So a transfer appears in both parties' lists and never disappears from a branch that is party to it.
- **Authorization (Option A):** assert source access on create/edit/request-approval/cancel/`markSent`; assert destination access on `markReceived`; via `BranchAccessService.canAccessBranch(...)`. Delete keeps its existing `ROLE_ADMIN` gate.
- **Destination validation hook (refinement):** add `assertDestinationAllowed(sourceBranchId, destBranchId)` invoked on create/send — **a permissive no-op for now** (any destination allowed, preserving today's behaviour) with a documented extension point for a future allowed-destination policy, so it can be tightened without touching the transfer lifecycle or the matrix.
- Guard against a transfer being counted twice in any single-branch on-hand (it can't be — each leg is a distinct warehouse/branch — but add a regression test proving it).

**Frontend changes.** None required this phase (source/destination pickers already exist; copy/indicators are Phase 11).

**API changes.** Transfer list/detail honor both-branch visibility; send/receive/create enforce Option-A access **when the toggle is on** (backward compatible; no contract change).

**Risks.**
- **Double-counting** (design §12) — highest-attention risk. Mitigation: never sum a transfer document into on-hand; on-hand is *only* ever the movement ledger. Test: create transfer A→B, assert A's on-hand drops by qty and B's rises by qty, company total unchanged.
- Over-strict auth blocking a legitimate flow. Mitigation: admins/All-Branches always pass; toggle-off is byte-identical (no auth); destination hook is permissive by default.

**Testing checklist.**
- [ ] Transfer A→B: A on-hand −qty, B on-hand +qty, company total unchanged.
- [ ] Transfer visible in both A's and B's transfer lists; hidden from an unrelated branch C (toggle on).
- [ ] Auth: source-only user may create/send, may NOT receive; destination-only user may receive, may NOT send; admin does all.
- [ ] Destination hook invoked (no-op default allows any destination); extension point documented.
- [ ] Toggle off → legacy behaviour (no cross-branch guard) unchanged / byte-identical.
- [ ] No double-count in any single-branch report.

**Estimated complexity.** L.

**Dependencies.** Phase 2 (both legs stamped), Phase 3/4 (branch on-hand), **§14.3 RESOLVED → Option A**.

**Exit criteria.** Cross-branch transfer demonstrated end-to-end with correct on-hand on both sides, Option-A authorization enforced (source send / destination receive), both-branch visibility, destination hook in place, and the double-count regression test green.

---

## Phase 9A — Barcode branch-scoping + branch-first resolution (behind toggle)

**Objective.** Barcode templates and product barcodes become branch-scoped; a scan resolves to the active branch's product first, then falls back to a global (`branch_id IS NULL`) product. Identical to today when the toggle is off.

**Scope.** `inventory/barcode/*` (`BarcodeTemplate`, `ProductBarcode`) + barcode resolution in POS/product lookup.

**Files/modules affected.**
- `inventory/barcode/BarcodeService` (or equivalent) + barcode repositories; the resolution path in `pos/search/PosSearchService` / `PosLookupService` and `ProductService` code/barcode resolve.

**Database changes.** None new (columns added in Phase 6A: `barcode_templates.branch_id`, `product_barcodes.branch_id`).

**Backend changes.**
- Template list/print: branch-filter via `currentListScope()`.
- **Resolution (the key behaviour):** look up the barcode within the active branch first; if none, fall back to a global (`branch_id IS NULL`) barcode/product. When toggle off, resolution is the current global behaviour.
- Barcode-value uniqueness follows the per-branch + global-null model (no forced company-wide uniqueness once products are branch-owned).

**Frontend changes.** None yet (Phase 11 for any template-list labels). **API changes.** Barcode resolve becomes branch-aware under toggle; POS resolve endpoint shape unchanged.

**Risks.** A shared barcode failing to resolve if the fallback is missed → scan "not found" at a branch. Mitigation: fallback to global is mandatory; a test that a global-barcode product scans successfully in every branch. A branch-private barcode colliding with a global one resolves branch-first (documented precedence).

**Testing checklist.**
- [ ] Toggle off → barcode resolution identical to today (global).
- [ ] Toggle on: a branch-private product's barcode resolves at its branch.
- [ ] A global (null-branch) barcode resolves in every branch (fallback).
- [ ] Branch-first precedence when both a branch and a global barcode share a value.
- [ ] Template list branch-scoped; printing unaffected.

**Estimated complexity.** M.

**Dependencies.** Phase 6A (barcode `branch_id`), Phase 3 (toggle/resolver). Precedes/pairs with Phase 9 (POS).

**Exit criteria.** Scans resolve branch-first with global fallback under the toggle; no "not found" regression for shared barcodes; toggle-off byte-identical.

---

## Phase 9 — POS availability scoping (behind toggle)

**Objective.** POS at branch B never shows branch A's stock; barcode/product resolve computes availability against the active branch's warehouses.

**Scope.** `pos/search/PosSearchService`, `pos/search/PosLookupService`.

**Files/modules affected.**
- `pos/search/PosSearchService.java`, `PosLookupService.java` (resolve → available stock).

**Database changes.** None.

**Backend changes.**
- Availability computation uses the Phase-3 branch-scoped net-available query (`getNetAvailableStock*`) against the **active POS session's branch** warehouses.
- POS session branch is already reliable (per POS-hardening memories) — use it, not the raw header alone.
- Keep RESERVED-allocation subtraction (`batch_allocations` RESERVED) intact per branch.

**Frontend changes.** Verify POS stock badges read the branch-scoped availability (usually transparent — same endpoint, scoped result).

**API changes.** `/api/pos/resolve` and batch-check availability become branch-scoped under toggle.

**Risks.** POS is the highest-stakes surface (oversell/undersell at the till). Mitigation: validate against a live-like till in Phase 12 before enabling; keep the RESERVED subtraction and one-batch-one-unit rules (`pos_p0_batch_warehouse_report`, `pos_unified_smart_search`) unchanged.

**Testing checklist.**
- [ ] Toggle off → POS availability identical to today.
- [ ] Toggle on: product stocked only in A shows 0 available at B's POS.
- [ ] RESERVED allocations still reduce net-available per branch.
- [ ] Scanned batch pinning / one-unit rule unaffected.
- [ ] Cross-branch: stock in a global (null-branch) warehouse still available at every POS.

**Estimated complexity.** M.

**Dependencies.** Phase 3, Phase 4, **Phase 9A (branch-first barcode/product resolution)**; reliable POS session branch.

**Exit criteria.** Till dry-run confirms branch-correct availability with no oversell; branch-first product resolution with global fallback; RESERVED logic intact.

---

## Phase 10 — Inventory reports (active vs. All-Branches, behind toggle)

**Objective.** Inventory reports default to the active branch; admins can toggle consolidated vs. per-branch. Consolidated views never regress.

**Scope.** `inventory/reports/*`.

**Files/modules affected.**
- `inventory/reports/*` services + controllers.

**Database changes.** None (optional pre-aggregated per-branch snapshot table deferred to §10 "if latency becomes an issue" — not in this phase).

**Backend changes.**
- Default report scope = active branch when toggle on; preserve the **unscoped query path** for `isAllBranches` (design §12 risk mitigation).
- Add `?branchScope=active|all` param for admins (design §8).

**Frontend changes.** Branch context indicator + admin consolidated/per-branch toggle (copy in Phase 11; the control wiring lands here).

**API changes.** Reports honor active branch under toggle; new optional `branchScope` query param.

**Risks.** Consolidated valuation regressions for admins. Mitigation: keep and test the unscoped path explicitly; `sumGlobalInventoryValue` and `findActiveProductStockSummary(null)` remain the All-Branches path.

**Testing checklist.**
- [ ] Admin All-Branches valuation identical to pre-change (control number).
- [ ] Branch A report = A's stock only (+ null-branch).
- [ ] `branchScope=all` for admin returns consolidated; `=active` returns branch.
- [ ] Toggle off → all reports unchanged.

**Estimated complexity.** M.

**Dependencies.** Phase 3, Phase 4.

**Exit criteria.** Admin consolidated report matches a pre-change control snapshot; per-branch reports verified against Phase 4 on-hand.

---

## Phase 11 — Frontend labels & branch indicators

**Objective.** Make the branch-specificity of stock **legible** to users. No new data plumbing — `BranchContext` + `axiosConfig` already send `X-Branch-Id`.

**Scope.** Inventory pages (stock **and master data**) + POS badges.

**Files/modules affected.**
- `pages/Inventory/Product`, `Warehouse`, `StockTaking`, `StockTransfer`, `Reports`, `Barcode`, **`Department`, `SubDepartment`, `Brand`, `Units`**.
- Stock-transfer source/destination pickers.
- Report branch-context indicator + admin consolidated/per-branch toggle.
- **Master-data create forms:** a "shared/global vs. this branch" indicator (and, for admins in All-Branches, a choice) so users understand whether they're creating a global or branch-private item.

**Database changes.** None.

**Backend changes.** None.

**Frontend changes.**
- On-hand columns labeled "On-hand @ <active branch>"; show active branch name.
- Product list stock reflects active branch; admin All-Branches shows consolidated or per-branch breakdown.
- **Master-data lists (Dept/Sub-Dept/Brand/Unit/Product):** indicate branch-scoped vs. shared/global rows (e.g. a "Global" badge on null-branch rows); show the active branch context.
- **Master-data create:** surface whether the new item is branch-private or global (per governance, design §14.9).
- Stock-transfer UI makes cross-branch explicit (source vs. destination branch/warehouse).
- Reports: branch-context indicator + admin toggle wired to `?branchScope`.
- POS: verify badges use branch-scoped availability + branch-first barcode resolution (should be automatic).

**API changes.** None (consumes existing/Phase-10 params).

**Risks.** Cosmetic drift if labels ship before the backend toggle is on for a tenant (label says "@ Branch" but data is still global). Mitigation: gate the label copy on the same tenant toggle state (expose toggle state via an existing settings/bootstrap endpoint), or ship labels together with per-tenant enable in Phase 12.

**Testing checklist.**
- [ ] `npm run build` + `npm run lint` green.
- [ ] Labels reflect active branch; switch branch → label + numbers + master-data lists update.
- [ ] Global (null-branch) master rows show a "Global/Shared" indicator and appear in every branch.
- [ ] Admin All-Branches → consolidated indicator shown.
- [ ] Transfer UI clearly shows source vs. destination branch.

**Estimated complexity.** M.

**Dependencies.** Phases 4–10 + **6B, 9A** (the data they label).

**Exit criteria.** UI accurately describes what the backend returns in both toggle states; build + lint green.

---

## Phase 12 — Per-tenant rollout & toggle-on

**Objective.** Enable branch-scoped inventory for one pilot tenant, validate, then roll out.

**Scope.** Ops/config + validation, no new code.

**Files/modules affected.**
- Per-tenant `application-<client>.properties` — set `inventory.branch-scope.enabled=true`.

**Database changes.** None (all migrations already applied additively).

**Backend changes.** None.

**Frontend changes.** None (Phase 11 already shipped, or ships alongside).

**API changes.** None.

**Risks.** On-hand figures visibly change (company-wide → per-branch) — this is the moment users notice. Mitigation: pilot on one tenant, validate against control numbers, communicate to the client before flipping; toggle is instantly reversible.

**Testing checklist (per tenant, before flip):**
- [ ] Per-branch on-hand matches a hand-computed control set (3+ products, 2+ branches).
- [ ] **Master data (Dept/Sub-Dept/Brand/Unit/Product) branch-scoped:** existing global rows visible in every branch; a branch-private row created in A is not visible in B.
- [ ] **Per-branch uniqueness:** two branches can hold the same code; a same-branch duplicate is rejected; global-null uniqueness intact.
- [ ] **Barcode:** branch-first resolution with global fallback; no "not found" regression for shared barcodes.
- [ ] POS availability correct at each branch's till.
- [ ] Cross-branch transfer correct on both sides.
- [ ] Admin consolidated report unchanged from pre-flip All-Branches value.
- [ ] Null-branch legacy stock **and master data** still visible everywhere.
- [ ] Rollback rehearsed: flip toggle off → figures + master lists return to company-wide.

**Estimated complexity.** S (per tenant).

**Dependencies.** All prior phases deployed.

**Exit criteria.** Pilot tenant validated + signed off; documented rollout runbook; then repeat per tenant.

---

## Phase 13 — (Optional) `product_branch_availability` — hide *shared* items per branch

**Objective.** **Branch-private items are already delivered by Phases 6A/6/9A** (the `branch_id` column). This optional phase adds only the remaining capability: **hiding a *shared* (null-branch) item from specific branches** — e.g. a global product that Branch B should not see/sell. Build only if a client asks (§14.2).

**Scope.** New availability overlay table (mirrors `ProductBranchPricing`).

**Files/modules affected.**
- New `V37__product_branch_availability.sql` (additive).
- `inventory/product/*` — availability overlay in list/POS resolve (a null-branch product is hidden at branch B if an availability row says so).

**Database changes.**
- `product_branch_availability (id, product_id, branch_id, available_in_pos boolean, is_stocked boolean, ...)` — additive, mirrors `product_branch_pricing`. **No change to uniqueness** — that was handled in Phase 6A.

**Backend changes.** Availability overlay: a shared product is visible everywhere *unless* an availability row hides it for a branch. (Branch-private items and per-branch code resolution already work from earlier phases — nothing to add here.)

**Frontend changes.** Per-branch availability admin UI (toggle a shared item on/off per branch).

**API changes.** New CRUD for `product_branch_availability`.

**Risks.** Low — a pure additive overlay; does not touch uniqueness or resolution (those are done). Mitigation: default is "visible everywhere" (absence of a row = available), so it can't accidentally hide data.

**Testing checklist.**
- [ ] A shared product with an availability row hiding it at branch A is absent from A's catalog but present elsewhere.
- [ ] Absence of an availability row = visible everywhere (no regression).
- [ ] Branch-private items + per-branch uniqueness (from Phase 6A) still correct.

**Estimated complexity.** L.

**Dependencies.** Phases 6A/6 (branch-private items + uniqueness already in place). **Optional** — build only on client request.

**Exit criteria.** Shared-item per-branch hiding validated on one tenant; default "visible everywhere" unchanged; branch-private items (from earlier phases) unaffected.

---

## Phase 14 — (Optional, post-rollout) Global → Branch Conversion Wizard

**Objective.** An **optional admin utility** to convert existing **global** (`branch_id IS NULL`) master data into **branch-owned copies** for selected branches — for tenants that decide, after rollout, that a shared item should become branch-specific per branch. **Does not affect any earlier phase**; it is purely additive tooling built on the already-shipped `branch_id` model. Ships only when a tenant requests it.

**Scope.** A guided, admin-only clone/convert flow over master data (Department/Sub-Department/Brand/Unit/Product/Barcode), reference-preserving.

**Files/modules affected.**
- New `inventory/conversion/GlobalToBranchConversionService` + controller (admin-gated).
- Frontend: a wizard page (select entity/entities → select target branches → preview → confirm).
- Reuses the §16 reference validator and §15 governance checks.

**Database changes.** None structural (uses existing `branch_id` columns + partial unique indexes). The wizard writes **new** branch-stamped rows; it does not alter or delete the source global rows unless the admin explicitly chooses to (see options below).

**Backend changes.**
- **Clone:** for each selected global master row and each selected target branch, insert a copy with `branch_id = target` (new id), respecting per-branch uniqueness (the partial indexes allow the same code under a different branch).
- **Reference preservation:** when cloning a row that references other masters (e.g. a Product → Department/Brand/Unit), rewrite each reference to the **target branch's** equivalent if one exists/was also cloned, else keep the **global** reference (both are valid per §16). Never leave a reference pointing at another branch.
- **Modes (admin choice):**
  - *Copy* (default): global row stays global; branch copies are added. Both coexist (branch copy shadows the global one at that branch via branch-first resolution).
  - *Convert*: after cloning to all intended branches, optionally retire the global row (soft-delete `isActive=false`) — only when every serving branch has a copy, guarded so nothing is orphaned.
- **Idempotency & safety:** a dry-run/preview computes exactly what will be created; re-running skips branches that already have a copy (per-branch uniqueness makes a duplicate clone a no-op or a clear conflict).
- **Audit:** every conversion action logged (ties to the audit topic).

**Frontend changes.** Wizard: entity picker → target-branch multi-select → reference-remap preview (what points where) → confirm; progress + result summary.

**API changes.** New admin endpoints under `/api/inventory/conversion/*` (preview, execute), gated by a `INVENTORY_CONVERSION` permission (or admin role).

**Risks.**
- **Duplicating stock/history unintentionally.** Mitigation: the wizard converts **master data only** — never stock movements, balances, or ledger rows (those stay branch-derived from warehouses). Cloning a product does not clone its stock.
- **Reference drift** (a clone pointing at another branch's master). Mitigation: the §16 validator runs on every cloned row; preview surfaces every remap before commit.
- **Uniqueness conflict** if a target branch already has that code. Mitigation: preview detects and reports; admin resolves (skip / rename) before execute.

**Testing checklist.**
- [ ] Preview lists exactly the rows to be created + reference remaps; no writes.
- [ ] Clone a global Department to branches A + B → two new branch rows; global row intact (Copy mode).
- [ ] Clone a global Product → references remapped to each branch's Department/Brand if cloned, else kept global; never points to another branch.
- [ ] Per-branch uniqueness respected; a pre-existing target-branch code is reported, not silently overwritten.
- [ ] Convert mode retires the global row only after all target branches have a copy; nothing orphaned.
- [ ] No stock/movement/balance rows created or altered by the wizard.
- [ ] Every action audited; admin-gated.

**Estimated complexity.** L.

**Dependencies.** Full branch-scoping rollout (Phases 6A–12); §16 validator; §15 governance. **Optional and post-rollout** — never on the critical path.

**Exit criteria.** An admin can clone selected global master data into selected branches with references preserved and validated, no stock duplication, full audit, and a dry-run preview; source global data untouched unless Convert mode is explicitly chosen.

---

## Blocking decisions to resolve before the phase that needs them

| Open question (design §14) | Status | Needed by | Resolution / default |
|---|---|---|---|
| §14.1 Catalog model: Approach A vs. C | ✅ **RESOLVED** | Phase 0 | **Approach C, module-wide** (branch-scope everything; `NULL` = shared/global). Confirmed 2026-07-11. |
| §14.4 Departments/Brands/Units global? | ✅ **RESOLVED** | Phases 6A/6B | **NO — branch-scoped** (nullable `branch_id`, per-branch uniqueness). The core scope change. |
| §14.6 Barcode uniqueness/resolution | ✅ **RESOLVED** | Phase 9A | **Branch-first resolution, global fallback**; per-branch + global-null uniqueness. |
| §14.2 Per-branch hiding of *shared* items? | ✅ **RESOLVED (deferred)** | Phase 13 | Branch-private items delivered by 6A/6/9A; hiding shared items = optional Phase 13, build only if a client asks. |
| Legacy inventory rows behaviour | ✅ **RESOLVED** | Phases 6A/6B | **`NULL` = shared/global, visible to all; no data migration** (D1, 2026-07-11). |
| Uniqueness model | ✅ **RESOLVED** | Phase 6A | **Per-branch unique + global-null unique** via paired partial indexes (D2, 2026-07-11). |
| All-Branches view | ✅ **RESOLVED** | Phases 10/12 | **Admin All-Branches = consolidated; non-admins = own branch + global** (D4, 2026-07-11). |
| §14.3 Cross-branch transfer authorization | ✅ **RESOLVED (Option A)** | Phase 8 | **Split Authority:** create/edit/request-approval/cancel/send → source-branch access; receive → destination-branch access; list/view → either endpoint; admins see all. Destination validated via a permissive **hook** (extensible later). See design §17. |
| §14.5 Admin consolidated presentation | ⏳ **OPEN** | Phase 10 | Summed by default, per-branch drill-down via `branchScope=all` (recommended). |
| §14.7 Is `Branch.defaultWarehouse` always set? | ⏳ **OPEN** | Phase 2/9 | Phase 0 found BR02 has none; resolve before Phase 9 (POS/purchase default stamping). |
| §14.8 `allowNegative` per-branch or per-product? | ⏳ **OPEN** | Phase 9 | Keep per-product unless a requirement emerges (recommended). |
| §14.9 Master-data governance (who creates global vs. branch-private) | ✅ **RESOLVED → configurable** | Phase 6B | **Per-tenant config** (design §15): `inventory.global-master.creation-enabled` + `.allowed-roles` (default on, `SUPER_ADMIN,ADMIN`). No longer hardcoded. |
| §16 Cross-branch reference validation | ✅ **RESOLVED (defined)** | Phase 6B (+ 6, 8) | **A branch record may reference own-branch or global masters only, never another branch's** (design §16 matrix). Enforced via `assertMasterReferenceAccessible(...)`, gated by the toggle. Stock transfer is the deliberate cross-branch exception (§14.3). |

---

## Cross-cutting testing strategy

- **Toggle-off invariance is the safety net.** Every backend phase (3–10, 6B, 9A) must prove *byte-identical* output with `inventory.branch-scope.enabled=false`. This is what makes each phase independently deployable to production without risk. **Note:** Phase 6A (schema/uniqueness) is *not* toggle-gated (it's schema); its invariant is that existing all-null data is unaffected and no duplicate-key error occurs on boot.
- **Control-set validation.** Maintain a fixed set of (product, branch) on-hand control numbers computed by hand; assert against them at Phase 4, 6, 10, and 12.
- **Ledger-is-truth regression.** A standing test that on-hand always equals `SUM(signed movements)` per warehouse — guards against any transfer/double-count regression (design §12).
- **Global-visibility regression (NEW).** A standing test that a `branch_id IS NULL` row (master or transactional) is visible in **every** branch — the single most important guard against hiding existing data. Assert at Phases 6B, 6, 9A, 12.
- **Per-branch uniqueness (NEW).** A standing test that two branches can hold the same code, a same-branch duplicate is rejected, and global-null uniqueness holds — asserts the Phase-6A partial-index scheme.
- **Native-query tests run on real Postgres** (the new scoped aggregates + partial unique indexes use PG-specific SQL), matching existing repo-test setup.
- Run `mvn -o test` (unit suite is fully green today except the DB-dependent `contextLoads`) after every backend phase; `npm run build` + `npm run lint` after Phase 11.

---

## Revision Changelog — 2026-07-11 (branch-scope everything)

**Trigger:** confirmed business requirement — the entire Inventory module (master data included) is branch-specific, matching Sales/Purchase. Supersedes the original Approach A ("global catalog") assumption. See the design doc's matching changelog for the business decisions (D1–D4).

**Phase-set changes:**
| Change | Detail |
|---|---|
| **NEW Phase 6A** | Master-data schema: additive `branch_id` on `departments/sub_departments/brands/units/barcode_templates/product_barcodes` (`V35`) + per-branch/global-null partial unique indexes replacing global unique constraints (`V36`). The one non-purely-additive step (drops *global* unique constraints; no data deleted). Dormant. |
| **NEW Phase 6B** | Master-data list/create scoping for Department/Sub-Dept/Brand/Unit (behind toggle). |
| **NEW Phase 9A** | Barcode branch-scoping + branch-first resolution with global fallback (behind toggle). |
| **CHANGED Phase 6** | Products now scope **catalog identity** (branch + global fallback), not just the on-hand column. Depends on 6A for uniqueness. Documented as a behaviour change vs. original Approach A. |
| **CHANGED Phase 11** | Frontend now labels master-data branch scope + global badges + create-scope indicator, not just stock. |
| **CHANGED Phase 12** | Rollout checklist adds master-data scoping, per-branch uniqueness, and barcode-resolution validation. |
| **CHANGED Phase 13** | Reframed to *hiding shared items per branch* only — branch-private items are now delivered by the core phases (6A/6/9A), not deferred. |
| **CHANGED baseline + phase map** | Added the master-data column-presence + global-unique-constraint facts; added 6A/6B/9A to the map with a sequencing note (master-data and ledger are independent tracks converging at Phase 11/12). |
| **CHANGED blocking decisions** | §14.1/§14.4/§14.6/§14.2 marked resolved; D1/D2/D4 recorded; added **§14.9 master-data governance** (open, needed by 6B). |
| **CHANGED testing strategy** | Added global-visibility and per-branch-uniqueness standing regressions. |

**Unchanged / preserved:** additive + nullable + type-guarded + idempotent migration strategy; the `V8` FK guard pattern; the `inventory.branch-scope.enabled` toggle (default off); "null = visible to all"; Phase 0 audit; **Phase 1 (`V34`) as already implemented — no rework**. This revision changes the *plan*, not shipped code; **no production behaviour change results from it**.

### Addendum — 2026-07-11 (architectural improvements: configurable governance, validation matrix, conversion wizard)

Design-only improvements requested to make the architecture more configurable/future-proof. **No change to the critical-path phases beyond folding two guards into Phase 6B; Phase 14 is new and optional.**

| Change | Detail |
|---|---|
| **Phase 6B expanded** | Now also delivers (a) **configurable master-data governance** (`inventory.global-master.creation-enabled` + `.allowed-roles`, default on / `SUPER_ADMIN,ADMIN`) replacing the hardcoded rule, and (b) the **§16 cross-branch reference validator** (`assertMasterReferenceAccessible(...)`) reused by Phase 6 and Phase 8. Both gated by `inventory.branch-scope.enabled`. |
| **Phase 6 updated** | Product create/update now validates Dept/Sub-Dept/Brand/Unit references via the Phase-6B helper; depends on 6B. |
| **NEW Phase 14** | **Global → Branch Conversion Wizard** — optional, post-rollout admin utility to clone global master data into branch-owned copies with reference preservation, no stock duplication, dry-run preview, and audit. Not on the critical path. |
| **Blocking decisions** | §14.9 changed from OPEN → **RESOLVED (configurable)**; added a row for **§16 reference validation (resolved/defined)**. |
| **Phase map** | Added Phase 14; added a note that governance + validation are folded into Phase 6B (not separate phases). |
| **Design doc** | Added **§15 (governance)** and **§16 (validation matrix)**; §14.9 marked resolved-configurable. |

These map to design-doc **§15** (governance), **§16** (validation matrix), and roadmap **Phase 14** (wizard). **No earlier phase's scope shrinks; Phase 1 (`V34`) is still the only implemented code and is untouched.**
