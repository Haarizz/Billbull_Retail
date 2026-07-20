# Topic 1 — Branch-Level Inventory

> **RESEARCH / DESIGN ONLY (partial implementation in progress — Phase 1 landed).** No schema or migration in this document changes production behaviour; the read-path scoping is gated behind `inventory.branch-scope.enabled` (default off).
>
> **⚠️ REVISED 2026-07-11 — confirmed business requirement supersedes the original "global catalog" assumption.** See the [Revision Changelog](#revision-changelog--2026-07-11-branch-scope-everything) at the end of this document for exactly what changed and why. In short: **the entire Inventory module — including master data (Departments, Sub-Departments, Brands, Units, Products/Services) — is now branch-scoped**, following the same model Sales and Purchase already use. The implementation model is the design's former **Approach C** ("shared catalog + branch-owned items"), applied module-wide, with the proven **"`branch_id IS NULL` = shared/global, visible everywhere"** rule preserved so existing tenants keep working with zero data migration.

Goal: make the **entire Inventory module branch-specific**, matching the already-branch-scoped Sales and Purchase modules. Cover **Departments, Sub-Departments, Brands, Units, Products/Services**, warehouses, storage locations (bins), stock, stock movements, stock transfers, stock taking, barcode printing, reports, and every inventory sub-module. The confirmed rule: **everything under Inventory is branch-scoped**; `branch_id IS NULL` rows are treated as shared/global and remain visible to every branch (backward compatibility for existing data).

---

## 1. Current system behavior

### 1.1 What is global vs. branch-aware today

The Inventory module (`inventory/*`) is **deliberately global today**. In contrast, `sales/`, `purchase/`, and `financials/` are already branch-scoped through `BranchAccessService`. **The confirmed requirement is to bring Inventory — master data included — to that same branch-scoped model.** The table below shows the current state and the target column added.

> **Column-presence audit (live `testdb`, 2026-07-11):** only `products` and `warehouses` currently have a `branch_id` column. **Every other inventory table needs one added** (all additive/nullable): `departments`, `sub_departments`, `brands`, `units`, `bins`, `bin_stock`, `barcode_templates`, `product_barcodes`, `stock_movements` (added by Phase 1 / `V34`), `inventory_balances`, `batch_master`, `stock_take_sessions`, `stock_take_items`, `stock_transfers`.

| Concern | Current model | Branch column today? | Target under confirmed requirement |
|---|---|---|---|
| **Department** (`inventory/department/Department`) | Global master, unique `code` | **No** | **Branch-scoped.** Add nullable `branch_id`; relax `code` uniqueness to `(code, branch_id)` + partial-unique among null-branch rows |
| **Sub-Department** (`inventory/subdepartment/SubDepartment`) | Global, unique `code` + unique `(name, department_id)` | **No** | **Branch-scoped.** Add `branch_id`; per-branch uniqueness |
| **Brand** (`inventory/brand/Brand`) | Global, unique `code` + unique `name` | **No** | **Branch-scoped.** Add `branch_id`; per-branch uniqueness |
| **Unit** (`inventory/units/Unit`) | Global, unique `name` + unique `symbol` | **No** | **Branch-scoped.** Add `branch_id`; per-branch uniqueness |
| **Product / Service** (`inventory/product/Product`) | One catalog row per SKU, unique on `code` | **Yes** — nullable `branch_id` FK (`@Index idx_product_branch`), null = "company-wide" | **Branch-scoped.** Column exists; relax `code` uniqueness to `(code, branch_id)` + partial-unique among null-branch rows; branch-filter list/search |
| **Product pricing** | Global `ProductPricing` (1:1) **plus** per-branch overrides | Yes — `ProductBranchPricing` side table (`product_branch_pricing`, `findByProductIdAndBranchId`) | **Already branch-aware** — the proven template for the whole scheme; no change to the mechanism |
| **Warehouse** (`inventory/warehouse/Warehouse`) | Global list | **Yes** — nullable `branch_id` FK; `Branch.defaultWarehouse` links back | **Branch-scoped.** Column exists; branch-filter list endpoints |
| **Bin / storage location** (`inventory/warehouse/Bin`, `BinStock`) | Global, keyed by warehouse | Indirect (via warehouse's branch) | **Branch-scoped.** Add denormalized `branch_id` (or derive via warehouse); branch-filter |
| **Stock movement** (`purchase/stockmovement/StockMovement`) | Append-only ledger, source of truth | **`branch_id` added by Phase 1 (`V34`), backfilled from warehouse** | **Branch-scoped.** Stamped at write (Phase 2); branch-scoped aggregates (Phase 3) |
| **Inventory balance** (`inventory/balance/InventoryBalance`) | Materialized on-hand per (product, warehouse) | Via warehouse | **Branch-scoped.** Add denormalized `branch_id` |
| **Batch** (`inventory/batch/*`, `batch_master`) | Batch master + allocations | Via warehouse/movement | **Branch-scoped.** Add `branch_id`; resolve within active branch's warehouses |
| **Stock transfer** (`inventory/stocktransfer/*`) | Moves stock between warehouses | Implicit (source/dest warehouse each belong to a branch) | **Branch-scoped, cross-branch aware.** Visible to both source & dest branches |
| **Stock take** (`inventory/stocktake/*`) | Per-warehouse counting session | Via warehouse | **Branch-scoped.** Add/derive `branch_id`; branch-filter session list |
| **Barcode** (`inventory/barcode/BarcodeTemplate`, `ProductBarcode`) | Global templates + per-product barcodes | No | **Branch-scoped** (templates + product barcodes). Scan resolves within active branch, **global fallback** (see §2.11) |
| **Reports** (`inventory/reports/*`) | Aggregate over all `StockMovement` | No | **Branch-scoped** by default; admin "All Branches" = consolidated |

### 1.2 How branch is resolved on a request (already built)

- `JwtFilter` reads JWT claims + `X-Branch-Id` header → sets `BranchContextHolder` (`activeBranchId`, `allowedBranchIds`, `isAllBranches`).
- `BranchScope.currentBranchId()` returns the active branch (null = All Branches / admin).
- `BranchAccessService` provides `ListScope`, `filterBranchScoped(...)`, `assertTransactionBranchAccessible(...)`, `assertWarehouseMatchesBranch(...)`.
- Frontend: `BranchContext.jsx` → `sessionStorage.activeBranchId` → `axiosConfig.js` attaches `X-Branch-Id`.

**The plumbing to scope inventory already exists and is proven in Sales/Purchase. The work is to (a) add a nullable `branch_id` to every inventory master + transactional table that lacks one, (b) relax global unique constraints to per-branch (with a global-null tier), and (c) apply the existing `BranchAccessService` scoping to inventory list/search/aggregate paths — all additively, behind a toggle, with `branch_id IS NULL` staying globally visible.**

---

## 2. Challenges and edge cases

1. **Master data + stock both become branch-scoped (confirmed requirement).** The full model is: **every inventory master row (Department/Sub-Department/Brand/Unit/Product) and every transactional row (movements/balances/batches/takes/transfers) carries a `branch_id`**; `branch_id IS NULL` means "shared/global, visible to all branches". A branch may create branch-private master data, and existing global rows keep working. Stock/quantity remains per-warehouse (warehouses belong to a branch), consistent with the master scoping above it.
2. **`StockMovement` needs `branch_id` (added by Phase 1 / `V34`).** Every on-hand aggregate (`SUM(quantity) GROUP BY product/warehouse`) previously joined `warehouses` to know the branch. The denormalized `branch_id` (stamped at write) makes branch filtering a cheap indexed predicate instead of a join — essential for report performance on the highest-volume table.
3. **Global unique constraints conflict with branch-scoping (the central schema change).** Every master entity has company-wide unique constraints — `Product.code`, `Department.code`, `SubDepartment.code`/`(name,department_id)`, `Brand.code`/`name`, `Unit.name`/`symbol`. Under branch-scoping two branches may legitimately reuse the same code/name. **Resolution (confirmed): per-branch uniqueness with a global-null tier** — drop the global unique constraint and replace with (a) a partial unique index over `(code)` `WHERE branch_id IS NULL` (global rows stay unique among themselves) and (b) a partial unique index over `(code, branch_id)` `WHERE branch_id IS NOT NULL` (each branch may reuse a code once). This is additive-compatible: existing all-null data satisfies (a) immediately.
4. **Legacy null-branch rows stay globally visible.** All existing inventory rows have `branch_id = NULL`. The existing convention (`BranchAccessService.matchesActiveListScope` / `ListScope` = `branch_id IN (:ids) OR branch_id IS NULL`) treats null-branch rows as visible to everyone. Inventory adopts this same rule so **no existing data is hidden and no data migration is required** (confirmed decision).
5. **Stock transfers are cross-branch by nature.** A transfer from Branch A's warehouse to Branch B's warehouse must be visible to *both* branches (or at least not disappear from either). Branch scoping must not break legitimate inter-branch flows.
6. **POS lookups must respect branch.** `pos/search/PosSearchService` resolves barcode → product → available stock. Product resolution and available stock must be computed for the *active branch's* scope (branch rows + global fallback), or POS at Branch B will show Branch A's items/stock.
7. **Reports that intentionally span branches** (consolidated company inventory valuation) must still work for admins in "All Branches" mode (confirmed: admin All-Branches = consolidated; non-admins see own branch + global).
8. **Master data is now branch-scoped, not global (CHANGED).** The original design kept Departments/Brands/Units/Sub-departments/barcode-templates global. The confirmed requirement makes them **branch-scoped** using the `branch_id`-nullable + per-branch-uniqueness model. Duplication/reconciliation risk is mitigated by the "`NULL` = shared/global" tier: a company-wide item is created once as a null-branch row and inherited everywhere; only genuinely branch-specific items get a `branch_id`.
9. **Purchase receipts pick the warehouse, not the branch directly.** The branch stamped on a `StockMovement` must be derived from the receiving warehouse's branch at write time (consistency check needed).
10. **Multi-warehouse-per-branch.** A branch can own several warehouses. Branch-level stock = SUM over all warehouses whose `branch_id = active`.
11. **Barcode resolution becomes branch-aware with global fallback (CHANGED, confirmed).** A scan resolves to the active branch's product first, then falls back to a global (`branch_id IS NULL`) product. Both `barcode_templates` and `product_barcodes` gain a `branch_id`. This preserves shared-catalog scanning while allowing branch-private items with their own barcodes. Barcode *values* are not forced globally unique once products are branch-owned — uniqueness follows the same per-branch + global-null model (§2.3).
12. **Child rows inherit branch from their aggregate root.** `stock_take_items`, `bin_stock`, batch allocations, transfer lines, etc. derive/carry the branch of their parent (session/warehouse/product). Scope filtering is applied at the root; children are never filtered independently.

---

## 3. Possible implementation approaches

> **Decision (2026-07-11): Approach C is confirmed and adopted, applied to the *entire* inventory module (master data included), not just products.** The confirmed business requirement rules out Approach A (which kept master data global). Approaches A and B are retained below for context/rationale only.

### Approach A — "Global catalog + per-branch stock" (SUPERSEDED)

- Product, Department, Brand, Unit, Sub-department, Barcode templates stay GLOBAL; only stock is branch-scoped.
- **Why superseded:** the confirmed requirement makes master data itself branch-specific. Approach A cannot express a branch-private brand/department/product. Kept here only to document the original assumption (see [Revision Changelog](#revision-changelog--2026-07-11-branch-scope-everything)).

### Approach B — "Branch-owned everything, no global tier" (fork the catalog)

- Enforce `branch_id` NOT NULL going forward; unique constraint becomes `(code, branch_id)`; every branch has its own rows; shared items must be duplicated.

**Pros:** total isolation. **Cons:** massive duplication, breaks consolidated reporting, **breaks the additive/backward-compatible strategy** (needs NOT NULL + a data migration on every tenant), contradicts the `ProductBranchPricing` "shared + override" design. **Not chosen** — conflicts with the stale-schema convention and the confirmed "null = shared/global" decision.

### Approach C — "Branch-scoped everything with a shared/global tier" (RECOMMENDED / CONFIRMED)

- **Every inventory table** (master + transactional) gets a nullable `branch_id`. `branch_id IS NULL` = shared/global (visible to all branches); `branch_id = X` = branch-private.
- Global unique constraints are relaxed to **per-branch + global-null** via paired partial unique indexes (§2.3):
  - unique `(code)` `WHERE branch_id IS NULL` — global rows stay unique among themselves;
  - unique `(code, branch_id)` `WHERE branch_id IS NOT NULL` — each branch may reuse a code once.
- **Resolution rule (barcode/code/lookup):** resolve within the active branch first, fall back to a global (`NULL`) row (§2.11).
- Existing all-null data satisfies the null-tier index immediately, so the migration is **additive and backward-compatible with zero data migration**.

**Pros:** satisfies the confirmed requirement, keeps existing data working, allows both shared and branch-private items, reuses the proven `ProductBranchPricing`/`BranchAccessService` patterns, preserves consolidated admin reporting. **Cons:** more per-branch uniqueness/resolution logic than Approach A (barcode/code lookups must try "my-branch then global") — accepted as the cost of the requirement.

**Recommendation: Approach C, module-wide.** This is the confirmed direction. The `branch_id` column and the "null = global" rule are the two mechanisms that carry the whole scheme.

---

## 4. Recommended architecture

**Principle (REVISED): "Everything in Inventory is branch-scoped; a `branch_id IS NULL` row is a shared/global item visible to every branch."**

### What is SHARED/GLOBAL vs. BRANCH-PRIVATE (one mechanism, not two categories)
There is no longer a "stays global" category. **Every** inventory master and transactional row carries a nullable `branch_id`:
- `branch_id IS NULL` → **shared/global** item, visible and usable in every branch (this is how all existing data behaves — backward compatible).
- `branch_id = X` → **branch-private** item, visible only in branch X (plus admins in All-Branches).

Applies uniformly to: **Departments, Sub-Departments, Brands, Units, Products/Services, Warehouses, Bins, Barcode templates, Product barcodes, Stock movements, Inventory balances, Batches, Stock takes, Stock transfers, Reports.**

`ProductPricing` keeps its existing "base row + `ProductBranchPricing` override" mechanism unchanged — it is the proven template this whole scheme generalizes.

### What becomes BRANCH-SCOPED (the work)
- **Master data (Department/Sub-Department/Brand/Unit/Product)** — add `branch_id` where missing; relax global unique constraints to per-branch + global-null (§2.3); branch-filter list/search; branch-scope create/update.
- **Warehouses & Bins** — warehouses already have `branch_id`; enforce it in list endpoints; bins carry/derive branch from warehouse.
- **Stock movements** — denormalized `branch_id` (Phase 1 `V34`), stamped from the warehouse's branch at write (Phase 2).
- **Inventory balances / on-hand** — add `branch_id`; computed per active branch (SUM over branch's warehouses).
- **Batches** — add `branch_id`; allocations resolved within the active branch's warehouses.
- **Stock takes** — a session belongs to a warehouse → a branch; add/derive `branch_id`; list filtered by active branch.
- **Stock transfers** — visible to source and destination branches; cross-branch transfers explicitly allowed.
- **Barcodes** — `barcode_templates` + `product_barcodes` gain `branch_id`; scan resolves active-branch-first, global fallback (§2.11).
- **Inventory reports** — default to active branch; consolidated "All Branches" for admins.
- **POS product resolution & availability** — resolved against the active branch's scope (branch rows + global fallback).

### Enforcement layers (reuse existing infra)
1. **Write path (transactional):** derive `branch_id` from the receiving/issuing warehouse; call `BranchAccessService.assertWarehouseMatchesBranch(...)` (already exists) to prevent stamping a warehouse that doesn't belong to the document's branch.
2. **Write path (master):** stamp `branch_id` from the active branch on create (via `BranchAccessService.getRequiredCurrentUserBranch()` / `BranchScope`), leaving it null when the creator is in All-Branches and intends a global item; assert branch access on update/delete.
3. **Read path (lists):** use `BranchAccessService.currentListScope()` → push `branch_id IN (:ids) OR branch_id IS NULL` into repository queries for **every** inventory list/search (the `ListScope` record already produces exactly this predicate).
4. **Resolution (barcode/code/lookup):** try the active branch first, then the global (`NULL`) row (§2.11).
5. **Aggregates:** add branch-aware repository methods on `StockMovementRepository` (`... WHERE branch_id IN :ids GROUP BY product_id`), keeping unscoped variants for admin All-Branches.
6. **Uniqueness:** enforce per-branch + global-null via paired partial unique indexes (§2.3, §5).

---

## 5. Database / schema changes (design only — DO NOT create migrations now)

> Follow the project's stale-schema convention (see `project_stale_schema_upgrade_hazard` memory): new columns must be **nullable** or type-guarded; enum widening and NOT NULL need pre-patch SQL. All changes should be **additive Flyway migrations** guarded with `to_regclass`/`information_schema` checks, run before Hibernate.

> **Column-presence facts (live `testdb`, 2026-07-11):** only `products` and `warehouses` have `branch_id` today. `stock_movements.branch_id` is added by Phase 1 (`V34`, already implemented). **All other inventory tables below need a new nullable `branch_id`.**

### 5.1 Transactional tables — denormalized `branch_id` + backfill (stamped from warehouse)
1. **`stock_movements.branch_id BIGINT NULL`** (FK → `branches.id`), indexes `idx_sm_branch_product (branch_id, product_id)`, `idx_sm_branch_warehouse (branch_id, warehouse_id)`. **DONE in Phase 1 (`V34`)** — backfilled `UPDATE stock_movements sm SET branch_id = w.branch_id FROM warehouses w WHERE sm.warehouse_id = w.id AND sm.branch_id IS NULL AND w.branch_id IS NOT NULL;`
2. **`inventory_balances.branch_id BIGINT NULL`** — materialized table (confirmed); denormalize + backfill from warehouse (same pattern as #1). Index `(branch_id, product_id)`.
3. **`batch_master.branch_id BIGINT NULL`** — backfill from warehouse. Index `(branch_id, product_id)`.
4. **`bins.branch_id` / `bin_stock.branch_id BIGINT NULL`** — backfill from the owning warehouse. (Alternatively derive via warehouse join; a denormalized column is preferred for list-filter performance.)
5. **`stock_take_sessions.branch_id` / `stock_take_items.branch_id BIGINT NULL`** — denormalized from the session's warehouse; backfill.
6. **`stock_transfers.branch_id` context** — transfers are cross-branch: each leg's movement is already branch-stamped (via #1). The transfer *document* records `source_branch_id` / `dest_branch_id` (derive from source/dest warehouse); list query matches on either (§8, §6 StockTransferService).

### 5.2 Master-data tables — nullable `branch_id` + per-branch uniqueness (the central change)
7. **Add `branch_id BIGINT NULL` (FK → `branches.id`)** to: `departments`, `sub_departments`, `brands`, `units`, `barcode_templates`, `product_barcodes`. (`products` already has it.) Index `(branch_id)` on each.
8. **Relax global unique constraints to per-branch + global-null.** For each affected column, **drop** the existing global `UNIQUE(col)` and replace with two partial unique indexes (additive, and existing all-null data satisfies them immediately):
   - `CREATE UNIQUE INDEX ... ON t (col) WHERE branch_id IS NULL;` (global rows unique among themselves)
   - `CREATE UNIQUE INDEX ... ON t (col, branch_id) WHERE branch_id IS NOT NULL;` (each branch may reuse a code once)
   - Apply to: `products(code)`, `departments(code)`, `sub_departments(code)` and `sub_departments(name, department_id)`, `brands(code)` and `brands(name)`, `units(name)` and `units(symbol)`.
   - **Stale-schema note:** dropping a named unique constraint must be guarded (`DROP CONSTRAINT IF EXISTS`; also handle Hibernate-generated `uk<hash>` names by looking them up in `pg_constraint`). Where a tenant's constraint name differs, resolve it dynamically. No data is deleted; the partial indexes are stricter-or-equal for existing (all-null) rows.
9. **Backfill for master data: none.** Existing master rows stay `branch_id = NULL` (= shared/global). No data migration — this is the confirmed backward-compatibility decision.

### 5.3 Cross-cutting
10. Every new `branch_id` FK follows the **`V8__fk_constraints.sql` guard pattern** (skip if table/column absent, skip if FK already present, skip + `NOTICE` on orphans — never abort boot).
11. `warehouses.branch_id` / `products.branch_id` FKs already exist (Hibernate-generated, confirmed in the Phase 0 audit) — no new column there.

**No column is dropped or narrowed. No NOT NULL is added. No existing data is deleted or reassigned.** The only constraints removed are the *global* unique constraints, immediately replaced by stricter-or-equal partial unique indexes.

---

## 6. Backend changes

- **`StockMovementService`**: on every write, set `branch_id` from the warehouse's branch; assert warehouse↔branch consistency.
- **`StockMovementRepository`**: add branch-scoped aggregate variants of the existing on-hand SUM queries (`...AndBranchIdIn`). Keep the old unscoped ones for admin "All Branches".
- **Master-data services (`DepartmentService`, `SubDepartmentService`, `BrandService`, `UnitService`) — CHANGED, now in scope**: branch-filter list/search via `BranchAccessService.currentListScope()` (`branch_id IN (:ids) OR branch_id IS NULL`); stamp `branch_id` from the active branch on create (null when creating a global item in All-Branches); assert branch access on update/delete; enforce per-branch uniqueness (the paired partial indexes do this at the DB; services surface a friendly "code already used in this branch" error).
- **`ProductService`**: branch-filter list/search — now filters **both** catalog identity (branch rows + global fallback) **and** stock/availability. Reuse `BranchAccessService.currentListScope()`. Resolution by code/barcode tries active branch then global (§2.11).
- **`BarcodeService` / barcode resolution (`ProductBarcode`, `BarcodeTemplate`)**: branch-scope templates + product barcodes; scan resolution is active-branch-first with global fallback.
- **`WarehouseService` / `BinService` / `BinStockController`**: apply `filterBranchScoped(...)` to list endpoints; assert branch on create/update.
- **`InventoryBalanceService`**: compute on-hand over the active branch's warehouses.
- **`StockTransferService`**: allow cross-branch; ensure both branches can see the transfer; validate the acting user can access at least the source (or destination) branch via `BranchAccessService.canAccessBranch(...)`.
- **`StockTakeService`**: filter sessions by active branch; stamp branch on new sessions.
- **`BatchSelectionService` / `BatchAllocationService`**: resolve candidate batches within the active branch's warehouses.
- **`inventory/reports/*`**: default to active branch scope; honor "All Branches" for admins.
- **`pos/search/PosSearchService` & `PosLookupService`**: compute availability against active-branch warehouses.
- Keep all existing global endpoints working when `isAllBranches` (admin) — no regression for consolidated views.

---

## 7. Frontend changes

- **No new plumbing needed** for branch selection — `BranchContext` + `axiosConfig` already send `X-Branch-Id`. Backend filtering is transparent to existing calls.
- **Inventory pages** (`pages/Inventory/Product`, `Warehouse`, `StockTaking`, `StockTransfer`, `Reports`, `Barcode`): update copy/labels to reflect that stock figures are now branch-specific ("On-hand @ <active branch>"). Show the active branch name on stock columns.
- **Product list**: the on-hand/stock column should reflect the active branch; when admin is in "All Branches", show consolidated or per-branch breakdown.
- **Stock Transfer UI**: source and destination branch/warehouse pickers; make the cross-branch nature explicit.
- **Reports**: add a branch context indicator; allow admins to toggle consolidated vs. per-branch.
- **POS**: already branch-aware via session; verify stock badges use branch-scoped availability.

---

## 8. API changes

- **Backward compatible.** Existing inventory endpoints keep their paths; they simply begin honoring `X-Branch-Id` for filtering (same as Sales already does). Non-admin users are implicitly scoped to their branch; admins in "All Branches" see everything.
- Optionally add explicit query params for reports: `?branchScope=active|all` for admins.
- New (optional) endpoints for `product_branch_availability` CRUD if Approach A availability table is adopted.
- Document the behavior change in API notes: "inventory list/stock endpoints are now branch-scoped by the active branch header."

---

## 9. Security considerations

- Reuse `BranchAccessService.canAccessBranch(userId, branchId)` and `assertTransactionBranchAccessible(...)` for single-record inventory access (GET-by-id, edit, delete).
- Ensure a restricted (non-admin) user **cannot** read another branch's stock by omitting/forging `X-Branch-Id` — the server must derive allowed branches from JWT claims, never trust the header alone (already true: `JwtFilter.resolveActiveBranchId` validates the header against `allowedBranchIds`).
- Stock transfers: authorize on both endpoints of the transfer, not just one.
- Barcode/product resolution must not leak branch-private items (only relevant under Approach C).

---

## 10. Performance considerations

- **Denormalizing `branch_id` onto `stock_movements` is the key win** — turns branch filtering on the largest table from a join into an indexed predicate. Add composite indexes `(branch_id, product_id)` and `(branch_id, warehouse_id)`.
- On-hand aggregates already GROUP BY product/warehouse; adding `WHERE branch_id IN (:ids)` before grouping reduces scanned rows dramatically per branch.
- Avoid Java-side `filterBranchScoped` on large inventory lists — prefer DB-pushed `ListScope` predicates (the `pagination_perf` memory notes this is the established direction).
- Reports: consider a pre-aggregated per-branch on-hand snapshot table (analogous to `GlAccountBalance` for finance) if report latency becomes an issue at scale.

---

## 11. Migration strategy

1. **Phase 0 — additive schema.** Add nullable `branch_id` to `stock_movements` (+ indexes); backfill from `warehouses.branch_id`. No behavior change yet.
2. **Phase 1 — write-path stamping.** Start stamping `branch_id` on new movements. Deploy; verify new rows populated.
3. **Phase 2 — read-path scoping (behind a flag).** Add branch-scoped repository methods; gate the switch with a feature toggle (e.g. `inventory.branch-scope.enabled`, default false) so it can be enabled per tenant like existing `rbac.<module>.enabled` toggles.
4. **Phase 3 — enable per tenant.** Turn the flag on for one client, validate stock figures per branch and POS availability, then roll out.
5. **Phase 4 — warehouse/bin/stock-take/transfer scoping.** Apply list filters and cross-branch transfer rules.
6. **Phase 5 — reports & POS.** Branch-default reports with admin "All Branches" toggle.
7. Legacy null-branch rows remain globally visible throughout (no data hidden).

Each phase is independently deployable and reversible via the toggle.

---

## 12. Risks and dependencies

- **Risk: hiding existing stock.** If null-branch handling is wrong, existing on-hand could vanish from views. Mitigation: adopt the proven "null = visible to all" rule; keep the toggle default-off until validated.
- **Risk: double-counting in transfers.** Cross-branch transfers could be counted in both branches' on-hand incorrectly. Mitigation: on-hand is derived from signed `StockMovement` rows per warehouse; a transfer is an OUT at source + IN at destination — arithmetic stays correct as long as branch is derived from warehouse.
- **Risk: report regressions.** Consolidated reports must keep working for admins. Mitigation: preserve unscoped query paths for `isAllBranches`.
- **Dependency: `warehouses.branch_id` must be populated** for backfill to work. Audit for warehouses with null branch before enabling.
- **Dependency: POS session branch** must be reliable (it already is, per POS hardening memories).
- **Stale-schema hazard** (per project memory): NOT NULL / enum widening will break existing-client upgrades — keep everything nullable/additive.

---

## 13. Step-by-step implementation plan

> Approach C (branch-scoped everything) is **confirmed** — step 1 below is resolved. See the roadmap for the phased sequence; this is the high-level order.

1. ~~Confirm catalog model~~ **DONE — Approach C confirmed (branch-scope everything, `NULL` = shared/global).**
2. Additive Flyway migration for the stock ledger: `stock_movements.branch_id` + indexes + backfill (type-guarded, `to_regclass`). **DONE (`V34`, roadmap Phase 1).**
3. Stamp `branch_id` in `StockMovementService` write paths; assert warehouse↔branch consistency. (roadmap Phase 2)
4. Add branch-scoped aggregate methods to `StockMovementRepository`; wire `InventoryBalanceService`; add feature toggle `inventory.branch-scope.enabled` (default false). (roadmap Phase 3)
5. **NEW — Master-data branch-scoping**: additive `branch_id` + per-branch/global-null partial unique indexes for `departments`, `sub_departments`, `brands`, `units`, `products` (uniqueness), `barcode_templates`, `product_barcodes`; branch-filter their list/search; branch-stamp create; branch-first-then-global resolution. (roadmap Phases 6A–6B/9A — see roadmap)
6. Apply `ListScope` branch filters to Warehouse, Bin, StockTake, StockTransfer, Reports, POS lookup — all gated by the toggle. (roadmap Phases 4–10)
7. Update frontend labels/columns + master-data branch indicators; admin consolidated/per-branch report toggle. (roadmap Phase 11)
8. QA on one tenant: per-branch master data, on-hand, POS availability + branch-first barcode resolution, cross-branch transfers, admin consolidated reports. (roadmap Phase 12)
9. Roll out per tenant by flipping the toggle.
10. (Optional later) `product_branch_availability` for per-branch catalog *hiding* of shared items (distinct from branch-private items, which the `branch_id` column already supports).

---

## 14. Open questions / clarifications

> Most former open questions are now **resolved** by the confirmed requirement + the 2026-07-11 decisions. Resolved items are struck through with their answer; remaining items are genuinely still open.

1. ~~**Catalog model:** global (A) vs. branch-private (C)?~~ **RESOLVED → Approach C, module-wide (branch-scope everything; `NULL` = shared/global).**
2. ~~**Per-branch catalog hiding:**~~ **PARTIALLY RESOLVED** — branch-private items are supported natively via `branch_id`. *Hiding a shared (null-branch) item from a specific branch* is a separate, optional feature (`product_branch_availability`, roadmap Phase 13) — build only if a client asks.
3. ~~**Cross-branch transfer authorization:**~~ **RESOLVED (2026-07-11) → Option A "Split Authority".** Create/edit/request-approval/cancel/**send** require **source-branch** access; **receive** requires **destination-branch** access; a transfer is visible if the user can access **either** endpoint (admins/All-Branches see all). Destination is validated through a documented **validation hook** (allowed-destination policy), which for now keeps existing behaviour (no restriction) and is extensible without touching the transfer lifecycle. See the full matrix in [§17 Cross-Branch Transfer Authorization](#17-cross-branch-transfer-authorization-14-3--option-a).
4. ~~**Departments/Brands/Units global?**~~ **RESOLVED → NO. They are now branch-scoped** (nullable `branch_id`, per-branch uniqueness, `NULL` = shared/global). This is the core change from the confirmed requirement.
5. **Consolidated valuation presentation:** admin "All Branches" reports — summed, or per-branch broken down? **(Still open — needed by roadmap Phase 10.)** Recommended: summed by default, per-branch drill-down.
6. ~~**Barcode uniqueness / resolution:**~~ **RESOLVED → branch-aware with global fallback.** Scan resolves active-branch product first, then global (`NULL`). Barcode uniqueness follows the per-branch + global-null model (§2.11).
7. **Default warehouse per branch:** is `Branch.defaultWarehouse` always set? **(Still open — Phase 0 audit found BR02 has none.)** Needed by roadmap Phase 9 for POS/purchase default stamping; resolve as a business decision before then.
8. **Negative stock / `allowNegative`:** per-branch or per-product? **(Still open — needed by roadmap Phase 9.)** Recommended: keep per-product unless a requirement emerges.
9. ~~**Master-data governance:** who may create a global (null-branch) master item?~~ **RESOLVED → configurable per tenant, not hardcoded.** See [§15 Master-Data Governance](#15-master-data-governance-configurable) — a tenant sets `inventory.global-master.creation-enabled` + `inventory.global-master.allowed-roles`. Default: enabled, `SUPER_ADMIN,ADMIN`. **(Needed by roadmap Phase 6B write path.)**
10. **NEW — Existing-data audit for uniqueness:** before dropping a global unique constraint, confirm no tenant already has a case that would violate the new partial indexes (existing data is all-null, so the null-tier index is satisfied — but verify per tenant during rollout). **(Operational — per-tenant audit, like Phase 0.)**

---

## 15. Master-Data Governance (configurable)

**Principle:** *who* may create a **global** (`branch_id IS NULL`) master record — versus a branch-private one — is a **per-tenant policy**, not a hardcoded rule. Different tenants manage shared vs. branch-owned catalogs differently, so this is configuration, gated like the existing `rbac.*` toggles.

### Configuration keys (design — defaults shown)
```
# Master-Data Governance (Branch-Level Inventory)
inventory.global-master.creation-enabled=true          # may ANYONE create global (null-branch) master data?
inventory.global-master.allowed-roles=SUPER_ADMIN,ADMIN # which roles may, when creation-enabled=true
                                                        # optional add: BRANCH_MANAGER
```
- Per-tenant override in `application-{client}.properties` (same mechanism as branch/RBAC config).
- **`creation-enabled=false`** → *no one* may create global master data on this tenant; every new master row must carry a `branch_id` (branch-private only). Existing global rows are untouched and stay visible (backward compatible).
- **`creation-enabled=true`** → a user whose role is in `allowed-roles` may create a global row (leave `branch_id` null); everyone else's creates are stamped with their active branch.

### Resolution logic (write path)
On a master-data **create** (`Department`/`SubDepartment`/`Brand`/`Unit`/`Product`/`BarcodeTemplate`/`ProductBarcode`):
1. If the caller explicitly requests a **global** item (null branch):
   - allowed only when `inventory.global-master.creation-enabled=true` **and** the caller holds a role in `inventory.global-master.allowed-roles`;
   - otherwise → **reject** with a clear error ("Only {roles} may create shared/global master data on this tenant"), or (softer) silently stamp the caller's active branch — the reject is recommended so intent is explicit.
2. Otherwise stamp `branch_id` from `BranchAccessService.getRequiredCurrentUserBranch()` (branch-private).
3. Admins operating in **All-Branches** with `creation-enabled=true` + an allowed role create global by default (their active branch is null).

### Notes
- This governs **creation** only. Visibility of existing global rows (everyone sees them) is unchanged and not configurable — that is the backward-compatibility guarantee.
- Editing/deleting a global row is a separate concern: gate it behind the same `allowed-roles` (a branch user should not edit a shared item). Recommended, and cheap to add alongside the create guard.
- Roadmap: implemented in **Phase 6B** (master write path). The two properties ship (default-on, `SUPER_ADMIN,ADMIN`) with that phase.

---

## 16. Branch Inheritance & Validation Matrix

**Principle:** a branch-scoped record may reference **its own branch's** master data **or a global (`NULL`) master** — but **never another branch's** private master. This is the cross-reference integrity rule that keeps branch isolation meaningful. It is enforced at the **write path** (create/update), reusing `BranchAccessService`.

### The single rule (applies to every reference below)
> For a child row with effective branch `C` referencing a parent row with branch `P`:
> **ALLOW iff `P IS NULL` (global) OR `P = C` (same branch). REJECT if `P` is another branch (`P IS NOT NULL AND P <> C`).**
>
> Corollary for a **global child** (`C IS NULL`): it may reference only **global parents** (`P IS NULL`). A global item must not depend on any one branch's private master (it would be broken in every other branch). Reject `P IS NOT NULL` when `C IS NULL`.

### Validation matrix

Legend: **child branch** = the branch of the row being saved (or `NULL` if global); **parent branch** = the branch of the referenced master. ✅ allowed · ❌ rejected.

| Child entity → references → Parent entity | Parent = **global (NULL)** | Parent = **same branch** | Parent = **other branch** | Global child → branch parent |
|---|:---:|:---:|:---:|:---:|
| **Sub-Department** → Department | ✅ | ✅ | ❌ | ❌ |
| **Product** → Department | ✅ | ✅ | ❌ | ❌ |
| **Product** → Sub-Department | ✅ | ✅ | ❌ | ❌ |
| **Product** → Brand | ✅ | ✅ | ❌ | ❌ |
| **Product** → Unit | ✅ | ✅ | ❌ | ❌ |
| **Product barcode** → Product | ✅ | ✅ | ❌ | ❌ |
| **Barcode template** → (branch scope only; no master FK) | — | ✅ own/global | ❌ other | n/a |
| **Warehouse** → Branch | n/a (warehouse *is* branch-owned) | ✅ | ❌ | — |
| **Bin** → Warehouse | ✅ (global warehouse) | ✅ (same-branch warehouse) | ❌ (other branch's warehouse) | ❌ |
| **Stock movement** → Warehouse | ✅ (global wh → null branch stamp) | ✅ (branch derived from warehouse) | ❌ (movement branch must equal warehouse branch) | — |
| **Stock movement** → Product | ✅ (global product) | ✅ (same branch) | ❌ (other branch's product) | — |
| **Inventory balance** → (Product, Warehouse) | ✅ both global | ✅ same branch | ❌ mismatch | — |
| **Batch** → (Product, Warehouse) | ✅ both global | ✅ same branch | ❌ mismatch | — |
| **Stock-take session** → Warehouse | ✅ (global warehouse) | ✅ (same branch) | ❌ (other branch's warehouse) | — |
| **Stock-take item** → (Session, Product) | inherits session branch | ✅ same as session | ❌ product from another branch | — |
| **Stock transfer** → (source Warehouse, dest Warehouse) | see note ‡ | ✅ within accessible branches | ‡ cross-branch is the *point* — see below | — |

**‡ Stock transfer is the deliberate exception.** A transfer's whole purpose is to move stock **between branches**, so its two warehouse references legitimately belong to *different* branches. The rule for transfers is **not** "same branch"; it is **"the acting user must be authorized for the transfer per §14.3"** (source access to initiate; destination authorizes receipt). Each transfer leg still produces a `StockMovement` stamped with *that leg's* warehouse branch — so the movement-level rule above (movement branch = warehouse branch) holds on both legs, and on-hand arithmetic stays correct. The transfer *document* records `source_branch_id`/`dest_branch_id` and is visible to both.

### Enforcement (write path — reuse existing infra)
- **Consistency check on save.** For each branch-scoped reference, assert the parent is global-or-same-branch. Reuse/extend `BranchAccessService`:
  - warehouse↔document: `assertWarehouseMatchesBranch(warehouse, documentBranchId, label)` (already exists — the template).
  - a new generic helper, e.g. `assertMasterReferenceAccessible(parentBranchId, childBranchId, label)`, encoding "ALLOW iff parent null OR parent == child".
- **Global-child guard.** When saving a global (null-branch) master, assert every referenced parent is also global (reject branch-owned parents).
- **Where enforced:** master create/update (Phase 6B, Phase 6), stock write paths (Phase 2, already asserts warehouse↔branch), transfers (Phase 8, per §14.3).
- **Toggle interaction.** These asserts are only meaningful when branch-scoping is active. Gate them behind `inventory.branch-scope.enabled` so a toggle-off tenant behaves exactly as today (no new rejections).

### Edge cases
- **Legacy all-null data** satisfies every rule trivially (global child → global parent). No existing row is invalidated — nothing to migrate.
- **Re-parenting across branches** (e.g. moving a product to a different branch) must re-validate all its references under the new branch, or be disallowed; recommended: disallow silent branch reassignment of a master row (handle via the Phase-14 conversion wizard instead).
- **Mixed references** (a branch product referencing a global brand + a same-branch department) are fine — each reference is validated independently against the single rule.

---

## 17. Cross-Branch Transfer Authorization (§14.3 — Option A)

**Decision (2026-07-11): Option A "Split Authority".** A stock transfer is a two-ended lifecycle; authority follows the end being acted on. Neither party needs access to *both* branches. Inventory integrity is unaffected by the auth model — it comes from Phase-2 per-leg branch stamping + the ledger (OUT at source branch, IN at destination branch; company total unchanged). This is the **deliberate cross-branch exception** to the §16 same-branch reference rule.

### Per-operation authorization matrix

Let **S** = source-warehouse branch, **D** = destination-warehouse branch. "Access" = `BranchAccessService.canAccessBranch(userId, branch)` (admins/All-Branches always pass; a `NULL`/global warehouse branch is always accessible).

| Operation | Endpoint | Required access | Enforced via |
|---|---|---|---|
| Create | `POST /api/stock-transfers` | **source (S)** | assert access to S |
| Edit (DRAFT) | `PUT /api/stock-transfers/{id}` | **source (S)** | assert access to S |
| Request approval | `POST /{id}/request-approval` | **source (S)** | assert access to S |
| Cancel | `POST /{id}/cancel` | **source (S)** | assert access to S |
| **Send** (`markSent`, OUT at source) | `POST /{id}/send` | **source (S)** | assert access to S |
| **Receive** (`markReceived`, IN at dest) | `POST /{id}/receive` | **destination (D)** | assert access to D |
| Delete | `DELETE /{id}` | `ROLE_ADMIN` (existing gate, unchanged) | existing `@PreAuthorize` |

### Visibility rule (list / view)

A transfer is visible if the user can access **S OR D** (either endpoint). This is required so a transfer never disappears from a branch that is party to it. Admins / All-Branches see all transfers. Implemented as a list predicate: `sourceBranch ∈ scope OR destBranch ∈ scope` (plus global/null endpoints always visible), and a single-record guard on `GET /{id}` that permits access via either endpoint.

### Destination validation hook (refinement, 2026-07-11)

A source-branch user must **not** automatically be able to send to *every* branch. Phase 8 introduces a **validation seam** — `assertDestinationAllowed(sourceBranchId, destBranchId)` — invoked on create/send. **For now it is a permissive no-op** (preserves today's behaviour: any destination allowed) with a documented extension point so a future allowed-destination policy / company rule can be enforced **without changing the transfer lifecycle or the authorization matrix above**.

### Notes
- **Toggle-gated:** every new assertion is gated by `inventory.branch-scope.enabled`; with the toggle off, transfers behave exactly as today (no branch authorization — matching current production).
- **Segregation of duties + audit:** `send` and `receive` are attributed to different users at different branches — a genuine two-party trail. This is the seam the future approval workflow (Topic 05) attaches to (source-side dispatch approval, destination-side receipt approval).
- **No new roles.** Reuses `BranchAccessService.canAccessBranch` + the `user_branches` multi-branch junction.

---

## Revision Changelog — 2026-07-11 (branch-scope everything)

**Trigger:** confirmed business requirement — *everything under the Inventory module is branch-specific*, mirroring Sales and Purchase. This supersedes the document's original "global product catalog + global master data" assumption.

**Decisions confirmed with the business (2026-07-11):**
- **D1 — Legacy rows:** existing `branch_id IS NULL` inventory rows = **shared/global, visible to all branches**. No data migration, no reassignment. (Backward-compatible.)
- **D2 — Uniqueness:** **per-branch unique + global-null unique** — drop global `UNIQUE(code/name/symbol)`, replace with paired partial unique indexes (`WHERE branch_id IS NULL` and `WHERE branch_id IS NOT NULL`).
- **D3 — Barcodes:** **branch-aware resolution with global fallback** — scan resolves active-branch product first, then global.
- **D4 — All-Branches view:** **admins in All-Branches see everything (consolidated); non-admins see their branch + global rows.**

**Model change:** the adopted model is the document's former **Approach C**, now applied **module-wide** (master data included), not just to products. Approach A is marked SUPERSEDED.

**Sections changed by this revision:**
| Section | Change |
|---|---|
| Header / Goal | Reworded to "entire Inventory module branch-scoped, master data included"; added this changelog pointer. |
| §1.1 table | Master-data rows (Department/Sub-Dept/Brand/Unit) flipped from "global" to **branch-scoped target**; added a column-presence audit note (only `products`/`warehouses` have `branch_id` today; `stock_movements` via Phase 1). Barcode row → branch-scoped with fallback. |
| §1 closing | Rewrote the "work is…" summary to include adding `branch_id` to master tables + relaxing unique constraints. |
| §2 challenges | #1/#3/#8 rewritten (master-data scoping, per-branch uniqueness). Added **#11 (barcode branch-fallback)** and **#12 (children inherit branch)**. |
| §3 approaches | **Approach A → SUPERSEDED**; **Approach C → confirmed/recommended, module-wide**; Approach B reframed. |
| §4 architecture | Principle changed to "everything branch-scoped; NULL = shared/global". Removed the "what stays GLOBAL" category; master data moved into "what becomes branch-scoped"; added master-write-path + resolution + uniqueness enforcement layers. |
| §5 schema | Split into transactional (5.1) vs. master (5.2). Added `branch_id` to `departments/sub_departments/brands/units/barcode_templates/product_barcodes/inventory_balances/batch_master/bins/bin_stock/stock_take_*`. Added the **partial-unique-index uniqueness change** with stale-schema guards. Confirmed **no master-data backfill**. |
| §6 backend | Added master-data services (Department/SubDepartment/Brand/Unit) + barcode resolution to scope; `ProductService` now scopes catalog identity (not just stock). |
| §13 plan | Step 1 marked done (Approach C); added the master-data + uniqueness step; cross-referenced roadmap phases. |
| §14 open questions | #1/#2/#4/#6 **resolved**; #9 (governance) **resolved → configurable, see §15**; added #10 (per-tenant uniqueness audit). |

### Addendum — 2026-07-11 (architectural improvements: configurable governance, validation matrix, conversion wizard)

Three design-only improvements requested to make the architecture more configurable and future-proof (no implementation change to earlier phases):

| Addition | Detail |
|---|---|
| **§15 Master-Data Governance (configurable)** | Replaced the hardcoded "only admins create global master" stance with **per-tenant config**: `inventory.global-master.creation-enabled` (bool) + `inventory.global-master.allowed-roles` (default `SUPER_ADMIN,ADMIN`, optional `BRANCH_MANAGER`). Governs *creation* of global (null-branch) master data; visibility of existing global rows is unchanged. Implemented in roadmap Phase 6B. |
| **§16 Branch Inheritance & Validation Matrix** | New section defining the single cross-reference rule — a branch-scoped row may reference **own-branch or global** master, **never another branch's** — with a full allow/reject matrix across Department/Sub-Dept/Brand/Unit/Product/Warehouse/Bin/Barcode/Stock/Stock-Movement, the global-child→global-parent corollary, the **stock-transfer cross-branch exception (§14.3)**, and write-path enforcement via a new `assertMasterReferenceAccessible(...)` helper (gated by the toggle). |
| **New roadmap Phase 14 — Global → Branch Conversion Wizard** | Optional post-rollout utility to clone global master data into branch-owned copies (admin picks target branches, preserving references). Documented in the roadmap; does **not** affect current phases. |

**Unchanged / preserved:** the additive + nullable + type-guarded + idempotent migration strategy; the `V8` FK guard pattern; the `inventory.branch-scope.enabled` toggle (default off); the "null = visible to all" list-scope rule; Phase 0 audit findings; Phase 1 (`V34`) as already implemented. **No production behaviour changes as a result of this revision** — it changes the *plan*, not shipped code.
