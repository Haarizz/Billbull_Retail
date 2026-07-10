# Topic 1 — Branch-Level Inventory

> **RESEARCH / DESIGN ONLY — not implemented. No schema or migration in this document has been applied.**

Goal: make the **Inventory module branch-specific** rather than global. Cover products, stock, warehouses, storage locations, stock movements, stock transfers, stock taking, barcode features, reports, and every inventory sub-module. Decide explicitly what stays global and what becomes branch-scoped.

---

## 1. Current system behavior

### 1.1 What is global vs. branch-aware today

The Inventory module (`inventory/*`) is **deliberately global**. In contrast, `sales/`, `purchase/`, and `financials/` are already branch-scoped through `BranchAccessService`. Concretely:

| Concern | Current model | Branch column? | Branch-filtered in queries? |
|---|---|---|---|
| **Product** (`inventory/product/Product`) | One global catalog row per SKU, unique on `code` | **Yes** — nullable `branch_id` FK exists (`@Index idx_product_branch`), null = "company-wide" | **No** — list/search queries return all products regardless of active branch |
| **Product pricing** | Global `ProductPricing` (1:1) **plus** per-branch overrides | Yes — `ProductBranchPricing` side table (`product_branch_pricing`, `findByProductIdAndBranchId`) | Yes — `ProductService.findActiveBranchPrice(...)` overlays branch price using `BranchScope.currentBranchId()` |
| **Warehouse** (`inventory/warehouse/Warehouse`) | Global list | **Yes** — nullable `branch_id` FK; `Branch.defaultWarehouse` links back | Partially — `BranchAccessService.assertWarehouseMatchesBranch(...)` guards linkage, but warehouse *list* endpoints are not branch-filtered |
| **Bin / storage location** (`inventory/warehouse/Bin`, `BinStock`) | Global, keyed by warehouse | Indirect (via warehouse's branch) | No |
| **Stock movement** (`purchase/stockmovement/StockMovement`) | Append-only ledger, source of truth | **No `branch_id`** — only `warehouseId` (branch derivable only by joining `warehouses.branch_id`) | No |
| **Inventory balance** (`inventory/balance/InventoryBalance`) | Derived / materialized on-hand | Via warehouse | No |
| **Batch** (`inventory/batch/*`) | Global batch master + allocations | Via warehouse/movement | No |
| **Stock transfer** (`inventory/stocktransfer/*`) | Moves stock between warehouses | Implicit (source/dest warehouse each belong to a branch) | No cross-branch guard today |
| **Stock take** (`inventory/stocktake/*`) | Per-warehouse counting session | Via warehouse | No |
| **Barcode** (`inventory/barcode/BarcodeTemplate`, `ProductBarcode`) | Global templates + per-product barcodes | No | No |
| **Departments / Sub-departments / Brands / Units** | Global master data | No | No |
| **Reports** (`inventory/reports/*`) | Aggregate over all `StockMovement` | No | No |

### 1.2 How branch is resolved on a request (already built)

- `JwtFilter` reads JWT claims + `X-Branch-Id` header → sets `BranchContextHolder` (`activeBranchId`, `allowedBranchIds`, `isAllBranches`).
- `BranchScope.currentBranchId()` returns the active branch (null = All Branches / admin).
- `BranchAccessService` provides `ListScope`, `filterBranchScoped(...)`, `assertTransactionBranchAccessible(...)`, `assertWarehouseMatchesBranch(...)`.
- Frontend: `BranchContext.jsx` → `sessionStorage.activeBranchId` → `axiosConfig.js` attaches `X-Branch-Id`.

**The plumbing to scope inventory already exists and is proven in Sales. The work is to apply it to inventory, and to add the missing `branch_id` on the stock ledger.**

---

## 2. Challenges and edge cases

1. **Stock is inherently location-based, product identity is not.** The right conceptual model is: **product master = global identity**, **stock/quantity = per-branch (per-warehouse)**. Warehouses already belong to a branch, so stock is *implicitly* branch-scoped through `warehouse_id`. The catalog is the real question: do we fork products per branch or keep one catalog?
2. **`StockMovement` has no `branch_id`.** Every on-hand aggregate (`SUM(quantity) GROUP BY product/warehouse`) must currently join `warehouses` to know the branch. Adding `branch_id` to `stock_movements` (denormalized, stamped at write) makes branch filtering a cheap indexed predicate instead of a join — essential for report performance on the highest-volume table.
3. **`code` uniqueness is global** (`uniqueConstraints = @UniqueConstraint(columnNames = "code")`). If products become branch-owned, two branches may legitimately want the same code → the unique constraint must become `(code, branch_id)` or products must stay global.
4. **Legacy null-branch rows.** Millions of existing rows have `branch_id = NULL`. The existing convention (`BranchAccessService.matchesActiveListScope`) treats null-branch rows as visible to everyone. Inventory must adopt the same "null = shared/global, always visible" rule to avoid hiding existing data.
5. **Stock transfers are cross-branch by nature.** A transfer from Branch A's warehouse to Branch B's warehouse must be visible to *both* branches (or at least not disappear from either). Branch scoping must not break legitimate inter-branch flows.
6. **POS lookups must respect branch.** `pos/search/PosSearchService` resolves barcode → product → available stock. Available stock must be computed for the *active branch's* warehouses only, or POS at Branch B will show Branch A's stock.
7. **Reports that intentionally span branches** (consolidated company inventory valuation) must still work for admins in "All Branches" mode.
8. **Global master data** (Departments, Brands, Units, Sub-departments, barcode *templates*) should almost certainly stay global — branch-forking them creates duplication and reconciliation pain.
9. **Purchase receipts pick the warehouse, not the branch directly.** The branch stamped on a `StockMovement` must be derived from the receiving warehouse's branch at write time (consistency check needed).
10. **Multi-warehouse-per-branch.** A branch can own several warehouses. Branch-level stock = SUM over all warehouses whose `branch_id = active`.

---

## 3. Possible implementation approaches

### Approach A — "Global catalog + per-branch stock" (RECOMMENDED)

- **Product, Department, Brand, Unit, Sub-department, Barcode templates stay GLOBAL.** One catalog for the whole company.
- **Stock becomes branch-scoped naturally** by scoping *warehouses* to branches (already modeled) and stamping `branch_id` on `stock_movements` at write time.
- Per-branch *availability* of a product (whether it's sellable/visible at a branch) handled by an optional `product_branch_availability` flag table (mirrors the existing `ProductBranchPricing` pattern) — **only if** the business needs to hide catalog items per branch. If every product is potentially stockable everywhere, this table is not needed.
- List/search endpoints gain a branch filter that, for inventory *quantities*, filters by the active branch's warehouses; for the *catalog*, shows all global products (optionally intersected with the availability table).

**Pros:** minimal duplication, matches existing pricing pattern, smallest migration, keeps global unique `code`. **Cons:** cannot have two branches with genuinely different products under the same code (rarely needed in retail).

### Approach B — "Branch-owned products" (fork the catalog)

- Enforce `product.branch_id` NOT NULL going forward; unique constraint becomes `(code, branch_id)`.
- Each branch has its own product rows; shared items must be duplicated or referenced.

**Pros:** total isolation. **Cons:** massive duplication, breaks global reporting, huge migration, contradicts the existing `ProductBranchPricing` design. **Not recommended.**

### Approach C — "Hybrid: shared catalog, branch-owned local items"

- Products default to global (`branch_id = NULL`); a branch may create branch-private items (`branch_id = X`).
- Unique constraint relaxed to `(code, branch_id)` with a partial unique index enforcing global uniqueness among null-branch rows.

**Pros:** flexible. **Cons:** the most complex uniqueness/resolution logic (barcode scan must resolve "global OR my-branch"). A pragmatic middle ground if branch-private SKUs are a real requirement.

**Recommendation: Approach A**, with the door left open to Approach C's branch-private items later (the `branch_id` column already supports it).

---

## 4. Recommended architecture

**Principle: "Product identity is global; stock, availability, and movement are branch-scoped."**

### What stays GLOBAL
- Product master (identity, code, name, descriptors, serial/batch flags, tax class)
- Departments, Sub-departments, Brands, Units
- Barcode *templates* (`BarcodeTemplate`) and per-product barcodes (`ProductBarcode`) — a barcode identifies a product, not a branch
- Base `ProductPricing` (with per-branch overrides already handled by `ProductBranchPricing`)

### What becomes BRANCH-SCOPED
- **Warehouses & Bins** — already have branch linkage; enforce it in list endpoints
- **Stock movements** — add denormalized `branch_id`, stamped from the warehouse's branch at write
- **Inventory balances / on-hand** — computed per active branch (SUM over branch's warehouses)
- **Stock transfers** — visible to source and destination branches; cross-branch transfers explicitly allowed
- **Stock takes** — a session belongs to a warehouse → a branch; list filtered by active branch
- **Batch allocations & availability** — resolved within the active branch's warehouses
- **Inventory reports** — default to active branch; "All Branches" for admins
- **POS product availability & stock** — resolved against the active branch's warehouses

### Enforcement layers (reuse existing infra)
1. **Write path:** derive `branch_id` from the receiving/issuing warehouse; call `BranchAccessService.assertWarehouseMatchesBranch(...)` (already exists) to prevent stamping a warehouse that doesn't belong to the document's branch.
2. **Read path (lists):** use `BranchAccessService.currentListScope()` → push `branch_id IN (:ids) OR branch_id IS NULL` into repository queries (the `ListScope` record already produces exactly this).
3. **Aggregates:** add branch-aware repository methods on `StockMovementRepository` (`... WHERE branch_id IN :ids GROUP BY product_id`).

---

## 5. Database / schema changes (design only — DO NOT create migrations now)

> Follow the project's stale-schema convention (see `project_stale_schema_upgrade_hazard` memory): new columns must be **nullable** or type-guarded; enum widening and NOT NULL need pre-patch SQL. All changes should be **additive Flyway migrations** guarded with `to_regclass`/`information_schema` checks, run before Hibernate.

1. **`stock_movements.branch_id BIGINT NULL`** (FK → `branches.id`), plus index `idx_sm_branch_product (branch_id, product_id)` and `idx_sm_branch_warehouse (branch_id, warehouse_id)`.
   - Backfill: `UPDATE stock_movements sm SET branch_id = w.branch_id FROM warehouses w WHERE sm.warehouse_id = w.id AND sm.branch_id IS NULL;`
   - Keep nullable (legacy/global rows stay null and remain visible).
2. **`inventory_balance.branch_id`** (if `InventoryBalance` is materialized) — same denormalization + backfill.
3. **`stock_take_sessions.branch_id`** (denormalized from warehouse) — optional; can be derived via join initially.
4. **(Optional, Approach A availability)** `product_branch_availability (id, product_id, branch_id, available_in_pos boolean, is_stocked boolean, ...)` — mirrors `ProductBranchPricing`. Only if per-branch catalog hiding is required.
5. **No change** to `products.code` uniqueness under Approach A. (Under Approach C it becomes a partial unique index.)
6. Confirm `warehouses.branch_id`, `products.branch_id` FKs and indexes already exist (they do) — no new columns there.

**No column should be dropped or narrowed. No existing data deleted.**

---

## 6. Backend changes

- **`StockMovementService`**: on every write, set `branch_id` from the warehouse's branch; assert warehouse↔branch consistency.
- **`StockMovementRepository`**: add branch-scoped aggregate variants of the existing on-hand SUM queries (`...AndBranchIdIn`). Keep the old unscoped ones for admin "All Branches".
- **`ProductService`**: branch-filter list/search when `BranchScope.applies()` — for Approach A this filters *stock/availability*, not the catalog identity (catalog stays visible; quantity shows active-branch on-hand). Reuse `BranchAccessService.currentListScope()`.
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

1. Confirm business decision: **Approach A (global catalog + branch stock)** vs. C (branch-private items allowed). (Open question — see §14.)
2. Write additive Flyway migration: `stock_movements.branch_id` + indexes + backfill (type-guarded, `to_regclass`).
3. Stamp `branch_id` in `StockMovementService` write paths; assert warehouse↔branch consistency.
4. Add branch-scoped aggregate methods to `StockMovementRepository`; wire `InventoryBalanceService` to them.
5. Add feature toggle `inventory.branch-scope.enabled` (default false).
6. Apply `ListScope` branch filters to Product, Warehouse, Bin, StockTake, StockTransfer, Reports, POS lookup — all gated by the toggle.
7. Update frontend labels/columns to indicate branch-specific stock; add admin consolidated/per-branch report toggle.
8. QA on one tenant: verify per-branch on-hand, POS availability, cross-branch transfers, admin consolidated reports.
9. Roll out per tenant by flipping the toggle.
10. (Optional later) add `product_branch_availability` for per-branch catalog visibility; add branch-private items (Approach C).

---

## 14. Open questions / clarifications

1. **Catalog model:** one global product catalog (Approach A) or branch-private products allowed (Approach C)? Retail default is A.
2. **Per-branch catalog hiding:** must a product be hideable per branch (needs `product_branch_availability`), or is every product potentially stockable everywhere?
3. **Cross-branch transfer authorization:** must the user have access to *both* branches, or is access to either endpoint sufficient?
4. **Departments/Brands/Units:** confirmed global? (Recommended yes.)
5. **Consolidated valuation:** how should admin "All Branches" reports present stock — summed, or per-branch broken down?
6. **Barcode uniqueness:** confirm barcodes stay global (a scanned barcode resolves to one product company-wide).
7. **Default warehouse per branch:** is `Branch.defaultWarehouse` always set? Needed for POS/purchase default stamping.
8. **Negative stock / allowNegative:** does this policy vary per branch or stay per product?
