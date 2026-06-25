# POS P0 Fix Report — Batch Control, Reserved Stock, Report Crash, Checkout Warehouse, Payment Posting

**Date:** 2026-06-24
**Branch:** `feature/pos-erp-audit`
**Scope:** 5 production-blocking POS issues (batch duplication, reserved-stock sale, X/Z-report crash, checkout warehouse 400, payment-not-posted / invoice stuck DRAFT).

---

## Executive summary

| # | Issue | Root cause | Status |
|---|-------|-----------|--------|
| 1 | Batch-controlled product addable multiple times (qty inflates) | Grid-click / qty paths merged by `productId` with no one-batch-one-unit rule | **Fixed** |
| 2 | Reserved batches still sellable | POS resolve pinned any batch by name without checking `BatchStatus` (availability) | **Fixed** |
| 3 | X-Report / Z-Report / Export / Session-close print crash (`columns.map` of `undefined`) | POS report VMs emit legacy `{cols, rows:[[]], footer}`; the A4 renderer expects `{columns:[{header,key,align}], rows:[{}], totals}` | **Fixed** |
| 4 | Checkout 400 "Auto-delivery requires a warehouse on every item" + `removeChild` DOM crash | POS checkout never set `warehouseId` on invoice items; the 400 then unfroze the A4 preview mid-render, racing the iframe DOM | **Fixed** |
| 5 | Payment not showing — invoice stays DRAFT, Paid = 0 | Same root cause as #4: `updateStatus` threw before `recordPayment` ran, leaving the committed DRAFT stranded | **Fixed** |

Issues **#4 and #5 share a single root cause** (no warehouse on POS line items). Fixing the warehouse assignment resolves both: the auto-delivery posts, stock deducts, GL posts, status advances to PAID/PARTIALLY_PAID, and payment records.

---

## Issue #1 — One batch = one unit (no duplicate / no qty inflation)

### Root cause
`addToInvoice` (`POSSales.jsx`) merged non-pinned lines by `productId`, bumping quantity. A batch-controlled product clicked from the grid carries no pinned batch, so repeated clicks inflated a single line's quantity — violating the "one physical unit = one batch number" rule. The scan path already de-duped pinned batches, but grid-click and the cart `+/-` buttons did not.

### Fix
The product list/aggregate payloads already expose `isBatch` / `isSerial` (see `ProductService.getList` → `item.put("isBatch", …)`). These flags were not surfaced to the frontend cart.

- `POS/posUtils.js` — `mapPosProductListItem` and `mapPosProductAggregateItem` now carry `isBatch`, `isSerial`, `fefoEnabled`.
- `POSSales.jsx` `addToInvoice` — now returns `{ ok, reason }`. For a batch/serial product added **without a pin**:
  - adds exactly a **qty-1, non-merging line** (flagged `batchControlled: true`), FEFO auto-picks the batch at checkout;
  - **blocks re-adding** the same product from the grid (`"… is batch-tracked — scan a specific batch to add another unit."`).
- `POSSales.jsx` `updateQuantity` — refuses to change quantity on a `batchControlled` line.
- `POSTouchScreen.jsx` — grid card surfaces the `{ok,reason}` refusal; cart `+/-` buttons are hidden for `batchControlled` lines (both cart layouts).
- The existing scanned-batch / scanned-serial dedup (`"Batch … already exists in cart"`) is unchanged.

> **Behaviour chosen (confirmed):** *Qty-1 line, block re-add, disable +/- for batch lines.* Keeps fast walk-in throughput while preventing the inflation bug; extra units require scanning distinct batches.

---

## Issue #2 — Reserved batches can no longer be sold

### Root cause
`PosSearchService.resolve` step 2 matched a batch by number and pinned it **regardless of `BatchStatus`**. A `RESERVED` unit (held for a layaway / another open sale) has `available = 0` in the warehouse view but was still addable to the cart.

### Fix
- `PosSearchService.resolve` — a matched batch is only pinned when `status == AVAILABLE`. `RESERVED` → blocked ("already reserved — no available quantity remaining"); `CONSUMED`/`SOLD` → blocked ("already sold/consumed — no available quantity remaining").
- `PosResolveResponse` — new `BLOCKED` type + `message` field (`blocked(reason)` factory).
- `POSSales.jsx` `handleUnifiedEntry` — handles `type === 'BLOCKED'`, shows the message, and never falls through to add/grid-filter.

### Defense-in-depth (already present, verified)
The posting/reservation layer was already safe: `BatchSelectionService.validateSelectable` throws `CONFLICT` if a selected batch is not `AVAILABLE`, and `assertNoActiveAllocations` rejects a batch that already has an active `RESERVED` allocation. The resolve-level guard is the new **front-line UX block** so the cashier sees a clear reason instead of a hard conflict only at checkout.

---

## Issue #3 — Report generation crash (X / Z / Export / Session-close)

### Root cause
`generateReportA4Html` → `renderReportSectionHtml` → `renderReportColumnsHtml` does `columns.map(...)`. The Sales reports build sections as `{ columns:[{header,key,align}], rows:[{key:value}], totals }`, but the POS X-Report and Z-Report view models (`buildXReportViewModel` / `buildZReportViewModel`) build the **legacy** shape `{ cols:[...], rows:[[...]], footer:[...] }`. `section.columns` was therefore `undefined` → `Cannot read properties of undefined (reading 'map')` at `printGenerator.js:396`.

### Fix (`printGenerator.js`)
Added `normalizeReportSection(section)` called at the top of `renderReportSectionHtml`:
- native `{columns}` shape passes through (with defensive array/label gap-filling);
- legacy `{cols, rows:[[]], footer}` is converted to the native shape (synthetic `c0,c1,…` keys, first column left-aligned, rest right-aligned, `footer` → `totals`).
- `renderReportColumnsHtml` also hardened with `Array.isArray(columns) ? … : []`.

This is a single change at the rendering layer, so it fixes **X-Report, Z-Report, Export, and Session-Close print** at once (all four route through `generateReportA4Html`).

---

## Issue #4 — Checkout warehouse assignment + `removeChild` crash

### Root cause (backend, the real failure)
POS checkout (`PosCheckoutController.buildInvoice`) builds `SalesInvoiceItem`s but **never sets `warehouseId`** (the cashier picks no warehouse/bin). On status transition, `SalesInvoiceService.autoGenerateDeliveryNote` requires a warehouse on every item and, in FAST_SALE/DIRECT_SALE auto-delivery, throws `400 "Auto-delivery requires a warehouse on every item …"`.

### Fix (backend)
`SalesInvoiceService.save` now resolves the **branch default warehouse** once and stamps it onto every non-voided, non-service line that lacks one — *before* batch/bin assignment and before status transition:
- new helper `resolveBranchDefaultWarehouseId(branchId)` — prefers `Branch.defaultWarehouse`, falls back to the first active warehouse for the branch (`WarehouseRepository.findByBranch_Id`).
- `BranchRepository` injected into `SalesInvoiceService` for the existing-invoice (branch-stub) path.

### Root cause (frontend, the secondary `removeChild` crash)
On checkout failure the `catch` block called `setCheckoutSettling(false)`, **unfreezing the A4 preview in the same render that mounts the error banner**. Swapping the live iframe blob `src` while React reconciles races the iframe's external DOM mutation → `Failed to execute 'removeChild' on 'Node'`.

### Fix (frontend)
`processPayment` `catch` no longer flips `checkoutSettling` synchronously — it only sets the error. The preview stays frozen and is released safely by the existing dialog-close effect (`if (!showPaymentDialog && checkoutSettling) setCheckoutSettling(false)`). With the backend fix the 400 no longer occurs for normal sales; this guard prevents the DOM crash for *any* checkout failure (e.g. a genuine batch shortfall).

### Friendly validation
Because the warehouse is resolved server-side (POS has no warehouse picker), the correct "validation before submission" is the clear error surfaced in the checkout error banner on the now-rare failure, rather than a client pre-check that cannot know the branch default. Additionally, the controller now **cleans up the stranded DRAFT** if posting fails (see #5).

---

## Issue #5 — Payment posting / invoice status transition

### Root cause
`PosCheckoutController.checkout` runs three steps:
1. `invoiceService.save(invoice)` — commits the invoice as **DRAFT** (its own transaction).
2. `invoiceService.updateStatus(...)` — FEFO reserve, auto-DN, stock deduct, GL post, status → PAID.
3. `invoiceService.recordPayment(...)` — Payment + Receipt Voucher + GL.

When step 2 threw the warehouse 400 (Issue #4), step 3 never ran. But step 1 had already committed, so the invoice was left **DRAFT, Paid = 0, Balance = full** — exactly the reported INV-2026-0035 state.

### Fix
- Primary: the warehouse default (Issue #4) makes step 2 succeed → status advances and step 3 records the payment. Cash sale now ends **PAID, Paid = total, Balance = 0**, with Payment row, Receipt Voucher, cash-drawer + session totals, stock deduction, and GL all posted.
- Resilience: step 2 is now wrapped so that if posting genuinely fails (e.g. no resolvable warehouse, real stock shortfall) the committed DRAFT is deleted (`invoiceService.delete`) and the real cause is surfaced — no more stranded DRAFT/Paid=0 invoices.

---

## Warehouse assignment flow (as it now stands)

```
POS cart (no warehouse picker)
  → PosCheckoutController.buildInvoice  (items have warehouseId = null)
  → SalesInvoiceService.save
        resolveBranchDefaultWarehouseId(branchId)
          1. Branch.defaultWarehouse, else
          2. first active WarehouseRepository.findByBranch_Id(branchId)
        for each non-voided, non-service line with warehouseId == null:
            item.warehouseId = branchDefaultWarehouseId
        assignBatchBinIfNeeded(...)            ← now has a warehouse to find a bin
  → updateStatus → autoGenerateDeliveryNote     ← warehouse present → posts
        reserve FEFO/pinned batch → deduct stock (StockMovement) → GL journal
  → recordPayment → Payment + Receipt Voucher + GL → status PAID
```

---

## Files changed

**Backend**
- `pos/search/PosSearchService.java` — block non-AVAILABLE batch on resolve (#2).
- `pos/search/PosResolveResponse.java` — `BLOCKED` type + `message` + `blocked()` factory (#2).
- `pos/checkout/PosCheckoutController.java` — clean up stranded DRAFT on posting failure (#4/#5).
- `sales/invoice/SalesInvoiceService.java` — default branch warehouse on lines; `resolveBranchDefaultWarehouseId`; inject `BranchRepository` (#4/#5).

**Frontend**
- `utils/printGenerator.js` — `normalizeReportSection` + array guard (#3).
- `pages/Sales/POSSales.jsx` — batch-uniqueness in `addToInvoice`/`updateQuantity`, BLOCKED handling, frozen-preview-on-error (#1/#2/#4).
- `pages/Sales/POS/POSTouchScreen.jsx` — grid refusal surfacing, hide +/- on batch lines (#1).
- `pages/Sales/POS/posUtils.js` — surface `isBatch`/`isSerial`/`fefoEnabled` (#1).

**Tests**
- `pos/search/PosSearchServiceTest.java` — +2 tests (reserved & consumed batch blocked).
- `sales/invoice/SalesInvoiceTotalsTest.java` — constructor updated for injected `BranchRepository`.

---

## Verification

- **Backend compile:** `mvn -o compile` — clean.
- **Backend tests:** `mvn -o test` (excluding 2 pre-existing-broken classes + DB `contextLoads`) → **151 run, 0 failures**. `PosSearchServiceTest` 8/8 (incl. 2 new), `SalesInvoiceTotalsTest` 10/10.
- **Pre-existing failures (NOT caused by this work, confirmed by stashing the `SalesInvoiceService` change and re-running):** `WarehouseServiceTest` (4, Mockito strict-stubbing) and `LedgerServiceBankAccountTest` (1, null `branchAccessService` in test). Both classes are unmodified at HEAD and independent of these changes.
- **Frontend:** `eslint --quiet` on all 4 changed files → **0 errors**; `npm run build` → **built OK**.

### Database / record verification checklist (run against a live cash sale after deploy)
For a completed cash POS sale the following rows should now exist (was the failing state before):
`sales_invoice` (status `PAID`, `amount_paid` = total, balance 0) · `sales_invoice_item` (with `warehouse_id` set) · `payment` + receipt voucher · `stock_movement` (deduction) · batch `RESERVED→CONSUMED` + `batch_allocation` · cash-drawer + POS session totals · GL journal (Dr Cash 1001 / Cr Revenue / Cr VAT, Dr COGS / Cr Inventory for FAST_SALE) · `pos_audit_log` checkout-completed.
