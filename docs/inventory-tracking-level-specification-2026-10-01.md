# BillBull ERP — Warehouse vs Bin Inventory Management

## Functional Rules & Target Architecture Specification

> **Status:** SPECIFICATION ONLY. No code, migration, API, frontend or test is changed by this document.
> **Date:** 2026-10-01 · **Baseline commit:** `031ac383` (branch `feature/posclient`) · **Highest applied Flyway version at baseline:** `V107`
>
> **Evidence base.** Every "current behaviour" statement was re-verified against the code at the baseline commit. The original read-only audit was not available as a file, so its findings were reproduced from source. File references use the abbreviation **`be/`** = `billbull-backend/src/main/java/com/billbull/backend/`.
>
> **Statement labels used throughout:**
>
> | Label | Meaning |
> |---|---|
> | **[CURRENT]** | Confirmed existing behaviour, with file reference |
> | **[RULE]** | Target business rule. Normative: implementations MUST follow it |
> | **[REC]** | Recommendation (design/technical choice). It may be replaced by an equivalent that satisfies every [RULE] |
> | **[DECISION]** | Requires product/business sign-off. A default is stated and applies unless overridden; all are collected in §30 |

---

## 1. Executive Summary

BillBull will support one **tenant-global** setting, **Inventory Tracking Level**, with two values:

- **WAREHOUSE.** Stock is controlled per **Product + Warehouse**. Bins may exist as physical organisation, but no transaction requires or records a bin for new stock.
- **BIN.** Stock is controlled per **Product + Warehouse + Bin**. Every physical stock movement carries a bin that belongs to the movement's warehouse. Warehouse stock is the sum of its bins.

The architecture keeps **one authoritative ledger**, `stock_movements`. The mode does not change the ledger's shape. It changes only:

1. which location fields are **required** on new movements;
2. how outbound stock is **allocated** to stock identities;
3. what the UI **shows and asks for**.

No second ledger is introduced. `inventory_balances` remains a warehouse-level derived cache. `bin_stock` is formally retired.

A central **location policy** (`InventoryLocationPolicy`, resolved by `InventoryTrackingLevelResolver`) is the single decision point. `StockMovementService` becomes the **only** write path to the ledger, and it enforces the policy as a last line of defence.

The rollout cannot be done safely on top of today's code. Section 25 lists **9 BLOCKER defects** that must be fixed first. The most serious:

- Stock transfers and stock take write the ledger without going through `StockMovementService`.
- Batch FEFO selection is not warehouse-scoped.
- Bin ownership is not validated on purchase and transfer paths.
- Bins, locators and zones are physically deleted.
- Sales returns and negative overrides write unlocated (NULL-bin) stock.

Switching from WAREHOUSE to BIN is a **controlled migration**: preflight, then a transition state with guided putaway, then cutover. Switching from BIN to WAREHOUSE is a near-immediate relaxation. Historical data is **never rewritten**. Only its interpretation depends on the active mode.

---

## 2. Current Architecture

### 2.1 Location hierarchy

**[CURRENT]**
- `Branch` 1—* `Warehouse` (`warehouses.branch_id`, nullable). `Branch.defaultWarehouse` is the POS/Fast-Sale default.
- `Warehouse` 1—* `Zone` (`warehouse_zones.warehouse_id`, NOT NULL) 1—* `Locator` (`warehouse_locators.zone_id`) 1—* `Bin` (`warehouse_bins.locator_id`).
  - A bin has **no direct `warehouse_id`**. Ownership is only derivable through `bin → locator → zone → warehouse` (`be/inventory/warehouse/Bin.java`, `Locator.java`, `Zone.java`).
- `Bin.code` is **not unique**. `BinRepository.findAllByCode` exists precisely because duplicates occur.
- `Bin.capacity` (Integer) and `Zone.zoneType` (`Receiving, Storage, Shipping, Cold, Quarantine` — free text) exist.
- Zone, locator and bin deletes are **physical** (`binRepository.delete`, `locatorRepository.delete`, `zoneRepository.delete`) with **no stock check** (`BinService.deleteBin`, `LocatorService.deleteLocator`, `ZoneService.deleteZone`).
- `stock_movements.bin_id/zone_id/locator_id` have **no FK** (`V8__fk_constraints.sql` declares FKs only for `product_id` and `warehouse_id`). A deleted bin therefore leaves dangling ledger references. Warehouse deletes are FK-protected.

### 2.2 The ledger

**[CURRENT]** `be/purchase/stockmovement/StockMovement` (`stock_movements`) is append-only. Columns:

- **Location:** `warehouse_id` (required by every `StockMovementService` method), `branch_id` (stamped from the warehouse), and nullable `zone_id`, `locator_id`, `bin_id`.
- **Identity:** `batch_number`, `expiry_date`, `serial_number`.
- **Quantity:** signed `quantity` `NUMERIC(18,3)`.
- **Cost and audit:** `unit_cost`, `negative_override`.
- **Source:** `source_type` + `source_id` (polymorphic, no FK).

`StockSourceType` = `LPO, GRN, DIRECT_PURCHASE, DELIVERY_NOTE, STOCK_TRANSFER_IN, STOCK_TRANSFER_OUT, SALES_INVOICE, SALES_RETURN, CANCELLED, STOCK_TAKE, STOCK_TAKE_BATCH, STOCK_TAKE_ADJUSTMENT`. There is no `PURCHASE_RETURN` and no adjustment type.

**[CURRENT]** Stock is fundamentally **warehouse-level**:
- `getAvailableStock(warehouseId, productId)` = `SUM(quantity)` over the warehouse, all bins **plus** NULL-bin rows.
- Bin is an optional sub-dimension.
- Bin-level queries exist: `getStockByBin`, `findActiveBinsByWarehouseAndProduct`, `findStockIdentitiesByProductAndBin`, `getUnlocatedStock`.

**[CURRENT]** `StockMovementService` (`postInboundStock`, `postInboundSerializedStock`, `postOutboundStock`, `reverseOutboundStock`, `inward`) is documented as the single source of truth. However:

- **Stock transfers** (`StockTransferService.markSent/markReceived`, via `buildStockMovement` + `stockMovementRepository.save`) **bypass it**.
- **Stock take** (`StockTakeService.approveSession`, `postSnapshotAdjustment`, `reconcileBatchedItem` path) **bypasses it**.

Both call `stampBranch` but never call `refreshBalance`, and neither is subject to any central validation.

`StockMovementService` validates nothing about bins. Any bin id, including one from another warehouse, is accepted.

### 2.3 Derived representations

| Representation | **[CURRENT]** role |
|---|---|
| `inventory_balances` (`be/inventory/balance/InventoryBalance`) | Per (product, warehouse) on-hand / WAC / value cache. Refreshed by `InventoryBalanceService.refresh` from `StockMovementService.refreshBalance` (try/catch, errors swallowed). Runs in `REQUIRES_NEW`, so it **cannot see the caller's uncommitted movement** and computes the *pre-movement* balance. Not refreshed by transfers or stock take. Read only by `InventoryBalanceController`. `rebuildAll()` exists. → **Drifts.** |
| `bin_stock` (`BinStock` entity) | Effectively dead. Its only reader is `PurchaseInvoiceService` (line ~579: `binStockRepository.findByProductId(...)` → `currentQty`), which feeds the moving-average cost update. `BinStockService` and the "bin stock" report already derive from `stock_movements`. |
| `batch_master` (`BatchMaster`) | **Per-unit** batch rows (`quantity = 1`) with `warehouse_id`, `zone_id`, `locator_id`, `bin_id` and status `AVAILABLE / RESERVED / CONSUMED / SOLD (legacy) / QUARANTINE`. A second representation of batch stock, kept in step with the ledger by convention only. |
| `batch_allocations` (`BatchAllocation`) | Unit-level claims (`RESERVED / CONSUMED / RELEASED / RETURNED`) per source document line, carrying `bin_id`. |
| `serial_master` (`SerialMaster`) | Per-serial row with `warehouse_id`, `bin_id`, status `AVAILABLE / RESERVED / SOLD / RETURNED / DEFECTIVE`. |
| `pos_stock_reservations` | Soft **warehouse-level** reservation for non-batch POS layaway lines. No bin. |

### 2.4 Settings

**[CURRENT]**
- `be/inventory/settings/InventorySettings` is a singleton row (`id = 1`) in `inventory_settings` with one field, `barcode_print_on_batch_create`.
- `PUT /api/inventory/settings` **replaces the whole row** and is gated only by `modulePermissionService.requireCanEdit("inventory")`. Any inventory editor can change any field in it.
- Negative stock is governed by `SalesSettings.stockCheckRequired`, which **defaults to `false`**. Negative stock is therefore allowed by default.
- Branch-scoped inventory reads are gated by `inventory.branch-scope.enabled` and resolved by `be/inventory/scope/InventoryBranchScopeResolver`.

### 2.5 Flows (summary of confirmed behaviour)

| Flow | **[CURRENT]** location behaviour |
|---|---|
| LPO | `LpoService.submit` **requires zone, locator and bin**. The LPO direct stock post (`LpoService`, around line 716, `inward(...)` overload *without bin*) posts stock **with no bin**. |
| GRN | QC submit **requires zone, locator and bin**. Posting uses the header zone/locator plus `effectiveBinId` = per-item override (resolved by **bin code**, `binRepo.findByCode`, globally) or the header bin. Bin ownership is not validated, and a per-item bin keeps the **header** zone/locator. |
| Purchase Invoice (direct) | Submit **requires bin**. Posts `DIRECT_PURCHASE` with header zone/locator/bin, again without an ownership check. An invoice against a GRN posts no stock. The cost update uses dead `bin_stock`. |
| Purchase Return | `PurchaseReturnService.approve` posts **only** the GL journal (`createJournalFromPurchaseReturn`). `PurchaseReturn` / `PurchaseReturnItem` have **no warehouse, product id, bin, batch or serial**. **Inventory is never reduced.** |
| Sales Invoice | Never deducts stock (`StockDeductionStrategyService.canSalesInvoiceDeductStock() == false`). POS/Fast-Sale auto-generates a DN and runs `markDispatched` → `markDelivered` (`SalesInvoiceService.autoGenerateDeliveryNote`). |
| Delivery Note | Deducts at `markDelivered`. Non-batch: if a line bin is set, that bin only; otherwise bins in descending qty order, then NULL-bin. Under negative override the shortfall goes to `binDeductions.merge(item.getBinId(), …)`, i.e. the **NULL bin** when no line bin is set. Batch: consumes the exact `BatchAllocation` units. The line bin is validated to the warehouse (`validateBinForWarehouse`). |
| Batch selection / FEFO | Always **single-bin** (`findAvailableForSelection(productCode, binId)`). With no bin on the line, `findAvailableForSelectionAnyBin(productCode)` picks the bin of the globally FEFO-first batch **across all warehouses and branches**. Scanned batches (`reserveScannedBatchForSalesInvoiceLine`, `reserveBatchForLayawayLine`) are looked up by batch number with **no warehouse check**. |
| Reservations | Non-batch "reserved" quantity is **derived**: open SO qty + open proforma qty + dispatched-not-delivered DN qty + POS layaway reservations, per warehouse (`WarehouseStockService.getTotalReservedForWarehouse`). Batch reservations are `BatchAllocation` units summed via `BatchMaster.warehouseId`. Quotation runs a non-blocking, company-wide soft check (`QuotationService.validateStockBeforeApproval`). |
| Sales Return | Good batch line: `reverseOutboundStock` into `BatchMaster.warehouseId` (the **receipt** warehouse) with the allocation's bin and NULL zone/locator. Good non-batch line: warehouse-level reversal with **NULL bin**; if no DN-linked warehouse resolves, the restock is **silently skipped** (warning log only). Damaged/Opened/Defective/Expired: no stock movement (scrap). |
| DN cancel | `reverseDeliveryDeduction` reverses each original movement's exact identity (warehouse, bin, zone, locator, batch, expiry). |
| Stock Transfer | **Header-level** `fromZone/fromLocator/fromBin` and `toZone/toLocator/toBin`. Availability at SEND is **warehouse-level** (or batch-in-warehouse) even when `fromBin` is set. OUT at SENT, IN at RECEIVED. Expiry is not copied to the movements. `BatchMaster` / `SerialMaster` locations are **not updated**. Bins are not validated. Same-warehouse transfers are not rejected. |
| Stock Take | Sessions per warehouse, of type `OPENING_INVENTORY` or `INVENTORY_COUNTING`. Item identity is (product, bin), with duplicates rejected per pair. System qty is the bin qty if a bin is set, otherwise the warehouse total. Non-tracked items with no bin cannot be counted. At approval, the bin is auto-resolved when exactly one active bin exists, otherwise posted with NULL bin. Snapshot (unit-scan) sessions post `STOCK_TAKE_ADJUSTMENT` per unit, including wrong-bin moves. Bin capacity is validated **only here**. **`approvedBy` comes from a request parameter** (`StockTakeController.approveSession`, `@RequestParam String approvedBy`). |
| POS | Warehouse = `Branch.defaultWarehouse`, else the **first active warehouse of the branch** (`SalesInvoiceService.resolveBranchDefaultWarehouseId`, also `PosLayawayService`). The cashier never chooses a bin. |
| Concurrency | Non-batch DN delivery calls `getAvailableStockForUpdate` (`@Lock(PESSIMISTIC_WRITE)` on a `SUM` query). Row locks on existing movement rows cannot block a concurrent **INSERT**. PostgreSQL also rejects `FOR UPDATE` combined with aggregates; whether Hibernate emits it here must be verified. Either way this check **does not serialise** concurrent deductions. Batch units are locked properly (`BatchMasterRepository.findByIdInForUpdate`). |

---

## 3. Target Architecture

### 3.1 Principles

1. **[RULE] One ledger.** `stock_movements` is the only authoritative record of quantity. Every on-hand figure at any granularity (branch, warehouse, bin, batch, serial) is `SUM(quantity)` over a filter of it.
2. **[RULE] One write gate.** Every ledger row is written by `StockMovementService`. No other class calls `StockMovementRepository.save*`. This is enforced by a test (§28.6).
3. **[RULE] One policy.** Every location decision is made by `InventoryLocationPolicy`: which fields are required, how outbound stock is allocated, whether negative stock is allowed, and which bins are valid. Modules never read the setting directly.
4. **[RULE] Mode changes requirements, not history.** Existing rows are never rewritten by a mode change. They are interpreted per §21.
5. **[RULE] Derived stores are rebuildable.** `inventory_balances`, `batch_master.status/location` and `serial_master.status/location` must always be re-derivable from or reconcilable with the ledger. A reconciliation job reports any difference.

### 3.2 Component view

```text
                 inventory_settings.stock_tracking_level (+ transition state)
                                      │
                       InventoryTrackingLevelResolver   (cached, warehouse-aware signature)
                                      │
                           InventoryLocationPolicy
        ┌─────────────┬───────────────┼───────────────┬──────────────┬──────────────┐
   validateInbound  validateOutbound  allocateOutbound  validateBin    negativeStock  
   (doc + line)     (doc + line)      (BinAllocation-   Ownership      Policy
                                       Service, FEFO)
        │                │                  │
  Purchase (LPO/GRN/PI/PR) · Sales (SO/DN/Return) · POS · Transfer · Stock Take · Adjustment · Putaway
                                      │
                       StockMovementService  ← re-validates via policy, takes lock,
                                      │          writes ledger, refreshes cache,
                                      │          syncs batch/serial location
                               stock_movements
                                      │
        inventory_balances (warehouse cache) · reports · availability · BinStockService (derived)
```

---

## 4. Definition of Warehouse Mode

**[RULE] Meaning.** WAREHOUSE means *bins are not used for inventory control*. It does **not** mean bins do not exist.

| Question | **[RULE]** |
|---|---|
| What the user sees | Transaction screens (LPO, GRN, PI, DN, SO, transfer, stock take, opening stock, returns, adjustments) show **Warehouse only**. Zone, locator and bin fields are hidden. Stock enquiries and reports show Product → Warehouse → Qty. An optional "by bin" drill-down is available only in the Warehouse/Bin report (§18) for legacy bin stock. |
| Location to select | Warehouse. It defaults from the branch default warehouse where the document has one. |
| Required for stock receipt | Warehouse. New inbound movements are written with `bin_id = zone_id = locator_id = NULL`. If a client sends a bin, the backend **ignores** it and logs at INFO. It does not reject it, so stale clients keep working. |
| Required for stock deduction | Warehouse. The system chooses the stock identities consumed using the Warehouse-mode depletion order (§8.4). The user never selects a bin. |
| Are bins optional? | Bins are **not used** on new transactions. |
| Can bins exist? | Yes. Zone, locator and bin master data can be created, edited and soft-deleted (§19). |
| Can bins be viewed? | Yes, in master data and in the Warehouse/Bin stock report. |
| Purpose of bins | Physical organisation and labelling. They also keep master data ready for a future switch to BIN. |
| Legacy stock in bins | Remains in its bins. It counts toward warehouse stock and is consumed by outbound movements, which record the bin actually consumed so that no bin identity goes negative (§8.4). |

---

## 5. Definition of Bin Mode

| Question | **[RULE]** |
|---|---|
| What the user sees | Warehouse plus **Bin** on every document that moves physical stock. Zone and locator are shown **read-only**, derived from the bin. Stock enquiries show Product → Warehouse → Bin → Qty. |
| Warehouse | Remains **mandatory**. Warehouse is the primary dimension. Bin is a child of warehouse. |
| Bin | **Mandatory** on every ledger row that represents physical stock entering or leaving a location (§22.2). |
| Zone / Locator | **Never entered independently.** They are always **derived from the bin** (`bin.locator`, `bin.locator.zone`) and stamped by `StockMovementService`. Any client-supplied zone or locator is ignored. This removes today's GRN inconsistency where a per-item bin keeps the header zone/locator. |
| Stock control | Per (product, warehouse, bin) and, where applicable, per batch/expiry/serial within the bin. No physical bin may go negative (§23). |
| Warehouse stock | **Defined as** `SUM` over the warehouse's ledger rows. In steady-state BIN mode no unlocated (NULL-bin) stock exists, so this equals the sum of its bins. Any non-zero NULL-bin balance in BIN mode is an **integrity exception** reported by §18.3. |

---

## 6. Global Setting

### 6.1 Model

**[REC]** Add to the existing singleton `inventory_settings`. That table is the module's settings home and a tenant is one database, so a singleton row is tenant-global by construction.

| Column | Type | Notes |
|---|---|---|
| `stock_tracking_level` | `VARCHAR(20) NOT NULL DEFAULT 'WAREHOUSE'` | Enum `InventoryTrackingLevel { WAREHOUSE, BIN }` |
| `tracking_level_transition` | `VARCHAR(20) NOT NULL DEFAULT 'NONE'` | Enum `TrackingLevelTransition { NONE, TO_BIN }` (§20.3) |
| `tracking_level_changed_at` / `_by` | timestamp / varchar(120) | Taken from the authenticated principal, never from the request body |

**[REC]** Add a history table `inventory_tracking_level_changes`:

- `id`, `from_level`, `to_level`, `transition_from`, `transition_to`;
- `preflight_snapshot` (JSONB with the preflight result at the moment of the change);
- `changed_by`, `changed_at`, `reason` (mandatory free text).

The change is also written to the general security audit trail (`security/AuditLogService`).

**[RULE] Naming.** The name `inventory_settings.stock_tracking_level` / `InventoryTrackingLevel` is appropriate and is adopted.

### 6.2 Governance

| Aspect | **[RULE]** |
|---|---|
| Scope | **Tenant-global.** Not per branch. Never converted into a branch setting. |
| Default, existing tenants | **WAREHOUSE.** This is **[DECISION D1]**, rationale below. |
| Default, new tenants | **WAREHOUSE.** |
| Who can change | `ROLE_ADMIN` only. Not `BRANCH_ADMIN`, and not holders of `inventory` edit or approve permission. |
| Ordinary inventory editors | **Cannot** change it. The field is **excluded** from `PUT /api/inventory/settings`: it is read-only in the GET payload and ignored on PUT. This is mandatory because the existing PUT overwrites the whole row. |
| Endpoints | `GET /api/inventory/settings/tracking-level`<br>`POST /api/inventory/settings/tracking-level/preflight?target=BIN\|WAREHOUSE` (read-only report)<br>`POST /api/inventory/settings/tracking-level/transition` (start or abort `TO_BIN`)<br>`POST /api/inventory/settings/tracking-level` (commit) |
| Pre-validation | Mandatory. The commit endpoint re-runs preflight inside its own transaction and refuses on any BLOCKER (§20). |
| Approval | Single-step for `ROLE_ADMIN`, with a typed confirmation and a mandatory reason. No maker-checker. **[DECISION D2]** |
| Audit | Mandatory (history table + `AuditLogService`). |
| Caching | The resolver caches the value. Every commit evicts the cache. Each stock-posting transaction reads the level **once** at its start and uses that value throughout. |
| Per-warehouse override | **Not in scope.** The resolver signature is nevertheless `resolve(Long warehouseId)`, so a future per-warehouse override is a localised change. Until then the argument is ignored. |

**Rationale for D1 (WAREHOUSE for existing tenants).** Existing data already violates BIN-mode invariants: LPO posts, non-batch sales returns, negative overrides and some stock-take postings all write NULL-bin stock. Activating BIN by default would make the next transaction fail for those tenants. WAREHOUSE is the faithful description of how the stock engine already computes availability. A tenant that wants bin control moves to BIN through the controlled migration in §20.

The visible behaviour change for existing tenants is that LPO, GRN and PI **stop requiring** zone/locator/bin. That is intended: it eliminates the "required but then ignored" inconsistency (§7).

---

## 7. Purchase Rules

### 7.1 Matrix

| Operation | Warehouse Mode | Bin Mode |
|---|---|---|
| **LPO** | Warehouse required. Zone/locator/bin **not shown, not required**. No stock effect. | Warehouse required. Bin is **optional** and stored as an *intended putaway bin* (a hint copied to the GRN). Zone/locator derived from it. **Not required at submit.** No stock effect. |
| **GRN** | Warehouse required. On post: inbound movement, `bin_id = NULL`. | Warehouse required. **A bin is required for every accepted line before QC submit**: the header bin is the default and a per-line bin is an override, chosen **by bin id** and validated to belong to the GRN warehouse. On post: inbound movement into exactly that bin, with zone/locator derived. |
| **Purchase Invoice (against GRN)** | No stock movement (stock already received by the GRN). No location fields. | Same. No location fields. |
| **Direct Purchase** (PI not against a GRN, `DIRECT_PURCHASE`) | Same as GRN, Warehouse Mode. | Same as GRN, Bin Mode. Bin required per line (header default) before submit. |
| **LPO direct stock post** (existing `LpoService` post path, no GRN) | Treated as a receipt: same as GRN, Warehouse Mode. | Treated as a receipt: same as GRN, Bin Mode. Bin required per line at post. **[DECISION D3]**: retire this path in favour of GRN. |
| **Purchase Return** | §16 | §16 |

### 7.2 Per-operation detail

| Item | **[RULE]** |
|---|---|
| Warehouse required? | Always, on every purchase document that posts stock. Must be accessible to the user's branch scope (`BranchAccessService.assertWarehouseMatchesBranch`). |
| Zone required? | Never as input. In BIN it is derived from the bin. |
| Locator required? | Never as input. In BIN it is derived from the bin. |
| Bin required? | WAREHOUSE: never. BIN: yes on each stock-bearing line at the **first workflow step that commits a location** (GRN QC submit, PI submit, LPO-direct post), and re-validated at posting. |
| Where does stock enter? | The document warehouse; in BIN, the line's bin. |
| StockMovement fields | `source_type` (`GRN` / `DIRECT_PURCHASE` / `LPO`), `source_id`, `product_id`, `warehouse_id`, `branch_id` (stamped), `zone_id`/`locator_id`/`bin_id` (NULL in WAREHOUSE; bin plus derived values in BIN), `batch_number`, `expiry_date`, `serial_number`, `unit_cost` (**required on every inbound purchase movement**, including non-batch lines), `quantity` (positive, base units), `movement_date`, `reference_no`. |
| Batch stock | Per-unit `BatchMaster` rows are created as today. `warehouse_id` = document warehouse. `bin_id`: NULL in WAREHOUSE, line bin in BIN. One ledger row per unit with that batch/expiry, as today. |
| Serialized stock | One ledger row per serial (qty 1). `SerialMaster.warehouse_id` and `bin_id` are set identically to the ledger row. |
| No bin exists (BIN mode) | Submission is **blocked**: "Warehouse X has no active bins. Create a bin or ask an administrator." A receiving bin can be created from master data. There is no silent NULL-bin fallback. |
| Bin selection by code | **Forbidden** as a lookup key. Bins are referenced by id. A code may be used only in a UI search scoped to the document warehouse. |

**[RULE] Eliminating the current inconsistency.** The location validated at submission is *exactly* the location posted. A document can never require a bin and then post without one. In WAREHOUSE the bin is neither required nor posted. In BIN it is required and posted.

---

## 8. Sales Rules

### 8.1 Allocation model

The three candidate models:
- **Model A** (always manual) is rejected. It burdens counter staff and conflicts with POS.
- **Model B** (always automatic) is rejected. Warehouse pickers legitimately need to override the bin.
- **Model C is adopted. [RULE]**
  - **Back-office documents** (SO, DN, Direct Sale invoice) may carry a user-selected bin per line in BIN mode. If no bin is selected, the system auto-allocates at dispatch.
  - **POS** is always automatic (§9).
  - In WAREHOUSE mode there is no bin selection anywhere.

### 8.2 Document behaviour

| Document | Warehouse selection | Bin selection (BIN mode only) | Availability check | Reservation | Stock deduction |
|---|---|---|---|---|---|
| **Quotation** | Optional | None | Soft, non-blocking warning (as today), computed **per warehouse** when a warehouse is given, else per branch | None | None |
| **Sales Order** | Required per line (defaults to branch default) | Optional, non-batch: ignored (reservation is warehouse-level). Batch lines: bins come from batch allocation (§10) | Warehouse-level available-to-promise (§10.1) | Warehouse-level (non-batch); unit-level `BatchAllocation` (batch) | None |
| **Proforma** | As SO | As SO | As SO | Warehouse-level | None |
| **Sales Invoice** | Required per line | None (the invoice never moves stock) | Warehouse-level ATP for warning/blocking per `stockCheckRequired` (WAREHOUSE) or always blocking (BIN, §23) | Batch lines on Direct Sale reserve via `BatchAllocation` | **None.** Stock moves only on the DN (as today) |
| **Delivery Note** | Required (header) | Optional per line at creation. **Mandatory resolution at DISPATCH**: each line is allocated to one or more bins (§8.3) | At DISPATCH (allocation) and again at DELIVERED, under lock | A dispatched-not-delivered DN reserves its allocated quantity | At **DELIVERED**, per allocated identity |
| **Sales Return** | §15 | §15 | — | — | Inbound per §15 |
| **Cancellation / reversal** | — | — | — | Releases reservations and allocations | Exact reversal of each original movement's identity (warehouse, bin, zone, locator, batch, expiry). It always restores to the original identity, **even if that bin has since become inactive** (§19) |

### 8.3 Bin allocation at DN dispatch (BIN mode)

**[RULE]**

1. A **user-selected bin** must belong to the DN warehouse and hold at least the requested quantity, net of other open allocations on that bin. Otherwise dispatch is blocked with a message naming the bin's free quantity.
2. **Auto-allocation, non-batch** (deterministic):
   - (a) The single bin with free quantity ≥ requested, ordered by `bin.code` ascending (lowest pick effort, stable).
   - (b) Otherwise split greedily across bins ordered by free quantity descending, then `bin.code`. This minimises picks.
3. **Batch products:** the allocation is the `BatchAllocation` set (§11). Each unit carries its bin, so a line may span bins.
4. The allocation is persisted per line as **(bin, qty)** rows.
   - **[REC]** Use a child table `delivery_note_item_locations`, because one DN line can split across bins. `DeliveryNoteItem.binId` remains as the "preferred bin" field.
5. At DELIVERED the deduction posts exactly the persisted allocation. Each (bin) quantity is re-checked under lock (§24).
   - If a bin no longer has the quantity because of a concurrent movement, an **auto-allocated** portion is re-allocated within the warehouse.
   - A **user-selected** bin fails with an error.

### 8.4 Warehouse-mode depletion order (WAREHOUSE mode)

The user never sees bins, but the ledger has identities: legacy bins, NULL bin, batches, serials. **[RULE]** Outbound movements consume identities in this order, and post one ledger row per identity consumed:

1. **Batch products:** FEFO over all `AVAILABLE` units in the warehouse, regardless of bin (§11.4).
2. **Serialized products:** the scanned or selected serial, wherever it is in the warehouse.
3. **Other products:** located (legacy bin) identities first, by bin quantity descending (this matches today's DN behaviour and drains legacy bin stock), then the unlocated (NULL-bin) identity.

**[RULE]** A consumed identity is never driven below zero. A shortfall exists only when the whole warehouse is short, and is then handled by §23.

### 8.5 Should salespeople/cashiers select bins?

**[RULE]**
- Cashiers: never.
- Back-office salespeople: optionally on DN and SO lines in BIN mode.
- Warehouse staff: confirm or override the allocation at dispatch.

---

## 9. POS Rules

### 9.1 Warehouse resolution

**[RULE]**
- The POS sale warehouse = `Branch.defaultWarehouse`.
- **[RULE]** In BIN mode the "first active warehouse of the branch" fallback is **disabled**. A POS branch without an explicit default warehouse cannot sell stock items, and gets a clear configuration error.
- In WAREHOUSE mode the fallback is retained for backward compatibility, but becomes deterministic (lowest warehouse id).

### 9.2 Warehouse Mode

Given Warehouse A, Product A = 100, no bins involved:

- POS sells 30 and posts outbound `DELIVERY_NOTE` movements via the auto-DN, totalling −30 against Warehouse A. Identities are consumed by §8.4, which here means one NULL-bin row of −30.
- Warehouse A becomes 70.
- No bin prompt appears.

### 9.3 Bin Mode

Given Warehouse A with Bin 1 = 40 and Bin 2 = 60, a sale of 50 of non-batch Product A:

```text
POS line ─► Branch default warehouse (A)
         ─► InventoryLocationPolicy.allocateOutbound(A, product, 50)
              no single bin ≥ 50  →  split: Bin 2 (60) → 50   [free-qty desc]
         ─► auto-DN dispatched with allocation {Bin 2: 50}
         ─► DELIVERED: −50 @ Bin 2 under lock
Result: Bin 1 = 40, Bin 2 = 10, Warehouse A = 50
```

A sale of 80: Bin 2 → 60 and Bin 1 → 20. Result: Bin 1 = 20, Bin 2 = 0. No bin goes negative.

**[RULE]** The cashier is never asked for a bin. The receipt and the POS UI do not show bins. Bins are visible in the DN detail and the movement ledger.

**[RULE]** The POS stock display (availability badge) shows **warehouse-level available-to-sell** = Σ bins − reservations. In BIN mode this equals the quantity that auto-allocation can actually satisfy.

### 9.4 Batch products at POS

**[RULE]**
- **Unscanned** (product grid or barcode resolving to the product): FEFO auto-reservation over `AVAILABLE` units with `warehouse_id = POS warehouse`, eligible per `minExpiryDaysForSale`, **across all bins of that warehouse**, splitting across bins and batches as needed (§11.4). The current single-bin restriction is removed.
- **Scanned batch:** the scanned `BatchMaster` unit must be `AVAILABLE` and must have `warehouse_id = POS warehouse`. If it belongs to another warehouse, reject with "Batch X is not in this store's stock." In BIN mode its bin is whatever bin it sits in. In WAREHOUSE mode its bin may be NULL.
- **Scanned serial:** the `SerialMaster` must be `AVAILABLE` (or `RESERVED` by this sale) with `warehouse_id = POS warehouse`.
- **Layaway:** §10.

---

## 10. Reservation Rules

### 10.1 Availability formula

**[RULE]** For a (product, warehouse):

```text
on_hand(W)         = SUM(stock_movements.quantity WHERE warehouse = W)
reserved(W)        = open SO qty + open proforma qty + dispatched-not-delivered DN qty
                     + POS layaway (pos_stock_reservations RESERVED)                (non-batch)
                   | BatchAllocation RESERVED units whose BatchMaster.warehouse_id = W  (batch)
available(W)       = on_hand(W) − reserved(W)
```

In BIN mode, additionally, for a bin B:

```text
on_hand(B)         = SUM(quantity WHERE warehouse = W AND bin = B)
allocated(B)       = DN location allocations on B in DISPATCHED DNs
                     + BatchAllocation RESERVED units whose BatchMaster.bin_id = B
free(B)            = on_hand(B) − allocated(B)
```

**[RULE]** Warehouse-level reservations (SO, proforma, layaway) do **not** claim a bin. A bin is claimed only by a **DN dispatch allocation** or a **batch unit allocation**. This is how shared, bin-less reservations coexist with bin control:

- Reservations reduce `available(W)` and so stop over-promising.
- Physical bins are protected by `free(B)` at dispatch and by the locked re-check at delivery.
- A bin can therefore never go negative because of a warehouse-level reservation.

### 10.2 Matrix

| Reservation type | Warehouse Mode | Bin Mode |
|---|---|---|
| **Sales Order** (non-batch) | Warehouse-level, derived from open SO qty. No bin. | Warehouse-level, no bin. A bin is claimed at DN dispatch. |
| **Sales Order** (batch) | `BatchAllocation` units (FEFO or manual) within the SO warehouse. Unit bin may be NULL. | `BatchAllocation` units within the SO warehouse. Each unit has a bin, which is claimed at reservation time. |
| **Proforma** | Warehouse-level, derived. No bin. | Warehouse-level. No bin. Proformas do not create batch allocations. |
| **POS Layaway** (non-batch) | `pos_stock_reservations` against the branch default warehouse. | Same. Warehouse-level. A bin is claimed at conversion (the sale's DN dispatch). |
| **POS Layaway** (batch) | `BatchAllocation` (`POS_LAYAWAY`), scanned unit or FEFO, scoped to the default warehouse. | Same. The unit's bin is claimed. |
| **Batch reservation** (any source) | Unit-level `BatchAllocation`, warehouse-scoped. | Unit-level, warehouse- and bin-specific (the unit's bin). |
| **Delivery reservation** (DISPATCHED, not DELIVERED) | Warehouse-level quantity. | Per-bin allocation rows (§8.3). |

**Answers to the required questions.** [RULE]

| Question | Answer |
|---|---|
| Is the reservation warehouse-level? | Yes for SO, proforma, layaway and undispatched non-batch lines, in both modes. |
| Is it bin-level? | Only DN dispatch allocations and batch unit allocations, in BIN mode. |
| Can reserved stock be shared across bins? | Yes. Warehouse-level reservations are fungible across bins until dispatch. |
| When does a reservation claim a physical bin? | Non-batch: at DN **dispatch**. Batch: when the **unit is allocated**. |
| When does it become a batch allocation? | Batch lines: at document save (SO / Direct-Sale invoice / layaway) via FEFO or manual selection, as today. Non-batch lines never do. |

**[RULE] Reservation-time checks.**
- BIN mode: `available(W) ≥ requested` is **blocking** for SO and layaway.
- WAREHOUSE mode: it is blocking only when `stockCheckRequired = true`, otherwise a warning.
- Proforma and quotation are always warnings only.

---

## 11. Batch / FEFO Rules

### 11.1 Batch creation and location

**[RULE]**
- Batches are created per unit, as today, on GRN, Direct Purchase, opening stock and stock take.
- `BatchMaster.warehouse_id` is **always** set.
- `BatchMaster.bin_id` = the bin of the inbound movement: NULL in WAREHOUSE, mandatory in BIN.
- `zone_id` and `locator_id` are derived from the bin.

**[RULE] Batch location follows stock.** Every movement that relocates a batch unit updates that unit's `BatchMaster.warehouse_id/bin_id/zone_id/locator_id` **in the same transaction**: transfer receipt, putaway, bin move, stock-take wrong-bin correction, sales return restock. `StockMovementService` owns this sync, so callers cannot forget it. The same rule applies to `SerialMaster`.

### 11.2 Can a batch exist with no bin?

| | **[RULE]** |
|---|---|
| WAREHOUSE: `warehouse_id = X, bin_id = NULL`? | **Yes.** Normal state for batches received in WAREHOUSE mode. |
| BIN: `AVAILABLE` or `RESERVED` with `bin_id = NULL`? | **No.** Preflight blocks the switch to BIN while any exist (§20). They are assigned by **guided putaway** during the `TO_BIN` transition. `CONSUMED`/`SOLD` historical units may keep NULL. `QUARANTINE` units must also have a bin in BIN mode, ideally a Quarantine-zone bin. |

### 11.3 Warehouse scope of every batch query — mandatory

**[RULE]** Every batch-selection, reservation, availability or scan query is filtered by **`product_id` AND `warehouse_id`**. `product_code` alone is never a selection key; codes become non-unique under branch-scoped master data. `bin_id` is an *additional* optional filter. A batch from another warehouse is never selected because it matches product and expiry. This applies to all of the following:

| Query / path | Target scope |
|---|---|
| FEFO options preview (`getSelectionOptions`) | `(product_id, warehouse_id[, bin_id])` |
| Auto-FEFO reservation (SO, Direct Sale, POS, layaway) | `(product_id, warehouse_id)`, all bins |
| Manual selection | `(product_id, warehouse_id[, bin_id])`. Selected unit ids are re-checked against the warehouse under `FOR UPDATE` |
| Scanned batch (POS invoice, layaway) | lookup by batch number **and** `warehouse_id` |
| `sumReservedByProductAndWarehouse` | `BatchMaster.warehouse_id`. Correct only once location sync (§11.1) is in place |
| Sales-return returnable batches | the original allocation's units (unchanged) |
| Stock-take batch matching (`findAvailableMatching`) | `(product_id, warehouse_id, bin_id)` |
| Transfer batch availability | `(product_id, warehouse_id[, bin_id], batch_number, expiry_date)` |

`findAvailableForSelectionAnyBin` (no warehouse filter) is **removed**.

### 11.4 FEFO ordering

**[RULE]** Within the scope above:

1. Only units with status `AVAILABLE` that are eligible for sale (`isEligibleForSale`: not expired, `minExpiryDaysForSale` respected) are candidates.
2. Order: expiry date ascending, NULL last → entry date ascending, NULL last → `qty_unit_no` ascending → in BIN mode, `bin.code` ascending as the final tiebreaker.
3. Allocation may span multiple batches and multiple bins.
4. In BIN mode, an **explicit** bin on the line restricts candidates to that bin. If they are insufficient, the request fails. It never silently widens.

### 11.5 Batch transfer, return, expiry

| Case | **[RULE]** |
|---|---|
| Transfer | Transfer lines for batch products specify **batch units** (or batch number + qty, resolved to specific units at SEND). OUT movements carry batch number **and expiry**. At SEND the units become status `RESERVED` against `STOCK_TRANSFER`. At RECEIVE their `warehouse_id` / `bin_id` are updated and they return to `AVAILABLE`. |
| Sales return (Good) | Unit returns to `AVAILABLE` at the return location (§15). The `RETURNED` allocation is created as today. |
| Sales return (not Good) | No ledger movement. Unit status stays `CONSUMED` (scrapped), as today. |
| Purchase return | Unit leaves stock: ledger outbound, unit `CONSUMED` with a `PURCHASE_RETURN` allocation (§16). |
| Expired batch | Not eligible for sale or auto-FEFO. Remains `AVAILABLE` in the ledger until written off by Stock Adjustment (§17) or moved to quarantine. The expiry report lists it. |
| Batch without a bin | WAREHOUSE: normal. BIN: integrity exception (§18.3) and preflight blocker. |

---

## 12. Transfer Rules

### 12.1 Structure

**[RULE]** Transfers are **line-level** for location.
- The header holds `fromWarehouse` and `toWarehouse` plus optional *default* from/to bins.
- Each line holds `fromBinId` and `toBinId` (BIN mode), batch number + expiry (or unit ids) and quantity.
- The existing header-only `fromBin/toBin` structure is **not sufficient**. It cannot express a product held in several bins or receipt into several bins. Header bins become defaults copied to lines.
- Zone and locator are derived from the bin and never stored independently.

### 12.2 Transfer types

| Transfer | Warehouse Mode | Bin Mode |
|---|---|---|
| Warehouse A → Warehouse B (A ≠ B) | **ALLOWED.** No bins. Two-step SENT/RECEIVED as today. | **ALLOWED** as `A/Bin x → B/Bin y`. Source bin per line is required at SEND. Destination bin per line is required at RECEIVE; it may be pre-filled at creation and confirmed or changed by the receiver. |
| Same warehouse, Bin A → Bin B | **NOT ALLOWED.** No inventory meaning. | **ALLOWED** as an *internal bin move*: a single step (OUT and IN in one transaction), no GL journal, source type `BIN_MOVE`. |
| Warehouse / unlocated → Bin (same warehouse) | **NOT ALLOWED** | **ALLOWED ONLY DURING PUTAWAY.** In `TO_BIN` transition via guided putaway (§20.4). After cutover, also allowed only as an exception-resolution putaway by inventory approvers, because steady-state BIN has no unlocated stock. Source type `PUTAWAY`. |
| Bin → unlocated | **NOT ALLOWED** (no bin moves in WAREHOUSE) | **NOT ALLOWED** |
| Warehouse (no bin) → Bin, cross-warehouse | **NOT ALLOWED** (destination bins not used) | **ALLOWED ONLY DURING MODE MIGRATION** (`TO_BIN`): the source may be unlocated stock in A, the destination must be a bin in B |
| Bin → Warehouse (no bin), cross-warehouse | **ALLOWED IMPLICITLY.** In WAREHOUSE, legacy source bins are consumed via §8.4 and the destination is NULL. | **NOT ALLOWED.** Destination bin required. |

### 12.3 Transfer rules

**[RULE]**

1. **Availability at SEND** is checked at the **most specific location** given:
   - BIN: per line, `free(fromBin)` for the product/batch;
   - WAREHOUSE: `available(fromWarehouse)` net of reservations.
   - The check runs under the lock in §24, and the OUT movement is posted in the same transaction.
2. **Transfers never create negative stock**, regardless of `stockCheckRequired`.
3. **Bins are validated** to belong to their side's warehouse (§22.3).
4. **In transit.** Between SENT and RECEIVED the quantity is in neither warehouse's on-hand. It is visible in the "In transit" column of the transfer report, as today; GL in-transit posting is unchanged. **[REC]** Do not introduce an in-transit warehouse.
5. **Partial receipt** is out of scope and stays as today (full receipt). **[DECISION D7]** if partial receipt is wanted.
6. All transfer movements are written via `StockMovementService`, fixing the current bypass.

---

## 13. Stock Take Rules

| Aspect | Warehouse Mode | Bin Mode |
|---|---|---|
| Session creation | One warehouse per session, as today. No bin selection. | One warehouse per session. Optional **bin scope** (all bins, or a subset of zones/locators/bins) for cycle counts. |
| Item identity | **(product)**. Batch-tracked products: (product) with batch grid lines (batch, expiry, qty). | **(product, bin)**. Batch-tracked: (product, bin) with batch grid lines. |
| Duplicate product across bins | Not applicable. One line per product. | Allowed: one line per (product, bin), as today. Duplicate (product, bin) is rejected. |
| System quantity | Warehouse total (all bins + unlocated) at count time. | Bin quantity at count time. |
| Counting a line without a bin | Allowed. Counts the warehouse total. | Not allowed. A bin is required before a count is accepted, as today. |
| Batch counting | Batch grid per product. A batch is matched by (batch, expiry) within the warehouse. | Batch grid per (product, bin), matched within that bin. |
| Serial counting | Count serials present in the warehouse. | Count serials per bin. A serial found in a different bin is a **wrong-bin** finding, corrected by a bin move adjustment. |
| Unit scanning (snapshot sessions) | Expected units = all units in the warehouse. **Bin is ignored**; a unit found anywhere in the warehouse is "scanned", with no wrong-bin logic. | Expected units carry the expected bin. Wrong-bin produces a −1 at the expected bin and +1 at the actual bin (as today). Unknown units must be resolved before approval (as today). |
| Bin capacity | Not validated. | Validated on positive variances and wrong-bin moves into a bin (as today). **[DECISION D6]** on hard vs soft. |
| Approval | Requires inventory APPROVE. **Approver identity = authenticated principal.** The `approvedBy` request parameter is removed. | Same. |
| Variance | Posted per identity (see below). | Posted per (bin, batch/expiry) identity. |
| Movement generation | See below. | See below. |

**[RULE] Variance posting.**

1. At approval, for each counted identity: `adjustment = counted − ledger_on_hand_now(identity)`, with the on-hand read **under lock** (§24).
   - If any ledger movement for that identity was posted after the line was counted, the line is flagged **STALE**. Approval is blocked until the line is re-counted or the approver explicitly accepts "post against the current on-hand".
   - **[REC]** Add `counted_at` to stock-take lines.
2. **WAREHOUSE, non-batch:**
   - A positive adjustment posts one movement with NULL bin.
   - A negative adjustment consumes identities by the §8.4 depletion order, so legacy bins are reduced and none goes negative.
   - This replaces today's "single active bin auto-detect, else NULL" heuristic.
3. **BIN:** each adjustment posts at the line's bin. The bin must belong to the session warehouse.
4. Source types are unchanged: `STOCK_TAKE`, `STOCK_TAKE_BATCH` (legacy) and `STOCK_TAKE_ADJUSTMENT`. All are written via `StockMovementService`.
5. Positive adjustments carry `unit_cost`: the warehouse WAC, falling back to product cost, as today.

**[RULE] Unlocated stock and BIN mode.**
- During `TO_BIN` transition, a stock-take session may be used as a **putaway vehicle**: counting a product in bins while unlocated stock exists posts −unlocated / +bin pairs, with the approver's confirmation.
- After cutover, unlocated stock does not exist. If it appears (an integrity exception), it can only be cleared by putaway or adjustment.

**[RULE] Open sessions and mode switches.** A switch in either direction is blocked while any session is `IN_PROGRESS` or `PENDING_APPROVAL` (§20).

---

## 14. Opening Stock Rules

**[RULE]**
- Opening stock is entered through `OPENING_INVENTORY` stock-take sessions (batch prefix `OS`), as today. One opening session per warehouse.
- Opening stock follows the same rules as §13.
- Every positive opening movement carries `unit_cost`.

| | Warehouse Mode | Bin Mode |
|---|---|---|
| Location | `Opening Stock → Warehouse` (`bin_id = NULL`) | `Opening Stock → Warehouse + Bin`. **Bin mandatory** per line. |
| Batches | `BatchMaster` with `bin_id = NULL` | `BatchMaster` with the line's bin |
| Legacy unlocated opening stock | Normal stock | Must be put away before cutover (§20). Historical `OS` movements are not rewritten; putaway posts new `PUTAWAY` pairs. |

---

## 15. Sales Return Rules

**[RULE] Return warehouse** = the warehouse of the **outbound movement being reversed**: the DN `DELIVERY_NOTE` movement for that invoice line and identity.
- It is **not** `BatchMaster.warehouse_id` (today's behaviour, which points at the receipt warehouse) and not a guess.
- If the return is not linked to a delivered DN:
  - POS returns use the POS branch default warehouse.
  - Back-office returns **require the user to choose a warehouse**. The return cannot post until one is chosen.
- The current "log a warning and skip the restock" behaviour is removed.

| Condition | Warehouse Mode | Bin Mode |
|---|---|---|
| **Good** (resaleable) | Inbound `SALES_RETURN` into the return warehouse, `bin_id = NULL`. Batch units return to `AVAILABLE` there. Serial returns to `AVAILABLE`. COGS reversed (as today). | Inbound into a **return bin**: (1) the warehouse's configured **Returns bin** if set (**[REC]** new optional `warehouses.returns_bin_id`), else (2) the **original bin** of the reversed movement if still active, else (3) a bin chosen by the user. **Never NULL.** The user may override with any active bin of the same warehouse. |
| **Damaged / Defective / Expired / Opened** | No stock movement. Scrapped, COGS retained (as today). Batch unit stays `CONSUMED`. Serial set to `DEFECTIVE` where applicable. | Same, no movement. **[DECISION D5]**: optionally route to a Quarantine-zone bin as non-saleable stock instead of scrapping. Default: scrap, as today. |
| **Replacement** | Two independent documents: a Good (or Damaged) return per the rows above, plus a new sale whose DN deducts per §8. No netting. | Same. |
| **Cancellation** (DN / invoice cancel before or after delivery) | Exact identity reversal of the original movements (§8.2). | Exact identity reversal, including bin, even if the bin is now inactive. An inactive bin holding stock shows in the exception report. |

**[RULE]** A return never writes `bin_id = NULL` in BIN mode. There is no implicit NULL fallback in either mode. WAREHOUSE NULL is a deliberate rule, not a fallback.

---

## 16. Purchase Return Rules

**[RULE]** A purchase return reduces inventory. The data model gains:
- `purchase_returns.warehouse_id`;
- `purchase_return_items.product_id`, `bin_id` (BIN mode), and batch/serial detail (unit ids or batch + expiry + qty; serial list);
- a link to the source GRN/PI line.

| Step | **[RULE]** |
|---|---|
| Identify warehouse | Default: the warehouse of the linked GRN / Direct PI receipt. User may change it within branch scope. Required. |
| Identify bin (BIN) | Per line: the user selects a bin, or the system auto-allocates per §8.3 (non-batch) or uses the selected units' bins (batch/serial). |
| Availability | `free(bin)` (BIN) or `available(warehouse)` (WAREHOUSE) ≥ qty. **Always hard-blocked. Negative override never applies to purchase returns.** |
| Movement | Outbound, new source type `PURCHASE_RETURN`, posted at **approval**. Fields per §7.2, negative quantity. Batch, expiry and serial must be specified for batch/serial products. |
| Batch | Units → `CONSUMED`, with a `BatchAllocation` of document type `PURCHASE_RETURN`. |
| Serial | Serial status leaves stock. **[REC]** Add `RETURNED_TO_VENDOR` to `SerialStatus`; the existing `RETURNED` means customer return. |
| Financials | GL journal as today, in the **same transaction** as the stock movement. Both succeed or neither does. |
| Cancel after approval | Reverses the movements (exact identity) and the journal. |

---

## 17. Stock Adjustment Rules

**[CURRENT]** No standalone adjustment module exists. Adjustments happen only through stock-take approval.

**Recommendation: Option C (support both). [REC]**

- **Stock Take** remains the count-based reconciliation (§13).
- A dedicated **Stock Adjustment** document (`inventory/adjustment`) handles reason-coded changes that are not counts:
  - write-off of damaged or expired goods;
  - internal consumption;
  - found stock;
  - quarantine moves;
  - in BIN mode, exception putaway.

**Why:**
- Today the only way to write off 3 expired units is to open a full stock-take session, which distorts count history and needs a full approval cycle.
- The existing "wastage / internal consumption" report has no first-class source document.
- Both documents post through the same policy and `StockMovementService`, so the extra module adds no second engine.

**[RULE]** for the adjustment document:
- One warehouse per document; lines carry product, quantity (±), reason code, batch/serial, and bin in BIN mode.
- Approval by inventory APPROVE. The approver is the authenticated principal.
- Negative lines can never take an identity below zero, even when `stockCheckRequired = false`.
- Positive lines carry `unit_cost` (WAC default).
- New source type `STOCK_ADJUSTMENT`, plus `PUTAWAY` and `BIN_MOVE` for location-only moves (§12).
- GL posting through `PostingEngineService` as for stock-take variances.

This module is **not a prerequisite** for the mode rollout. It is Phase 7 (§29). Until it exists, stock take remains the only adjustment path.

---

## 18. Reporting Rules

### 18.1 General

**[RULE]**
- Every quantity in every report is derived from `stock_movements`, directly or via `inventory_balances` once that cache is correct (§21).
- Warehouse quantity is the **aggregation** of the ledger. No report stores or reads a separately maintained bin quantity.
- `bin_stock` is not read by anything.

### 18.2 Report behaviour

| Report | Warehouse Mode | Bin Mode |
|---|---|---|
| Stock on hand | Product → Warehouse → Qty | Product → Warehouse → Bin → Qty (expandable). Warehouse subtotal = Σ bins (+ Unlocated row if non-zero, highlighted as an exception) |
| Stock availability | on hand − reserved per warehouse | Warehouse level as in WAREHOUSE, plus per-bin `free(B)` in drill-down |
| Valuation | Warehouse WAC × qty | **Same, warehouse WAC.** [RULE] Cost is not bin-specific; bin rows show qty × warehouse WAC for information only |
| Low stock / reorder | Per warehouse (or branch roll-up), against product reorder level | **Same, per warehouse.** Bin-level min/max replenishment is out of scope |
| Out of stock | Warehouse on-hand ≤ 0 | Same, at warehouse level. A bin at 0 is not "out of stock" |
| Warehouse stock | Primary view | Warehouse roll-up of bins |
| Bin stock | Available. Shows legacy bins plus an **"Unlocated"** row; informational | Primary physical view. Unlocated row shown only as an exception |
| Stock movement ledger | All columns. Bin column hidden by default | Bin column shown |
| Inventory dashboard | Warehouse KPIs | Warehouse KPIs plus "bins with exceptions" (negative, unlocated, over capacity, inactive bin holding stock) |
| Product stock (product page, POS badge) | Per warehouse | Per warehouse. Bin breakdown in back-office product view only |
| Batch / expiry reports | Batch → Warehouse → Qty | Batch → Warehouse → Bin → Qty |
| Stock-take variance | Per (product[, batch]) | Per (product, bin[, batch]) |
| Negative stock | Per warehouse | Per warehouse **and** per bin |

### 18.3 Integrity exception report (new, both modes)

**[RULE]** A report and API that lists:

- negative identities (bin or NULL-bin);
- in BIN mode, any non-zero unlocated balance, and `AVAILABLE`/`RESERVED` batch or serial units with a NULL bin;
- movements referencing a bin, locator or zone that is deleted, or whose hierarchy does not lead to the movement's warehouse;
- inactive bins holding stock;
- `BatchMaster` unit counts that disagree with the ledger per (product, warehouse, bin, batch, expiry);
- `inventory_balances` rows that disagree with the ledger.

This report is the engine behind the mode-switch preflight (§20).

---

## 19. Warehouse / Bin Master Data Rules

| | Warehouse Mode | Bin Mode |
|---|---|---|
| Create zone / locator / bin | **Allowed.** Physical organisation; preparation for BIN | Allowed |
| Required structure | Warehouse only | Every warehouse that holds stock, is a branch default, or is used on an open document must have **≥ 1 active bin** (enforced by preflight and when activating a warehouse) |
| Bin code | **[RULE]** Unique within its warehouse among active bins. Bins are referenced by id in all APIs | Same |
| Deactivate bin holding stock | Allowed; the stock remains and is consumed per §8.4 | **Blocked** while `on_hand(B) ≠ 0` or open allocations reference it. Move the stock first |
| Delete bin / locator / zone | **[RULE]** **Soft delete only** (`isActive = false`, BaseEntity convention), in both modes. Blocked while any descendant bin has non-zero on-hand or open allocations/documents. A bin with ledger history can never be physically deleted | Same |
| Delete warehouse | Soft delete only. Blocked while it holds stock, is a branch default, or is referenced by open documents | Same |
| Re-parenting a bin to another locator | Allowed only within the same warehouse. Never across warehouses | Same |
| Inactive bin as a target | Never valid for new inbound or allocation. Valid only for exact reversals (§8.2) | Same |

**[REC]**
- Denormalise `warehouse_bins.warehouse_id` (kept consistent by the service on create and re-parent) to make ownership checks cheap.
- After remediating dangling references, add `FK stock_movements.bin_id → warehouse_bins.id`, as `NOT VALID` then `VALIDATE`, plus the same for `zone_id` and `locator_id`.
- Optionally add a composite FK `(bin_id, warehouse_id) → warehouse_bins(id, warehouse_id)` to make §22.3 a database-level guarantee.

---

## 20. Mode Switching Rules

### 20.1 States

```text
WAREHOUSE ──start TO_BIN──► WAREHOUSE + TO_BIN ──cutover (preflight clean)──► BIN
    ▲                              │ abort                                      │
    │                              ▼                                            │
    └────────────── WAREHOUSE ◄────┘                                            │
    └──────────────────────────── switch (light preflight) ◄───────────────────┘
```

### 20.2 BIN → WAREHOUSE

**[RULE]**

| Question | Answer |
|---|---|
| Immediate switch allowed? | Yes, after a **light preflight**: no stock-take session `IN_PROGRESS` / `PENDING_APPROVAL`, and no internal bin-move or putaway documents pending. |
| Existing bin stock | Untouched. Remains in its bins. |
| New movements | Inbound uses NULL bin. Outbound consumes per §8.4, so existing bins drain first and none goes negative. |
| Historical movements | Unchanged. |
| Open documents | DNs dispatched with bin allocations deliver from those allocations if still satisfiable, else per §8.4. SENT transfers receive with NULL bin (any pre-filled `toBin` is ignored). Batch allocations keep their units. |
| Reversibility | Switching back to BIN requires the full §20.3 procedure. NULL-bin stock created in the meantime must be put away. |

### 20.3 WAREHOUSE → BIN

**[RULE] Not an immediate switch.** It is a three-step procedure:

1. **Preflight** (read-only, runnable any time).
2. **Start transition** (`TO_BIN`), allowed when no *structural* blockers remain (items S1–S3 below). From this moment the policy applies **BIN rules to all new writes**:
   - new inbound requires a bin;
   - outbound allocates from bins first, then may still consume legacy unlocated stock as a last resort, so sales continue during putaway;
   - no new NULL-bin stock can appear.
3. **Cutover** (`BIN`). Allowed only when the full preflight is clean. Re-validated **inside** the commit transaction (§24.6), so nothing can race between check and switch.

**Preflight checks:**

| # | Check | Severity |
|---|---|---|
| S1 | Every warehouse that holds stock, is a branch default, or is referenced by an open document has ≥ 1 active bin | BLOCKER (for transition start) |
| S2 | No duplicate active bin codes within a warehouse; no bin whose hierarchy is broken or inactive above it while active | BLOCKER (for transition start) |
| S3 | No ledger rows reference a deleted or non-existent bin/locator/zone, or a bin outside the row's warehouse | BLOCKER (for transition start). Remediation: remap via a corrective `BIN_MOVE` pair, never by rewriting |
| C1 | No non-zero unlocated balance per (product, warehouse[, batch, expiry]): positive needs putaway, negative needs adjustment or stock take | BLOCKER (cutover) |
| C2 | No negative balance on any (product, warehouse, bin[, batch, expiry]) identity | BLOCKER (cutover) |
| C3 | No `AVAILABLE`/`RESERVED`/`QUARANTINE` `BatchMaster` with NULL `bin_id`; none whose `warehouse_id`/`bin_id` disagree with the ledger | BLOCKER (cutover) |
| C4 | No `AVAILABLE`/`RESERVED` `SerialMaster` with NULL `bin_id` | BLOCKER (cutover) |
| C5 | No stock-take session `IN_PROGRESS` / `PENDING_APPROVAL` | BLOCKER (transition start and cutover) |
| W1 | SENT (in-transit) transfers exist | WARNING. They will require a destination bin per line at receipt |
| W2 | Dispatched-not-delivered DNs exist | WARNING. Bin allocation is performed and validated at delivery |
| W3 | Open SO / proforma / layaway reservations | INFO. Warehouse-level reservations remain valid |
| W4 | Draft/pending GRN / PI / LPO-direct without bins | WARNING. They will require bins before posting |
| W5 | `SalesSettings.stockCheckRequired = false` | WARNING. Negative selling will be blocked in BIN (§23) |
| W6 | POS branches without an explicit `defaultWarehouse` | BLOCKER (cutover). The fallback is disabled in BIN (§9.1) |

The preflight result lists each finding with counts and a drill-down list (product, warehouse, batch, qty) and the required action.

### 20.4 Guided putaway

**[RULE]** Guided putaway is **required** for WAREHOUSE → BIN whenever C1, C3 or C4 has findings.

- It is a worksheet per warehouse listing unlocated stock per (product, batch/expiry, serial) with quantity.
- For each line the user assigns one or more target bins with quantities. **[REC]** Suggest the bin that already holds the most of that product, else the warehouse's default receiving bin.
- On confirm, the system posts `PUTAWAY` pairs (−qty NULL bin, +qty target bin) in the same warehouse, and updates the `BatchMaster`/`SerialMaster` bin, in one transaction per worksheet batch.
- A putaway quantity may not exceed the current unlocated balance (locked read).
- Alternatively, a transition-time stock take (§13) may perform putaway by counting into bins.

### 20.5 Aborting

**[RULE]** `TO_BIN` may be aborted back to WAREHOUSE at any time. Putaways already posted remain; they are valid history.

---

## 21. Existing Data / Migration Rules

**[RULE] Historical records are never rewritten by a mode change.** They are *interpreted* according to the active mode:

| Data | Interpretation in WAREHOUSE | Interpretation in BIN |
|---|---|---|
| Movement, `bin_id = NULL` | Normal warehouse stock | Historical rows remain valid history. Their **net balance** per identity must be zero at cutover (C1); after cutover any non-zero net is an exception |
| Movement, `bin_id ≠ NULL` | Legacy bin stock, counted in the warehouse, consumed per §8.4 | Normal bin stock |
| `batch_master.bin_id = NULL` | Normal | Historical (`CONSUMED`/`SOLD`) units: fine. Live units: must be put away (C3) |
| Historical stock movements | Unchanged | Unchanged |
| Historical sales / purchases / transfers / stock takes | Unchanged documents. Reports show their recorded locations | Same |
| Dangling bin/zone/locator ids in history | Shown as "Unknown bin #id" in reports | Must be remediated by a corrective `BIN_MOVE` before transition (S3). The original rows stay |

**[RULE] One-time remediation is not a migration of the ledger.** It is new movements:
- putaway;
- corrective bin moves;
- adjustments for negative identities.

**[RULE] Derived stores may be rebuilt:**
- `inventory_balances` is rebuilt from the ledger (`rebuildAll`) after the drift fix.
- `BatchMaster` location and status may be **reconciled** to the ledger by a one-off job that reports first and corrects only on admin confirmation. The ledger wins.

**[RULE]**
- `bin_stock` is retired: no reads and no writes.
- The table is kept, not dropped, until a later cleanup migration. **[REC]** Drop it after one release with no references.
- Any future schema change takes the next free Flyway number above the highest applied one (currently above `V107`), per the repo convention.

**[RULE] `inventory_balances`.**
- Remains a **warehouse-level derived read model**, refreshed in the **same transaction** as the movement (not `REQUIRES_NEW`) by `StockMovementService`, for every writer.
- Covered by a scheduled reconcile/rebuild job analogous to `GlBalanceRebuildJob`.
- It never becomes authoritative.
- No bin-level cache is introduced. Bin queries hit the ledger, which is indexed by `idx_sm_wh_product_bin` (V105).

---

## 22. Data Integrity Rules

### 22.1 Both modes

1. **[RULE]** Every movement has non-null `product_id` and `warehouse_id`, and `branch_id` = the warehouse's branch (stamped).
2. **[RULE]** Every movement is written by `StockMovementService` (§3.1).
3. **[RULE]** If `bin_id` is set: the bin exists, and `bin → locator → zone → warehouse` resolves to the movement's `warehouse_id`. `zone_id` and `locator_id` equal the bin's derived ancestors. Inactive bins are allowed only for exact reversals.
4. **[RULE]** If `bin_id` is NULL, then `zone_id` and `locator_id` are NULL.
5. **[RULE]** Inbound purchase, opening, transfer-in, putaway, adjustment-plus and return movements carry `unit_cost` where a cost is defined.
6. **[RULE]** A batch-tracked product's movements carry `batch_number` (and `expiry_date` where expiry-tracked). A serial product's movements carry `serial_number` with quantity ±1.
7. **[RULE]** The `BatchMaster` live-unit count per (product, warehouse, bin, batch, expiry) equals the ledger balance for that identity. The same holds for `SerialMaster`.
8. **[RULE]** The warehouse of a document line matches the warehouse of its movements. Cross-branch access is enforced per existing `BranchAccessService` rules.

### 22.2 Bin Mode additionally

9. **[RULE]** Every movement that represents physical stock entering or leaving a location has a non-null, **active** bin of the same warehouse. Exceptions: exact reversals into an inactive bin; the `PUTAWAY` source leg (NULL → bin) during `TO_BIN` or exception putaway; and `TO_BIN`-transition outbound consumption of legacy unlocated stock.
10. **[RULE]** No physical bin identity balance below zero.

### 22.3 Ownership validation

**[RULE]** A bin belonging to Warehouse B is **never** accepted for Warehouse A. This is validated:
- on document save, for fast feedback;
- at posting, in `InventoryLocationPolicy.validateBinOwnership`;
- in `StockMovementService`, as the last line of defence;
- **[REC]** by the DB composite FK in §19.

It applies to every path: LPO hint bin, GRN header and lines, PI, transfer from/to lines, DN lines, sales returns, purchase returns, stock-take lines, adjustments, putaway.

---

## 23. Negative Stock Rules

| Situation | Warehouse Mode | Bin Mode |
|---|---|---|
| General sales deduction (DN / POS) | Allowed only if `stockCheckRequired = false`. The shortfall beyond the whole warehouse's stock is posted to the **NULL bin** with `negative_override = true`. Located identities are never driven negative (§8.4). | **Never allowed.** `stockCheckRequired` is treated as `true` and shown locked in Sales Settings. **[DECISION D4]** |
| Negative override (permission/setting) | As above. Audited via `negative_override`. | Not available |
| DN deduction | As general | Per-bin re-check at DELIVERED; block on shortfall |
| Transfer | **Never** | **Never** |
| Purchase return | **Never** | **Never** |
| Stock adjustment / stock take | An adjustment may not take an identity below zero. Stock take sets an identity to the counted value, which is ≥ 0 | Same |
| Sales return / reversal | Inbound; cannot create negatives | Same |
| Warehouse-level check vs bin | n/a | A warehouse-level availability check **never** authorises a bin deduction. Every bin deduction is checked against `free(B)` under lock |

**Rationale for D4.** The purpose of BIN mode is that the system knows *where* every unit is. A negative bin, or a negative "unlocated" bucket, is exactly the state BIN mode exists to prevent. Tenants that need to sell through missing stock should stay in WAREHOUSE mode.

---

## 24. Concurrency Rules

**[RULE]** The following must be atomic. Check and write happen in one transaction while holding the serialisation lock:

1. **Serialisation point.** **[REC]**
   - Use a **transaction-scoped PostgreSQL advisory lock** keyed by `(warehouse_id, product_id)`, e.g. `pg_advisory_xact_lock(hash)`.
   - It is taken by `StockMovementService` before reading availability and held until commit.
   - It replaces the `PESSIMISTIC_WRITE`-on-`SUM` approach, which cannot block concurrent INSERTs.
   - Alternative: lock the `inventory_balances` row with `SELECT … FOR UPDATE` after an upsert. Either is acceptable, but one must be chosen and used everywhere.
   - In BIN mode the same (warehouse, product) lock covers all bins. Per-bin locks are unnecessary and would add deadlock risk.
2. **Lock ordering.**
   - A transaction touching several keys (multi-line DN, transfer, stock take, putaway) acquires them in ascending `(warehouse_id, product_id)` order.
   - A transfer locks source and destination keys in that same global order.
   - Batch units are locked with `findByIdInForUpdate`, **after** the advisory lock, in ascending id order.
3. **Sell vs sell.** Each DELIVERED deduction re-reads `free(B)` (BIN) or `available(W)` (WAREHOUSE) under the lock. The second of two concurrent sales sees the first's movement, then either re-allocates (auto) or fails.
4. **Reserve vs reserve.** SO, layaway and batch reservations check `available(W)` under the same lock. Batch auto-FEFO uses `FOR UPDATE SKIP LOCKED` on candidate units (**[REC]**) so concurrent POS terminals pick different units instead of blocking.
5. **Transfer vs sell.** The SEND check and OUT movement happen under the lock. RECEIVE takes the destination lock.
6. **Mode switch vs posting.**
   - Every stock-posting transaction reads the tracking level and transition state once, under a shared advisory lock on a fixed key (`inventory-tracking-level`).
   - The switch commit takes that key exclusively, re-runs preflight, then commits.
   - No posting can interleave between the final check and the switch.
7. **Stock take vs everything.** Approval reads on-hand under the lock and applies the STALE rule (§13).
8. **Receive vs receive.** Inbound movements need the lock only for capacity checks (BIN) and for the duplicate-posting guards, which must run under the lock.
9. **Cache refresh.** `inventory_balances` is refreshed inside the locked transaction, so it is consistent at commit.

**[RULE]** The DB transaction boundary is the **document action**: post GRN, deliver DN, send/receive transfer, approve stock take/adjustment/purchase return. A failure anywhere rolls back all ledger rows, batch/serial updates, cache refresh and GL posting for that action.

---

## 25. Existing Defects Affecting Rollout

Existing defects that must be resolved before or during implementation. They are kept separate from the new design: this specification does **not** fix them. Severity reflects relevance to the two-mode rollout.

| # | Defect (confirmed) | Evidence | Severity | Must be fixed by |
|---|---|---|---|---|
| D-01 | Stock transfers and stock take write `stock_movements` directly, bypassing `StockMovementService`: no balance refresh, no central validation | `StockTransferService.buildStockMovement` + `stockMovementRepository.save`; `StockTakeService.approveSession` / `postSnapshotAdjustment` | **BLOCKER** | Phase 0 |
| D-02 | Batch FEFO auto-bin resolution has no warehouse/branch scope and keys on `product_code` | `BatchMasterRepository.findAvailableForSelectionAnyBin`; `BatchSelectionService.resolveSelectionBin` (used by Direct Sale and layaway auto-FEFO) | **BLOCKER** | Phase 0 |
| D-03 | Scanned batch (POS invoice pin, layaway) is resolved by batch number only; another warehouse's batch can be reserved | `reserveScannedBatchForSalesInvoiceLine`, `reserveBatchForLayawayLine` (`findFirstByBatchNumberIgnoreCase`) | **BLOCKER** | Phase 0 |
| D-04 | Transfer availability is warehouse-level even when a source bin is set; transfers can drive a bin negative | `StockTransferService.resolveAvailableQty` | **BLOCKER** | Phase 3 |
| D-05 | Bins, locators and zones are physically deleted with no stock check; no FK on `stock_movements.bin_id/zone_id/locator_id` → dangling references | `BinService.deleteBin`, `LocatorService.deleteLocator`, `ZoneService.deleteZone`; `V8__fk_constraints.sql` | **BLOCKER** | Phase 0 |
| D-06 | Bin ownership is not validated on LPO/GRN/PI/transfer; the GRN per-item bin is resolved by non-unique **code** and keeps the header zone/locator | `LpoService`, `PurchaseInvoiceService`, `StockTransferService` (`binRepository.findById(...).orElse(null)`); `GrnService` (`binRepo.findByCode`) | **BLOCKER** | Phase 0 |
| D-07 | Non-batch "Good" sales returns restock to the NULL bin; silently skipped when no DN warehouse resolves | `SalesReturnService.applyNonBatchStockReturns` / `resolveReturnWarehouseId` | **BLOCKER** (BIN) / HIGH (WAREHOUSE skip) | Phase 3 |
| D-08 | Negative override with no line bin posts the shortfall to the NULL bin; with a line bin, drives that bin negative | `DeliveryNoteService.postBatchAwareDeliveryDeduction` (`binDeductions.merge(item.getBinId(), remaining, …)`) | **BLOCKER** | Phase 3 |
| D-09 | Transfers do not update `BatchMaster`/`SerialMaster` location and drop `expiry_date` on transfer movements; batch reservations summed by stale `BatchMaster.warehouse_id` | `StockTransferService.buildStockMovement`; `BatchAllocationRepository.sumReservedByProductAndWarehouse` | **BLOCKER** | Phase 4 |
| D-10 | Purchase return creates the GL journal but never reduces inventory; the model has no warehouse/product/batch/serial | `PurchaseReturnService.approve`; `PurchaseReturn`, `PurchaseReturnItem` | **HIGH** | Phase 3 |
| D-11 | LPO requires zone/locator/bin at submit, but the LPO direct stock post writes **no bin** | `LpoService.submit` vs. `LpoService` `inward(...)` overload without bin | **HIGH** | Phase 2 |
| D-12 | Concurrency: `getAvailableStockForUpdate` locks an aggregate; it cannot block concurrent inserts (and PostgreSQL rejects `FOR UPDATE` with aggregates — verify the emitted SQL) | `StockMovementRepository.getAvailableStockForUpdate` | **HIGH** | Phase 0 |
| D-13 | Batch sales return restocks into `BatchMaster.warehouse_id` (receipt warehouse), not the warehouse it was sold from | `SalesReturnService` batch restock path | **HIGH** | Phase 3 |
| D-14 | Batch selection is single-bin; auto-FEFO cannot split across bins, so it reports "insufficient" while other bins hold stock | `BatchSelectionService.getSelectionOptions` / `saveSourceLineSelection` | **HIGH** | Phase 4 |
| D-15 | Non-batch stock take with no bin: warehouse-wide variance is posted at a single auto-detected bin (if exactly one) or the NULL bin; variance uses `systemQty` captured at add time (stale) | `StockTakeService.approveSession`, `addItemToSession` | **HIGH** | Phase 3 |
| D-16 | `inventory_balances` drift: `refresh` runs in `REQUIRES_NEW` (cannot see the uncommitted movement → stale by one movement); errors swallowed; not called by transfers/stock take | `InventoryBalanceService.refresh`; `StockMovementService.refreshBalance` | **MEDIUM** (cache has one reader today; becomes HIGH if chosen as the lock row in §24) | Phase 0 |
| D-17 | Purchase invoice moving-average cost reads dead `bin_stock` (`currentQty` ≈ 0) → product cost overwritten by the incoming cost | `PurchaseInvoiceService` (~line 579) | **MEDIUM** for rollout (**HIGH** financial severity independently) | Phase 0 |
| D-18 | Stock-take approver identity comes from a request parameter, not the principal | `StockTakeController.approveSession(@RequestParam String approvedBy)` | **MEDIUM** | Phase 3 |
| D-19 | `PUT /api/inventory/settings` overwrites the whole singleton for any inventory editor; adding the level there naively would let editors flip it | `InventorySettingsController.saveSettings` | **MEDIUM** (design constraint, honoured by §6.2) | Phase 1 |
| D-20 | Bin codes are not unique (globally or per warehouse) | `BinRepository.findAllByCode`; `BatchSelectionService.resolveUniqueBin` error path | **MEDIUM** | Phase 0 |
| D-21 | POS warehouse fallback "first active warehouse of the branch" is non-deterministic | `SalesInvoiceService.resolveBranchDefaultWarehouseId`; `PosLayawayService` | **LOW** | Phase 2 |
| D-22 | Non-batch inbound overload `postInboundStock(…, Integer qty, String ref)` writes no `unit_cost` (used by GRN non-batch lines), so those receipts are excluded from WAC | `StockMovementService.postInboundStock` (9-arg) | **LOW** for rollout; verify financial impact separately | Phase 0 |

---

## 26. Business Rules Matrix

| Area | Warehouse Level | Bin Level |
|---|---|---|
| Stock identity | Product + Warehouse (+ batch/expiry/serial) | Product + Warehouse + Bin (+ batch/expiry/serial) |
| Purchase (GRN / Direct PI / LPO-post) | Warehouse required; bin not used; `bin_id = NULL` | Warehouse + bin per line required before submit; posted to exactly that bin; zone/locator derived |
| LPO | Warehouse only; no stock | Warehouse; optional putaway-hint bin; no stock |
| Purchase return | Outbound from warehouse; hard availability check; batch/serial explicit | Outbound from selected/allocated bin; `free(bin)` hard check |
| Sales (SO / invoice / DN) | No bins; DN deducts per §8.4 depletion order | Model C: optional bin on back-office lines; mandatory allocation at dispatch; deduct per allocation at delivery |
| Sales return | Good → original sold-from warehouse, `bin_id = NULL`; not Good → scrap | Good → Returns bin › original bin › user-chosen bin (never NULL); not Good → scrap (D5) |
| POS | Branch default warehouse; auto depletion; no bin UI | Branch default warehouse (explicit, required); auto bin allocation + cross-bin FEFO; no bin UI |
| Reservation | Warehouse-level (SO / proforma / layaway / DN); batch units | Same warehouse-level reservations; bins claimed at DN dispatch or batch-unit allocation |
| Batch | Per-unit `BatchMaster`, `bin_id` may be NULL | Per-unit, live units must have a bin |
| FEFO | `(product_id, warehouse_id)` across all identities | `(product_id, warehouse_id)` across bins; explicit bin narrows |
| Transfer | Warehouse → warehouse only | Line-level bin → bin (cross-warehouse); same-warehouse bin move; putaway only in transition/exception |
| Stock take | Count per product per warehouse | Count per (product, bin); bin mandatory |
| Opening stock | Warehouse, `bin_id = NULL` | Warehouse + bin mandatory |
| Adjustment | Stock Adjustment document (Phase 7) + stock take; never below zero | Same, with bin per line |
| Availability | on hand(W) − reserved(W) | Same at warehouse level, plus `free(B)` for allocation |
| Negative stock | Only if `stockCheckRequired = false`; shortfall to NULL bin with override flag | Never (D4) |
| Reports | Product → Warehouse | Product → Warehouse → Bin; valuation at warehouse WAC |
| Warehouse setup | Required | Required; ≥ 1 active bin per stock-holding warehouse |
| Bin setup | Optional; soft delete; unique code per warehouse | Required; soft delete; blocked while holding stock |
| Mode switching | → BIN via preflight + `TO_BIN` + putaway + cutover | → WAREHOUSE immediately after light preflight |

---

## 27. Acceptance Criteria

Notation: `W:A` = Warehouse A, `B1` = Bin 1 of W:A, `U` = unlocated (NULL bin). All quantities are base units. "Ledger" means rows in `stock_movements`.

### 27.1 Setting & governance

| ID | Given | When | Then |
|---|---|---|---|
| AC-SET-1 | Existing tenant upgraded | App boots | `stock_tracking_level = WAREHOUSE`, `transition = NONE` |
| AC-SET-2 | User with inventory EDIT but not ROLE_ADMIN | PUT `/api/inventory/settings` with `stockTrackingLevel=BIN` | Level unchanged; other fields saved |
| AC-SET-3 | Same user | POST `/tracking-level` | 403 |
| AC-SET-4 | ROLE_ADMIN changes level | Commit succeeds | History row with from/to, principal, reason, preflight snapshot; AuditLog entry |

### 27.2 Warehouse mode

| ID | Given | When | Then |
|---|---|---|---|
| AC-WH-1 | W:A, Product X = 100 | GRN of 20 posted | W:A = 120; new ledger row `bin_id = NULL`, `unit_cost` set |
| AC-WH-2 | W:A X = 120 | POS sells 30 | W:A = 90; cashier never prompted for a bin |
| AC-WH-3 | GRN with a bin sent by an old client | Post | Row written with `bin_id = NULL`; INFO log |
| AC-WH-4 | Legacy: B1 = 10, U = 5 | DN delivers 12 | Rows: −10 @ B1, −2 @ U; no identity negative |
| AC-WH-5 | W:A X = 5, `stockCheckRequired = false` | DN delivers 8 | −5 consumed from identities; −3 @ U with `negative_override = true` |
| AC-WH-6 | W:A X = 5, `stockCheckRequired = true` | DN delivers 8 | Rejected; no rows |
| AC-WH-7 | Batch P: units in W:A (exp Mar) and W:B (exp Jan) | POS auto-FEFO for 1 unit in W:A | W:A's March unit reserved; W:B's batch never considered |
| AC-WH-8 | LPO in draft without zone/locator/bin | Submit | Accepted |
| AC-WH-9 | Transfer W:A → W:A | Save | Rejected "same warehouse" |
| AC-WH-10 | Stock take, X system 100, counted 97, legacy B1 = 2, U = 98 | Approve | Adjustment −3 consumed per §8.4 (B1 −2, U −1); W:A = 97 |
| AC-WH-11 | Good non-batch return of an invoice delivered from W:B | Post | +qty @ W:B, `bin_id = NULL` |
| AC-WH-12 | Back-office return with no linked DN, no warehouse chosen | Post | Blocked: "Select the return warehouse" |

### 27.3 Bin mode

| ID | Given | When | Then |
|---|---|---|---|
| AC-BIN-1 | W:A: B1 = 40, B2 = 60 | POS sells 50 | −50 @ B2; B1 = 40, B2 = 10 |
| AC-BIN-2 | Same initial | POS sells 80 | −60 @ B2, −20 @ B1; no negative |
| AC-BIN-3 | Same initial | POS sells 101 | Rejected (no negative in BIN) regardless of `stockCheckRequired` |
| AC-BIN-4 | B1 = 40; DN line with user-selected B1, qty 50 | Dispatch | Blocked: "B1 free 40" |
| AC-BIN-5 | GRN for W:A with a bin of W:B | QC submit | Rejected: bin does not belong to W:A |
| AC-BIN-6 | GRN line without a bin, header without a bin | QC submit | Rejected: bin required |
| AC-BIN-7 | GRN header B1, line override B2 (different locator) | Post | Row bin = B2, zone/locator = B2's ancestors |
| AC-BIN-8 | Transfer line W:A/B1 → W:B, qty 10, B1 = 6, W:A total 50 | Send | Rejected: B1 free 6 |
| AC-BIN-9 | Transfer W:A/B1 → W:B, received without a destination bin | Receive | Rejected: destination bin required per line |
| AC-BIN-10 | Batch unit u1 in W:A/B1 transferred to W:B/B7 | Receive | `BatchMaster(u1)`: warehouse W:B, bin B7, AVAILABLE; ledger has expiry on both legs |
| AC-BIN-11 | Bin move B1 → B2 in W:A, 5 units | Post | −5 @ B1, +5 @ B2, one transaction, no GL journal; W:A total unchanged |
| AC-BIN-12 | Bin B1 holds 3 | Delete or deactivate B1 | Blocked |
| AC-BIN-13 | Good return of a unit sold from B1, W:A has Returns bin R | Post | +1 @ R |
| AC-BIN-14 | Same, no Returns bin, B1 active | Post | +1 @ B1 |
| AC-BIN-15 | Two concurrent POS sales of 30, B1 = 40 only | Both deliver | One succeeds; the other fails or re-allocates; B1 never < 0 |
| AC-BIN-16 | SO reserves 30 of X (warehouse-level); B1 = 20, B2 = 20 | Second SO for 15 | Blocked (available = 40 − 30 = 10) |
| AC-BIN-17 | Stock take line (X, B1) counted 12, system 10; a sale −2 @ B1 posted after counting | Approve | Line flagged STALE; approval blocked until re-count or explicit "post against current" (+4) |
| AC-BIN-18 | Scanned batch belongs to W:B; POS in W:A | Scan | Rejected "not in this store's stock" |
| AC-BIN-19 | Purchase return 5 of X from B1 holding 3 | Approve | Rejected (never negative), no journal |

### 27.4 Purchase return (both modes)

| ID | Given | When | Then |
|---|---|---|---|
| AC-PR-1 | W:A X = 10 (WAREHOUSE) | Approve return of 4 | Ledger −4 `PURCHASE_RETURN` @ W:A; journal posted in the same transaction; W:A = 6 |
| AC-PR-2 | Batch product, 2 units selected | Approve | Units `CONSUMED`, `PURCHASE_RETURN` allocation; ledger rows carry batch + expiry |
| AC-PR-3 | Approved return | Cancel | Exact reversal of ledger and journal |

### 27.5 Mode switch

| ID | Given | When | Then |
|---|---|---|---|
| AC-SW-1 | WAREHOUSE, U = 5 for X in W:A | Preflight → BIN | C1 BLOCKER listing (X, W:A, 5) |
| AC-SW-2 | Warehouse with stock and zero bins | Start `TO_BIN` | Refused (S1) |
| AC-SW-3 | `TO_BIN` active | GRN without bin | Rejected (BIN write rules apply) |
| AC-SW-4 | `TO_BIN`, B1 = 2, U = 5 | POS sells 4 | −2 @ B1, −2 @ U (bins first, then legacy unlocated) |
| AC-SW-5 | `TO_BIN`, putaway U → B1, 3 | Confirm | −3 @ U, +3 @ B1 (`PUTAWAY`); batch units' bin updated |
| AC-SW-6 | All C-checks clean | Cutover | Level = BIN; history row; preflight re-run inside the transaction |
| AC-SW-7 | Cutover racing a posting that would create unlocated stock | Concurrent | Posting either commits before the switch lock (and is then caught by the in-transaction preflight → cutover refused), or runs after it under BIN rules |
| AC-SW-8 | BIN, stock take IN_PROGRESS | Switch → WAREHOUSE | Refused (C5) |
| AC-SW-9 | BIN → WAREHOUSE done; B1 = 10 | GRN of 5 | +5 @ U; B1 still 10; W:A = 15 |
| AC-SW-10 | Any switch | — | Zero updates to pre-existing `stock_movements` rows |

### 27.6 Architecture guards

| ID | Then |
|---|---|
| AC-ARCH-1 | A unit test asserts that no class other than `StockMovementService` calls `StockMovementRepository.save/saveAll` |
| AC-ARCH-2 | No production class reads `BinStockRepository` |
| AC-ARCH-3 | No `BatchMasterRepository` selection query lacks a `warehouseId` parameter (test via repository method signature inspection) |
| AC-ARCH-4 | After any posting, `inventory_balances(product, warehouse).on_hand_qty` = ledger SUM (integration test) |
| AC-ARCH-5 | Integrity exception report (§18.3) is empty after the full acceptance suite in BIN mode |

---

## 28. Recommended Implementation Architecture

### 28.1 Packages and classes

Names follow the existing package-by-feature layout. `inventory/scope/InventoryBranchScopeResolver` is the precedent for a resolver of this kind.

| Component | Location | Responsibility |
|---|---|---|
| `InventoryTrackingLevel`, `TrackingLevelTransition` | `inventory/settings` | Enums |
| `InventoryTrackingLevelResolver` | `inventory/settings` | Reads `inventory_settings` (cached, evicted on change). `resolve(Long warehouseId)` returns the effective level and transition. The single place that reads the setting |
| `InventoryTrackingLevelService` + controller | `inventory/settings` | Preflight, transition start/abort, cutover, history, audit. `ROLE_ADMIN`-only endpoints |
| `InventoryIntegrityService` | `inventory/integrity` (new) | The §18.3 checks. Reused by preflight and the exception report |
| `InventoryLocationPolicy` | `inventory/location` (new) | `requireBinFor(sourceType, warehouseId)`, `validateBinOwnership(binId, warehouseId)`, `deriveHierarchy(binId)`, `negativeStockAllowed(sourceType, warehouseId)`, `validateInboundLine(...)`, `validateOutboundLine(...)`. Pure decisions, no writes |
| `StockAllocationService` | `inventory/location` | §8.3 / §8.4 / §11.4 allocation: returns a list of (bin, batch, expiry, serial, qty) identities for an outbound request. Used by DN, POS, transfer, purchase return, adjustment, stock-take negative variance |
| `BatchSelectionService` (existing) | `inventory/batch` | Refactored to warehouse-scoped queries and cross-bin FEFO. Delegates allocation ordering to `StockAllocationService` |
| `StockMovementService` (existing) | `purchase/stockmovement` | **Sole writer.** Takes the advisory lock; resolves the tracking level once per transaction; re-validates via policy; derives zone/locator; writes rows; syncs `BatchMaster`/`SerialMaster` location and status; refreshes `inventory_balances` in-transaction |
| `PutawayService` + worksheet controller | `inventory/location` | §20.4 |
| `StockAdjustment*` | `inventory/adjustment` (new, Phase 7) | §17 |

### 28.2 How each module uses it

| Question | Answer |
|---|---|
| Where is the setting? | `inventory_settings.stock_tracking_level` (+ `tracking_level_transition`) |
| How is it resolved? | `InventoryTrackingLevelResolver.resolve(warehouseId)`, read once per stock transaction under the shared mode lock (§24.6) |
| Where is location policy enforced? | Document services call `InventoryLocationPolicy` on save/submit (friendly errors). `StockMovementService` re-enforces it on every write (hard guarantee) |
| Purchase | GRN/PI/LPO-post validate lines via the policy at submit; posting passes the line bin (or none) to `StockMovementService`. Purchase return uses `StockAllocationService` for the source identities |
| Sales | DN dispatch calls `StockAllocationService` (BIN) and persists line locations; DN delivery posts per allocation (BIN) or per depletion order (WAREHOUSE). Returns resolve the location via the §15 rules in the policy |
| POS | Unchanged flow (invoice → auto-DN → dispatch → deliver). Warehouse from branch default (explicit in BIN); allocation automatic; batch FEFO warehouse-scoped |
| Transfers | Line-level bins; SEND uses `StockAllocationService` if no from-bin is given (BIN); RECEIVE validates destination bins; all rows via `StockMovementService` |
| Stock take | Item identity per mode; approval computes adjustments under lock; negative adjustments use `StockAllocationService` (WAREHOUSE); rows via `StockMovementService` |
| Reservations | `WarehouseStockService` stays the warehouse-level ATP calculator; adds `free(bin)` for BIN allocation; batch reservations warehouse-scoped |
| Batches | `BatchMaster` location and status sync owned by `StockMovementService`; all selection warehouse-scoped |
| Reports | Ledger-derived; mode decides the default grouping (warehouse vs warehouse+bin); integrity report always available |

### 28.3 Frontend

**[RULE]** The frontend reads the level from `GET /api/inventory/settings/tracking-level`. Store it in a context alongside `CompanyContext`.

- In WAREHOUSE it hides zone/locator/bin on transaction screens.
- In BIN it shows bin pickers **filtered by the document warehouse** and displays zone/locator read-only.
- The backend is authoritative. The UI is never the only enforcement.
- New calls go into the existing `src/api/` files: `inventorySettingsApi`, `stockTransferApi`, etc.

---

## 29. Implementation Phases

| Phase | Content | Exit criteria |
|---|---|---|
| **0 — Foundations (defect remediation)** | D-01 single write gate (transfers, stock take → `StockMovementService`); D-12 advisory-lock serialisation; D-16 in-transaction balance refresh + rebuild job; D-02/D-03 warehouse-scoped batch queries and scans; D-05 soft delete + stock guards for zone/locator/bin; D-06 bin ownership validation + bin by id; D-20 per-warehouse unique bin code; D-17 PI cost from ledger; D-22 unit cost on all inbound | AC-ARCH-1..4 green; behaviour otherwise unchanged |
| **1 — Setting (dormant)** | Columns, history table, resolver, policy skeleton, admin endpoints, exclusion from the generic PUT (D-19). Level = WAREHOUSE everywhere | AC-SET-1..4 |
| **2 — Warehouse-mode semantics** | LPO/GRN/PI stop requiring bins in WAREHOUSE (D-11); LPO-direct post per §7; §8.4 depletion order in DN; deterministic POS fallback (D-21) | AC-WH-1..9 |
| **3 — Bin-mode write paths** | Line-level bins on GRN/PI/transfer; DN dispatch allocation + `delivery_note_item_locations`; negative-stock policy (D-08); transfer bin-level availability (D-04); sales return location rules (D-07, D-13); purchase return inventory (D-10); stock-take identity/approval rules (D-15, D-18) | AC-BIN-1..9, 12–19, AC-PR-*, AC-WH-10..12 |
| **4 — Batch/serial location sync** | Location sync in `StockMovementService`; transfer batch units and expiry (D-09); cross-bin FEFO (D-14) | AC-BIN-10, AC-WH-7 |
| **5 — Mode switching** | Integrity service, preflight, `TO_BIN` transition, putaway worksheet, cutover with in-transaction re-check, BIN → WAREHOUSE | AC-SW-1..10 |
| **6 — Reporting & UI** | Mode-aware report grouping, integrity exception report, dashboard tiles, frontend mode context and bin pickers | AC-ARCH-5; UX sign-off |
| **7 — Stock Adjustment module** | §17 | Its own acceptance suite |

Phases 0–2 are safe to ship to all tenants, since WAREHOUSE behaviour is preserved. BIN becomes selectable only after Phases 3–5 ship.

---

## 30. Open Business Decisions

Each decision has a stated default. The specification is implementable with the defaults as written. A decision changes only the named rules.

**D1 — Default level for existing tenants**
- **Decision required:** Default existing tenants to WAREHOUSE (default) or BIN.
- **Why it matters:** Existing data contains unlocated stock created by LPO posts, sales returns, overrides and stock take. BIN would refuse transactions until a putaway is done.
- **Options:**
  - (a) WAREHOUSE for all, then migrate tenants that want bins via §20. **Default.**
  - (b) BIN for tenants whose data passes preflight; WAREHOUSE otherwise.
- **Impact:**
  - (a) No disruption. LPO/GRN/PI stop requiring bins.
  - (b) Per-tenant analysis and possible user confusion about why tenants differ.

**D2 — Maker-checker for the level change**
- **Decision required:** Whether a second admin must approve the change.
- **Why it matters:** The change alters operational behaviour company-wide.
- **Options:**
  - (a) Single ROLE_ADMIN with typed confirmation and reason. **Default.**
  - (b) Two-admin approval using `common.workflow.ApprovalStatus`.
- **Impact:**
  - (a) Simple.
  - (b) Safer, but tenants with a single admin cannot switch without support.

**D3 — LPO direct stock posting**
- **Decision required:** Keep or retire the path where an approved LPO posts stock without a GRN.
- **Why it matters:** It duplicates GRN receiving without QC.
- **Options:**
  - (a) Keep it, governed by GRN location rules. **Default.**
  - (b) Retire it; all receipts go through GRN.
- **Impact:**
  - (a) No workflow change.
  - (b) Cleaner model, but a workflow change for tenants that use it.

**D4 — Negative stock in BIN mode**
- **Decision required:** Whether BIN mode may ever sell into negative.
- **Why it matters:** BIN mode's value is location accuracy. Negatives undermine it.
- **Options:**
  - (a) Never. **Default.**
  - (b) Allow at POS only, posting the shortfall to the unlocated bucket with `negative_override`, cleared by stock take.
- **Impact:**
  - (a) A POS sale can be refused when system stock is wrong.
  - (b) Sales never blocked, but BIN integrity exceptions accumulate and cutover invariants weaken.

**D5 — Non-Good sales returns**
- **Decision required:** Whether damaged/defective/expired/opened returns are scrapped or kept as non-saleable stock.
- **Why it matters:** It affects COGS, supplier claims and physical tracking.
- **Options:**
  - (a) Scrap, no movement (as today). **Default.**
  - (b) Inbound to a Quarantine-zone bin (BIN) or quarantine status (WAREHOUSE), excluded from available stock.
- **Impact:**
  - (a) Simple; damaged goods untracked.
  - (b) Requires a non-saleable stock concept in availability and FEFO (exclude quarantine bins), plus later write-off via adjustment.

**D6 — Bin capacity enforcement**
- **Decision required:** Hard or soft capacity checks in BIN mode.
- **Why it matters:** Received goods physically exist even if a bin is "full".
- **Options:**
  - (a) Hard on stock take, putaway, bin move and transfer receipt; warning on GRN and returns. **Default.**
  - (b) Hard everywhere.
  - (c) Warning everywhere.
- **Impact:**
  - (a) Balanced.
  - (b) Can block receiving.
  - (c) Capacity becomes informational.

**D7 — Partial transfer receipt**
- **Decision required:** Whether transfers support partial receipt and short-shipment handling.
- **Why it matters:** Today receipt is all-or-nothing.
- **Options:**
  - (a) Keep full receipt. **Default.**
  - (b) Partial receipt, with the remainder in transit or returned.
- **Impact:**
  - (a) No change.
  - (b) Additional states, GL and in-transit reporting.

No other `NEEDS DECISION` items remain. Every other rule in this document is normative as written.
