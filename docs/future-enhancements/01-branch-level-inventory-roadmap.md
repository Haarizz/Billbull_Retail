# Branch-Level Inventory — Implementation Roadmap

> **Status: APPROVED FOR EXECUTION.** Design is locked in [`01-branch-level-inventory.md`](01-branch-level-inventory.md) (Approach A — global catalog + per-branch stock). This document is the execution plan; it does **not** authorize coding ahead of the phase it describes.
>
> **Golden rules for every phase below**
> - Each phase is **independently deployable** and leaves production behaviour unchanged until a feature toggle is flipped.
> - All schema changes are **additive, nullable, and type-guarded** (`to_regclass` / `information_schema`) per the stale-schema convention (`project_stale_schema_upgrade_hazard`). No column dropped, narrowed, or set NOT NULL; no data deleted.
> - The read-path behaviour change is gated by **`inventory.branch-scope.enabled`** (default `false`), toggled per tenant like the existing `rbac.<module>.enabled` flags.
> - Legacy `branch_id IS NULL` rows are **always visible** (the proven "null = shared/global" rule already implemented in `BranchAccessService`).

## Baseline verified against the codebase (2026-07-11)

| Design assumption | Verified? | Note |
|---|---|---|
| `BranchAccessService.ListScope` / `currentListScope()` exist | ✅ | `settings/branch/BranchAccessService.java` — `ListScope(allBranches, branchIds)` record, `currentListScope()`, `currentExactScope()`, `canAccessBranch(userId, branchId)`, `assertWarehouseMatchesBranch(...)` all present. |
| `StockMovement` has **no** `branch_id` | ✅ | `purchase/stockmovement/StockMovement.java` — only `warehouseId`. Indexes: `idx_sm_product_id`, `idx_sm_warehouse_id`, `idx_sm_product_source_created`. |
| On-hand aggregates join `warehouses` to reach branch | ✅ | `findActiveProductStockSummary(branchId)` already does `LEFT JOIN warehouses w ... w.branch_id = :branchId`. This is precisely the join the denormalized column eliminates. |
| Next Flyway version | ⚠️ correction | Design doc says "V30 latest"; tree is at **V33** (`V33__pos_session_card_closing.sql`). **The new migration is `V34`.** All version numbers below are relative to this. |
| `products.branch_id`, `warehouses.branch_id` FKs exist | ✅ (assumed per design §1.1) | Confirm empirically in Phase 0 pre-flight before backfill. |

---

## Phase map

| # | Phase | Ships behaviour change? | Toggle-gated? | Complexity |
|---|---|---|---|---|
| 0 | Pre-flight audit & data hygiene | No | n/a | S |
| 1 | Additive schema: `stock_movements.branch_id` + backfill | No | n/a | S |
| 2 | Write-path stamping | No (data only) | No | M |
| 3 | Branch-scoped aggregate repo methods + feature toggle | No (dormant code) | Yes (off) | M |
| 4 | Inventory balance & on-hand reads | Yes (behind toggle) | Yes | M |
| 5 | Warehouse / Bin list scoping | Yes (behind toggle) | Yes | S |
| 6 | Product list/search stock column scoping | Yes (behind toggle) | Yes | M |
| 7 | Stock-take scoping | Yes (behind toggle) | Yes | M |
| 8 | Stock-transfer cross-branch rules | Yes (behind toggle) | Yes | L |
| 9 | POS availability scoping | Yes (behind toggle) | Yes | M |
| 10 | Inventory reports (active vs. All-Branches) | Yes (behind toggle) | Yes | M |
| 11 | Frontend labels & branch indicators | Yes (cosmetic) | Follows toggle | M |
| 12 | Per-tenant rollout & toggle-on | Yes (opt-in) | Flip | S |
| 13 | (Optional) `product_branch_availability` + branch-private items | Yes | New toggle | L |

Complexity key: **S** ≤ ~1 day · **M** ~2–4 days · **L** ~1 week+ (one engineer, incl. tests).

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

## Phase 6 — Product list/search stock-column scoping (behind toggle)

**Objective.** The product catalog stays global (identity unchanged); the **stock/on-hand column** reflects the active branch when the toggle is on.

**Scope.** `ProductService` list/search, product DTO assembly.

**Files/modules affected.**
- `inventory/product/ProductService.java` — the code paths that attach on-hand to product rows (they call `getTotalAvailableStockForProducts` / `findActiveProductStockSummary`).

**Database changes.** None.

**Backend changes.**
- Catalog identity queries: **unchanged** (Approach A — all products visible).
- On-hand enrichment: swap to the Phase-3 branch-scoped aggregate when toggle on + branch active; consolidated when All-Branches.
- Existing `findActiveProductStockSummary(branchId)` already accepts a branch — reuse it; pass the active branch id from the resolver.

**Frontend changes.** None yet (column label in Phase 11).

**API changes.** Product list on-hand becomes branch-specific under toggle; product identity/paging unchanged. Optional `?branchScope=active|all` for admins.

**Risks.** Search/pagination performance if branch predicate isn't index-backed — mitigated by Phase 1 composite indexes and DB-pushed `ListScope` (no Java-side filtering of large lists, per `pagination_perf`).

**Testing checklist.**
- [ ] Toggle off → product list + stock identical to today.
- [ ] Toggle on → same product rows, stock column = active-branch on-hand.
- [ ] Admin All-Branches → consolidated stock.
- [ ] Pagination + search still correct and index-backed (check query plan on a large tenant).

**Estimated complexity.** M.

**Dependencies.** Phase 3, Phase 4.

**Exit criteria.** Catalog row count identical across branches (proves identity stayed global); stock column verified per-branch on a control set; query plan uses `idx_sm_branch_product`.

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

**Backend changes.**
- **Visibility:** a transfer must appear in both branches' lists. Because on-hand is derived from signed movements per warehouse, the OUT (source branch) and IN (destination branch) are each branch-correct automatically. The transfer *document* list query must match on `source_branch OR dest_branch ∈ scope` (not a single `branch_id`).
- **Authorization:** decide the rule (Open Question §14.3) — recommended default: user needs access to **at least the source** to initiate; destination receipt authorized on the destination side. Enforce via `canAccessBranch(userId, branchId)` on both endpoints of the flow.
- Guard against a transfer being counted twice in any single-branch on-hand (it can't be, since each leg is a distinct warehouse/branch — but add a regression test proving it).

**Frontend changes.** Source & destination branch/warehouse pickers made explicit (Phase 11 covers copy; the picker wiring lands here if new fields are needed).

**API changes.** Transfer list/detail honor both-branch visibility; transfer create may require both-branch auth depending on the §14.3 decision.

**Risks.**
- **Double-counting** (design §12) — highest-attention risk. Mitigation: never sum a transfer document into on-hand; on-hand is *only* ever the movement ledger. Add an explicit test: create transfer A→B, assert A's on-hand drops by qty and B's rises by qty, and company total is unchanged.
- A restricted single-branch user seeing/initiating cross-branch flows — resolved by the §14.3 authorization decision (must be made before this phase; see Blocking Decisions).

**Testing checklist.**
- [ ] Transfer A→B: A on-hand −qty, B on-hand +qty, company total unchanged.
- [ ] Transfer visible in both A's and B's transfer lists (toggle on).
- [ ] Auth: user with only-A access can/can't initiate per the chosen rule; destination-only user behaviour per rule.
- [ ] Toggle off → legacy behaviour (no cross-branch guard) unchanged.
- [ ] No double-count in any single-branch report.

**Estimated complexity.** L.

**Dependencies.** Phase 2 (both legs stamped), Phase 3/4 (branch on-hand), **§14.3 authorization decision resolved**.

**Exit criteria.** Cross-branch transfer demonstrated end-to-end with correct on-hand on both sides, correct visibility, and the agreed authorization enforced; double-count regression test green.

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

**Dependencies.** Phase 3, Phase 4; reliable POS session branch.

**Exit criteria.** Till dry-run confirms branch-correct availability with no oversell; RESERVED logic intact.

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

**Scope.** Inventory pages + POS badges.

**Files/modules affected.**
- `pages/Inventory/Product`, `Warehouse`, `StockTaking`, `StockTransfer`, `Reports`, `Barcode`.
- Stock-transfer source/destination pickers.
- Report branch-context indicator + admin consolidated/per-branch toggle.

**Database changes.** None.

**Backend changes.** None.

**Frontend changes.**
- On-hand columns labeled "On-hand @ <active branch>"; show active branch name.
- Product list stock reflects active branch; admin All-Branches shows consolidated or per-branch breakdown.
- Stock-transfer UI makes cross-branch explicit (source vs. destination branch/warehouse).
- Reports: branch-context indicator + admin toggle wired to `?branchScope`.
- POS: verify badges use branch-scoped availability (should be automatic).

**API changes.** None (consumes existing/Phase-10 params).

**Risks.** Cosmetic drift if labels ship before the backend toggle is on for a tenant (label says "@ Branch" but numbers are still global). Mitigation: gate the label copy on the same tenant toggle state (expose toggle state via an existing settings/bootstrap endpoint), or ship labels together with per-tenant enable in Phase 12.

**Testing checklist.**
- [ ] `npm run build` + `npm run lint` green.
- [ ] Labels reflect active branch; switch branch → label + numbers update.
- [ ] Admin All-Branches → consolidated indicator shown.
- [ ] Transfer UI clearly shows source vs. destination branch.

**Estimated complexity.** M.

**Dependencies.** Phases 4–10 (the data they label).

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
- [ ] POS availability correct at each branch's till.
- [ ] Cross-branch transfer correct on both sides.
- [ ] Admin consolidated report unchanged from pre-flip All-Branches value.
- [ ] Null-branch legacy stock still visible everywhere.
- [ ] Rollback rehearsed: flip toggle off → figures return to company-wide.

**Estimated complexity.** S (per tenant).

**Dependencies.** All prior phases deployed.

**Exit criteria.** Pilot tenant validated + signed off; documented rollout runbook; then repeat per tenant.

---

## Phase 13 — (Optional) `product_branch_availability` + branch-private items

**Objective.** Only if the business needs per-branch catalog hiding (§14.2) or branch-private SKUs (Approach C, §3). Kept fully separate so core rollout isn't blocked on this decision.

**Scope.** New availability table + resolution logic; optionally relax `products.code` uniqueness to a partial unique index for branch-private items.

**Files/modules affected.**
- New `V37__product_branch_availability.sql` (additive).
- `inventory/product/*` — availability overlay (mirror `ProductBranchPricing` pattern).
- Barcode/product resolution — "global OR my-branch" logic (Approach C only).

**Database changes.**
- `product_branch_availability (id, product_id, branch_id, available_in_pos boolean, is_stocked boolean, ...)` — additive, mirrors `product_branch_pricing`.
- (Approach C only) partial unique index enforcing global uniqueness among null-branch `products.code`, allowing `(code, branch_id)` for branch-owned rows. **No change to the existing global unique constraint under Approach A.**

**Backend changes.** Availability overlay in product list/POS resolve; barcode resolution respecting branch-private items (Approach C).

**Frontend changes.** Per-branch availability admin UI.

**API changes.** New CRUD for `product_branch_availability`.

**Risks.** Uniqueness/resolution complexity (design §3 Approach C caveat). Mitigation: implement availability-hiding first (low risk, mirrors pricing); defer branch-private SKUs until a concrete requirement exists.

**Testing checklist.**
- [ ] Product hidden at branch A shows in A's catalog per `available_in_pos`/`is_stocked` flags; visible elsewhere.
- [ ] (Approach C) same `code` in two branches resolves to the right product on scan.
- [ ] Global uniqueness among null-branch codes still enforced.

**Estimated complexity.** L.

**Dependencies.** §14.2 decision (hiding needed?) and, for branch-private items, §14.1 (Approach C adopted?).

**Exit criteria.** Availability hiding validated on one tenant; branch-private SKU path only if explicitly required.

---

## Blocking decisions to resolve before the phase that needs them

| Open question (design §14) | Needed by | Recommended default |
|---|---|---|
| §14.1 Catalog model: Approach A vs. C | Phase 0 (locks scope) | **A** (global catalog) — already assumed |
| §14.3 Cross-branch transfer authorization | **Phase 8** (blocks it) | User needs source-branch access to initiate; destination receipt authorized destination-side |
| §14.2 Per-branch catalog hiding required? | Phase 13 (gates it) | Defer unless a client asks |
| §14.5 Admin consolidated presentation (summed vs. per-branch breakdown) | Phase 10 | Summed by default, per-branch drill-down via `branchScope=all` |
| §14.7 Is `Branch.defaultWarehouse` always set? | Phase 2 (stamping fallback) | Audit in Phase 0; require it before enabling POS/purchase default stamping |
| §14.8 `allowNegative` per-branch or per-product? | Phase 9 (POS availability) | Keep per-product (current model) unless a requirement emerges |

§14.4 (Departments/Brands/Units global) and §14.6 (barcodes global) are confirmed **global** by the design — no code impact, they simply stay as-is.

---

## Cross-cutting testing strategy

- **Toggle-off invariance is the safety net.** Every backend phase (3–10) must prove *byte-identical* output with `inventory.branch-scope.enabled=false`. This is what makes each phase independently deployable to production without risk.
- **Control-set validation.** Maintain a fixed set of (product, branch) on-hand control numbers computed by hand; assert against them at Phase 4, 6, 10, and 12.
- **Ledger-is-truth regression.** A standing test that on-hand always equals `SUM(signed movements)` per warehouse — guards against any transfer/double-count regression (design §12).
- **Native-query tests run on real Postgres** (the new scoped aggregates use PG casts), matching existing repo-test setup.
- Run `mvn -o test` (unit suite is fully green today except the DB-dependent `contextLoads`) after every backend phase; `npm run build` + `npm run lint` after Phase 11.
