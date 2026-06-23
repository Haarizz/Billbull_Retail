# BillBull POS — Workflow Gap Analysis Report
**Date:** 2026-06-23  
**Branch:** feature/db-money-bigdecimal  
**Scope:** Full end-to-end analysis of current POS implementation vs production-grade ERP POS standard

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current POS Architecture Overview](#2-current-pos-architecture-overview)
3. [Section-by-Section Gap Analysis](#3-section-by-section-gap-analysis)
   - 3.1 Product Search & Resolution
   - 3.2 Barcode Scanning
   - 3.3 Cart Management
   - 3.4 Real-Time Stock Checking
   - 3.5 Checkout Workflow
   - 3.6 Payment Workflow
   - 3.7 Payment Success Tracking
   - 3.8 Stock Deduction
   - 3.9 Batch Tracking
   - 3.10 Serial Number Tracking
   - 3.11 Financial / GL Flow
   - 3.12 Settlement (Session/Shift)
   - 3.13 Receipt Generation
   - 3.14 Returns & Refunds
   - 3.15 Audit Trail
   - 3.16 Multi-Counter / Multi-Device
   - 3.17 Layaway
4. [Sequence Diagram — Complete POS Sales Lifecycle](#4-sequence-diagram--complete-pos-sales-lifecycle)
5. [Risk Analysis](#5-risk-analysis)
6. [Stock Accuracy Analysis](#6-stock-accuracy-analysis)
7. [Financial Flow Analysis](#7-financial-flow-analysis)
8. [Accounting Impact Analysis](#8-accounting-impact-analysis)
9. [Missing Features List](#9-missing-features-list)
10. [Recommended Architecture](#10-recommended-architecture)
11. [Database Improvements](#11-database-improvements)
12. [Performance Improvements](#12-performance-improvements)
13. [Security Improvements](#13-security-improvements)
14. [POS Implementation Roadmap](#14-pos-implementation-roadmap)

---

## 1. Executive Summary

The BillBull POS module has a **functional core** — it can process a cash or card sale, auto-deliver stock via FEFO batch selection, and post correct IFRS 15 deferred-revenue GL entries within a single atomic transaction. However, there are **11 high-severity gaps** that create real financial, inventory, and compliance risk before this system can be called production-grade:

| Severity | Count | Examples |
|----------|-------|---------|
| **Critical** | 4 | Race-condition oversell, batch expiry bypass, no serial tracking, deposit unposted in layaway |
| **High** | 7 | No audit action log, no payment idempotency, voided lines leave no trace, no return reason codes |
| **Medium** | 12 | No thermal printer, no receipt archival, no supervisor approval for session close, no cost-centre allocation |
| **Low** | 8 | No loyalty/coupon layer, no offline mode, no device registration, no WhatsApp receipt |

The system is viable for a controlled single-counter rollout with manual oversight. Multi-counter or multi-branch live deployment without fixing the concurrency issues (§3.4, §3.16) is not recommended.

---

## 2. Current POS Architecture Overview

### 2.1 Tech Stack

```
Frontend (POSSales.jsx)
  ├── Cart state: React in-memory (ephemeral unless held)
  ├── Held sales: POST /api/pos/held-sales → pos_held_sales table
  ├── Checkout: POST /api/pos/checkout
  └── Session: POST/GET /api/pos/sessions/*

Backend (PosCheckoutController → chain)
  ├── SalesInvoiceService.save()          → sales_invoices
  ├── SalesInvoiceService.updateStatus()  → triggers all side effects
  │     ├── StockCheckService             → stock_movements aggregate
  │     ├── BatchSelectionService         → batch_allocations
  │     ├── DeliveryNoteService.create()  → delivery_notes
  │     ├── DeliveryNoteService.markDelivered() [FAST_SALE only]
  │     │     ├── StockMovementService.postOutboundStock() → stock_movements
  │     │     └── PostingEngineService (COGS + Revenue GL)
  │     └── PostingEngineService (SI journal: AR / Deferred Revenue / VAT)
  └── SalesInvoiceService.recordPayment()
        ├── PaymentService.savePayment()  → payments
        └── ReceiptVoucherService → PostingEngineService (RV journal: Cash / AR)
```

### 2.2 Two Sales Modes

| Mode | Delivery | Stock Deducted | GL COGS Posted |
|------|----------|----------------|----------------|
| **FAST_SALE** | Automatic at checkout | Immediately | Immediately |
| **WORKFLOW_DRIVEN** | Manual picker/dispatcher | When DN marked DELIVERED | When DN marked DELIVERED |

### 2.3 Key Entities

| Entity | Table | Purpose |
|--------|-------|---------|
| `PosSession` | `pos_sessions` | Shift/counter lifecycle, cash reconciliation |
| `SalesInvoice` | `sales_invoices` | Sales document (POS_SALE type) |
| `DeliveryNote` | `delivery_notes` | Stock dispatch document |
| `StockMovement` | `stock_movements` | Append-only inventory ledger |
| `BatchAllocation` | `batch_allocations` | Batch reservation (RESERVED → CONSUMED) |
| `PosHeldSale` | `pos_held_sales` | Parked carts (JSON blob) |
| `PosLayaway` | `pos_layaways` | Layaway orders with batch reservations |
| `PosCashMovement` | `pos_cash_movements` | Cash drop-in / drop-out within a session |
| `Payment` | `payments` | Settlement records |

---

## 3. Section-by-Section Gap Analysis

---

### 3.1 Product Search & Resolution

#### Current Behavior

Single endpoint: `GET /api/pos/resolve?q=<query>`

**Resolution order (first match wins):**
1. Exact barcode match (`product_barcodes` table)
2. Exact batch number match (`batch_master`) → pins batch on cart line
3. Product code / SKU (case-insensitive exact)
4. Customer code / mobile / phone / email (exact)
5. No match → `NONE` → frontend grid-filter fallback

**What IS validated at search time:** nothing. The resolve endpoint is a pure lookup.

**What is NOT validated:**
- Product `isActive` — inactive products match and can be added to cart
- Product branch availability — product may not be stocked at this branch
- Batch expiry — expired batches match and can be pinned
- Stock on hand — zero-stock products resolve and are added

#### ERP Standard

```
Scan / Type Query
      ↓
Resolve Product / Customer
      ↓
[GATE] Product isActive?         → No  → Block + alert
      ↓
[GATE] Product stocked here?     → No  → Block + alert
      ↓
[GATE] Batch expiry >= today?    → No  → Warn (configurable: block or warn)
      ↓
[GATE] Available qty > 0?        → No  → Warn (allow with override if permitted)
      ↓
Add to Cart
```

#### Gap Table

| Check | Current | Required | Severity |
|-------|---------|----------|----------|
| Product active status | ❌ Not checked | Block at resolve | High |
| Branch availability | ❌ Not checked | Block at resolve | High |
| Batch expiry at scan | ❌ Not checked | Warn/block configurable | Critical |
| Stock on hand at scan | ❌ Not checked | Warn (not block) | Medium |
| Duplicate scan → qty++ | ❌ Not confirmed | Increase qty, not duplicate line | Medium |

---

### 3.2 Barcode Scanning

#### Current Behavior

- Barcode typed or scanned into the unified search input
- `PosSearchService.resolve()` matches against `product_barcodes.barcode`
- If matched, returns `productId`, `productCode`, `name`, `pinnedBatchNumber = null`
- If scan matched a batch number directly, returns `pinnedBatchNumber = <scanned>`
- Frontend adds to cart with pinned batch locked

**What the scan does NOT do:**
- Does not lock the batch unit (only pins it on the cart line)
- Does not check if the batch is expired
- Does not check if the branch holds this product
- Does not check if the product is active

#### ERP Standard

```
Hardware Scanner / Keyboard Wedge → barcode string
         ↓
POST /api/pos/resolve?q=<barcode>
         ↓
         ├── Match product barcode
         │     └── Return: product, batch=null, checks pass
         ├── Match batch number
         │     └── Return: product, batch=<scanned>, expiry check, qty check
         └── No match → "Barcode not found" alert
         ↓
[GATE] Product active + branch stock + batch expiry
         ↓
Cart line added / qty incremented
```

#### Gaps

- No branch-level stock check at scan time (checked only at checkout)
- No expiry gate on batch scan — expired batch silently accepted
- No "already in cart" duplicate handling (frontend handles this manually)
- No hardware integration layer for HID scanners (relies on keyboard wedge)

---

### 3.3 Cart Management

#### Current Behavior

**Cart state location:** React component state (`POSSales.jsx`) — entirely in-browser memory.

- No server-side cart session
- Cart lost if browser tab closes (unless explicitly held)
- Multiple items allowed with quantity, unit price, discount, tax override, voiding

**Held Sales (Parked Cart):**
- `POST /api/pos/held-sales` → stores `cartJson` (full cart as JSON string) + metadata
- `GET /api/pos/held-sales?sessionId=...` → list all parked carts for session
- `DELETE /api/pos/held-sales/{id}` (soft-delete) → recall / dismiss

**Voiding a line:**
- Line flagged `voided: true` on the frontend
- Excluded from totals and batch allocation
- No reason recorded, no user attribution

**Price / discount editing:**
- Allowed freely on the frontend
- No permission gate at UI level (no check against user role before allowing edit)
- No audit record

#### ERP Standard

| Feature | Current | Required |
|---------|---------|----------|
| Server-side cart session | ❌ | Recommended for multi-device |
| Cart item audit log | ❌ | Every change: user, old value, new value, timestamp |
| Void reason + user | ❌ | Mandatory for returns tracing |
| Price override permission gate | ❌ | Role-based (Cashier cannot override; Supervisor can) |
| Bill-level discount | ✅ (billDiscountAmount) | — |
| Item-level discount | ✅ | — |
| Tax override | Partial (tax rate from product) | Per-line tax override with approval |
| Coupon / promotion | ❌ | Promotion engine |
| Loyalty points redemption | ❌ | Loyalty module |

---

### 3.4 Real-Time Stock Checking

#### Current Behavior

Stock is checked **once**, at status transition (`DRAFT → CONFIRMED/PAID`), inside the checkout transaction:

```java
// SalesInvoiceService.updateStatus()
if (salesSettings.isStockCheckEnabled()) {
    stockCheckService.validateStockAvailability(invoice);   // throws 400 if insufficient
}
```

**What the stock check does:**
- Aggregates `SUM(quantity) FROM stock_movements WHERE productId = ? AND warehouseId = ?`
- Compares against invoice line quantities
- Throws `400 Bad Request` if any line is short

**What it does NOT do:**
- Does not lock inventory rows during the check
- Does not account for concurrent reservations from other sessions
- Does not re-validate at payment confirmation (one check, one time)

#### Race Condition Scenario

```
Terminal A: checkout item X (qty=5)
Terminal B: checkout item X (qty=5)
Stock on hand: 7

T=0: A checks stock → 7 available ✅
T=1: B checks stock → 7 available ✅
T=2: A's @Transactional commits → stock_movements -5 inserted
T=3: B's @Transactional commits → stock_movements -5 inserted
     → 5+5 = 10 deducted from 7 available → OVERSELL
```

The `FOR UPDATE` lock in `getAvailableStockForUpdate()` is applied only inside `postOutboundStock()`, not at the stock-check gate. The window between check and deduction is unprotected.

#### ERP Standard

```
Pre-checkout stock re-validate (SELECT ... FOR UPDATE)
    ↓
Claim reservation (atomic decrement or row lock)
    ↓
Payment
    ↓
Deduction (within same transaction as reservation)
```

#### Gaps

| Issue | Severity |
|-------|----------|
| No SELECT FOR UPDATE at availability check | Critical |
| No soft-reserve between cart add and checkout | High |
| Stock check bypassed if `stockCheckEnabled = false` | High |
| No account for reserved-by-layaway in availability | High |

---

### 3.5 Checkout Workflow

#### Current Behavior (Exact Sequence)

```
POST /api/pos/checkout
    │
    ├─1─ buildInvoice()              — Build SalesInvoice entity from request (no validation)
    │
    ├─2─ invoiceService.save()       — Persist as DRAFT; generate invoice number; calculate totals
    │      └── auto-generate DN (if FAST_SALE)
    │
    ├─3─ Determine payment status    — PAID / PARTIALLY_PAID / CONFIRMED based on tendered amount
    │
    ├─4─ updateStatus()              — All side effects fire here:
    │      ├── stockCheckService.validate()
    │      ├── creditLimitService.check()
    │      ├── reservePinnedBatches()
    │      ├── ensureDirectInvoiceBatchSelections() [FAST_SALE only]
    │      ├── DeliveryNoteService.create()
    │      ├── DeliveryNoteService.markDelivered() [FAST_SALE only]
    │      │     ├── consumeAllocations()
    │      │     ├── postOutboundStock()          — stock_movements INSERT
    │      │     └── recognizeRevenue()           — GL: COGS + Revenue
    │      └── PostingEngineService (SI journal)  — GL: AR / Deferred / VAT
    │
    ├─5─ recordPayment()             — Payment row + Receipt Voucher + GL
    │
    └─6─ recordInvoiceOnSession()    — Session totals increment
```

**All within one `@Transactional` block.** Any exception in steps 1–6 rolls back everything.

#### ERP Standard vs Current

| Step | ERP Standard | Current | Gap |
|------|-------------|---------|-----|
| Stock re-validate with lock | Before invoice save | After invoice saved | Invoice number consumed even on stock fail |
| Draft invoice | Generate draft, confirm after payment | Save as DRAFT, confirm in same transaction | No two-phase draft-then-confirm from user perspective |
| Payment gateway auth | Async gateway call before finalize | No gateway (cash/card assumed successful) | No payment failure path |
| Invoice finalization | After payment confirmed | Simultaneous | Cannot retry payment without re-invoicing |
| Stock deduction | After finalized invoice | Same transaction as invoice | Correct for atomic operations |
| GL posting | After stock deduction | Correct order (via status transition) | ✅ |

---

### 3.6 Payment Workflow

#### Current Behavior

**Supported payment modes:**
- `Cash` — change calculated from `amountTendered - invoiceTotal`
- `Card` — requires `cardReference`, `cardType` fields
- `Credit` — no immediate payment, balance on customer account
- `Combined` / `Cash + Card` — split payment (one `paymentMode` string like "Cash + Card")

**Payment entity:**
```
payments:
  - paymentType: RECEIVED
  - paymentMode: "Cash" | "Card" | "Credit" | "Cash + Card" | etc.
  - referenceNumber: card terminal ref / cheque number
  - bankName
  - amount (BigDecimal)
  - status: COMPLETED | PARTIAL
```

**No payment gateway integration.** Card payments are recorded as "payment accepted" with a manual reference number. No authorization/capture cycle.

**Split payment:**
- Frontend sends a single `paymentMode = "Cash + Card"` string
- Backend parses the string to categorize for session totals
- Only one `Payment` row created (not one per payment leg)
- Split amounts not separately stored (e.g., "Cash 400, Card 600" is not individually tracked)

#### ERP Standard

```
Bill Total = 1,050 (including tax)

Payment Split:
  Cash  = 400   → Payment row 1 (Cash, 400)
  Card  = 650   → Payment row 2 (Card, 650, ref=TXN123)

Total Paid = 1,050 → status = PAID
```

Each split leg must:
- Be a separate `Payment` row
- Carry its own reference/gateway ID
- Allow independent reversal

#### Gaps

| Feature | Current | Required | Severity |
|---------|---------|----------|----------|
| Card authorization (gateway) | ❌ | Configurable gateway adapter | High |
| UPI / digital wallet | ❌ | Payment mode + reference | Medium |
| Split payment as separate rows | ❌ (one row) | One row per payment leg | High |
| Payment idempotency key | ❌ | Prevent double-charge on retry | Critical |
| Payment reversal record | ❌ | Separate REVERSED status + link | High |
| Payment failure tracking | ❌ | FAILED status, reason, retry count | High |
| Pending payment status | ❌ | PENDING → SUCCESS / FAILED lifecycle | High |

---

### 3.7 Payment Success Tracking

#### Current Behavior

Payment is immediately recorded as `COMPLETED`. There is no pending state, no gateway confirmation, no webhook listener.

```java
// PaymentService.savePayment()
payment.setStatus(PaymentStatus.COMPLETED);  // always, unconditionally
```

If a card terminal reports a failed transaction, the cashier must manually cancel the sale. There is no system-level failure capture.

#### ERP Standard Payment Table

```
payments:
  id, invoice_number, payment_method, amount
  gateway_reference, transaction_id
  status: PENDING | SUCCESS | FAILED | CANCELLED | REFUNDED
  gateway_response_code, gateway_response_message
  initiated_at, confirmed_at, failed_at
  retry_count, idempotency_key
```

#### Gaps

All gateway-tracking fields are absent. For cash POS this is acceptable; for card, UPI, or wallet this is a compliance and reconciliation risk.

---

### 3.8 Stock Deduction Workflow

#### Current Behavior

**When stock is deducted:**

| Mode | When Deducted |
|------|--------------|
| FAST_SALE | Immediately at checkout (within same transaction) |
| WORKFLOW_DRIVEN | When warehouse staff marks DN as DELIVERED |

**Deduction path:**
```
DeliveryNoteService.markDelivered()
    → BatchSelectionService.consumeAllocations()
        → for each BatchAllocation (status=RESERVED):
            allocation.status = CONSUMED
            StockMovementService.postOutboundStock()
                → INSERT stock_movements (
                    sourceType    = SALES_INVOICE,
                    productId,
                    warehouseId,
                    quantity      = -qty,     -- negative = outbound
                    batchNumber,
                    expiryDate,
                    cost          = WAC cost at time of deduction
                  )
                → UPDATE inventory_balances (available -= qty)
```

**Atomicity:** Yes. The entire DeliveryNote delivery is one `@Transactional`. If `postOutboundStock` fails for any batch line, all insertions in that call roll back.

**The Gap:** Between invoice save (step 2 of checkout) and stock deduction (step 4), the invoice number has been consumed and the invoice exists as DRAFT. If the JVM crashes between these steps, the invoice exists but stock was never deducted — a permanent mismatch. This window is milliseconds but non-zero.

#### ERP Standard

```
Checkout Transaction (atomic boundary)
    ├── Invoice save
    ├── Stock lock (FOR UPDATE)       ← currently absent
    ├── Deliver DN
    ├── INSERT stock_movements        ← happens here
    └── Commit
```

#### Gaps

| Issue | Current | Required | Severity |
|-------|---------|----------|----------|
| Lock before deduction | ❌ (no row lock at availability check) | SELECT FOR UPDATE on stock aggregate | Critical |
| Deduction before payment | No (deduction & payment in same TX) | Must be after payment confirmed | ✅ Correct |
| Partial deduction on line failure | Rolls back all | Rollback all ✅ | ✅ Correct |
| Stock deducted for voided lines | No (voided excluded) | ✅ Correct | ✅ Correct |
| Layaway stock deduction | Only at conversion checkout | Should deduct at conversion ✅ | ✅ Correct |

---

### 3.9 Batch Tracking Workflow

#### Current Behavior

**Batch selection lifecycle:**

```
Scan batch barcode
    → resolve() pins pinnedBatchNumber on cart line
            ↓
Checkout (updateStatus)
    → reservePinnedBatches()
        → BatchSelectionService.reserveScannedBatchForSalesInvoiceLine()
            → INSERT batch_allocations (status=RESERVED, method=MANUAL_SCANNED)
    → ensureDirectInvoiceBatchSelections() [if FAST_SALE, for non-pinned items]
        → autoReserveFefoForSalesInvoiceLine()
            → SELECT batches ORDER BY expiry_date ASC (FEFO)
            → INSERT batch_allocations (status=RESERVED, method=AUTO_FEFO)
            ↓
DeliveryNote.markDelivered()
    → consumeAllocations()
        → allocation.status = CONSUMED
        → postOutboundStock(batchNumber, expiryDate, qty)
```

**Batch data model:**
```
batch_master:
  batch_number (unique), product_id, product_code
  expiry_date, bin_id, warehouse_id

batch_allocations:
  source_line_id, source_type, source_doc_id
  batch_number, quantity
  status: RESERVED | CONSUMED | RELEASED
  allocation_method: MANUAL_SCANNED | AUTO_FEFO
```

**What works well:**
- FEFO auto-selection is correct (earliest expiry first)
- Pinned batch overrides FEFO (scanned batch respected)
- Batch release on DN cancellation (`releaseDeliveryNote()`)

**What is missing:**

| Check | Current | Required | Severity |
|-------|---------|----------|----------|
| Expiry check at reservation | ❌ | Reject batch if expiry < today (or < minExpiryDays) | Critical |
| minExpiryDaysForSale enforcement | ❌ | Block sale if batch expires within N days | High |
| Batch available qty check before reserve | Checked at stock level, not batch level | Need batch-level qty validation | High |
| Mandatory batch for batch-controlled products | ❌ (falls back to FEFO silently) | Require scan or explicit selection | Medium |
| Concurrent reservation conflict | ❌ | row-lock batch_master before reserving | Critical |
| Batch number printed on receipt | ❌ | For traceability | Medium |

---

### 3.10 Serial Number Tracking

#### Current Behavior

**Status: Not implemented.**

Evidence in `PosLookupService`:
```java
// Serial number concept is not implemented yet — batch-only for now.
```

No `serial_number` field exists in `batch_master`, `stock_movements`, or `batch_allocations`. The POS treats every unit of a batch interchangeably.

#### ERP Standard

```
serial_master:
  serial_number (unique), product_id, batch_number
  status: AVAILABLE | SOLD | RETURNED | DAMAGED | EXPIRED
  sold_invoice_id, sold_date
  warranty_expiry

On Sale:
  serial_master.status → SOLD
  serial_master.sold_invoice_id → invoice.id

On Return:
  serial_master.status → RETURNED (not AVAILABLE — needs inspection)

Cannot be sold again without status = AVAILABLE.
```

#### Gap

This is a complete missing feature. For serialized products (electronics, medical devices, appliances), this is a compliance and warranty-claim requirement.

---

### 3.11 Financial / GL Flow

#### Current Behavior

Four distinct GL posting events:

**Event 1 — Invoice Posting (SI journal):**
```
Dr  Accounts Receivable (1100)    invoiceTotal
    Cr  Deferred Revenue (2051)   subTotal – billDiscount
    Cr  VAT Output Tax (2100)     taxTotal
```

**Event 2 — Payment Receipt (RV journal):**
```
Dr  Cash in Hand (1001)  [or Bank 1010 for card]   paymentAmount
    Cr  Accounts Receivable (1100)                  paymentAmount
```

**Event 3 — COGS & Revenue Recognition (DN journal, at delivery):**
```
Dr  COGS (5001)                   totalCost (WAC)
    Cr  Inventory (1200)          totalCost

Dr  Deferred Revenue (2051)       recognizedRevenue
    Cr  Sales Revenue (4001)      recognizedRevenue
```

**Event 4 — Cash Movement:**
```
Drop-In:   Dr Cash (1001) / Cr Petty Cash (1012)
Drop-Out:  Dr Expense (6099) / Cr Cash (1001)
```

**IFRS 15 compliance:** The deferred-revenue model is correct. Revenue is not recognized until delivery, matching the performance obligation.

**What works well:**
- Full double-entry for every transaction
- COGS uses actual WAC cost at time of delivery
- Idempotency check (duplicate posting blocked by reference key)
- VAT isolated on output tax account

#### Gaps

| Feature | Current | Required | Severity |
|---------|---------|----------|----------|
| Cost centre / branch allocation on GL lines | ❌ | Each line needs dimension (branch, outlet) | High |
| Multi-currency | ❌ (AED only) | Exchange rate on transaction | Medium |
| GL posting approval for large transactions | ❌ | Maker-checker above threshold | Medium |
| Reversal entry on invoice cancellation | Partial | Full reversal with reference to original | High |
| Cash movement to correct expense code | Only 6099 | Configurable per movement type | Medium |
| Day-end GL close / lock period | ❌ | Period lock after Z-report | High |

---

### 3.12 Settlement (Session / Shift)

#### Current Behavior

**Session open:**
```
POST /api/pos/sessions/open
  → { terminalId, counterName, openingCash }
  → Creates PosSession (status=OPEN)
  → Idempotent: returns existing if already OPEN
```

**During session:**
- Each checkout calls `recordInvoiceOnSession()` → increments totalCashSales / totalCardSales / etc.
- Cash Drop-In / Drop-Out recorded as `PosCashMovement`, GL posted immediately

**Session close:**
```
POST /api/pos/sessions/{id}/close
  → { closingCash, notes }
  → expectedCash = openingCash + totalCashSales + dropIns - dropOuts
  → cashDifference = closingCash - expectedCash
  → status = CLOSED
```

**Reports:**
- **X-Report** (real-time mid-shift): `GET /api/pos/sessions/{id}/x-report` — not persisted
- **Z-Report** (daily): aggregates all sessions for branch on date — not persisted
- Report data computed on-the-fly from invoices; no snapshot stored

#### ERP Standard

```
Cashier Login
    ↓
Open Session (declare opening float)
    ↓
Sales Transactions (auto-tracked)
    ↓
[Optional X-Report for mid-shift check]
    ↓
End-of-Shift Count (physical cash count by cashier)
    ↓
Supervisor Reviews (approve or flag variance)
    ↓
Z-Report Locked & Archived
    ↓
Cash Deposited to Safe / Bank
    ↓
Session Closed (GL: Dr Safe / Cr POS Cash)
```

#### Gaps

| Feature | Current | Required | Severity |
|---------|---------|----------|----------|
| Supervisor approval to close session | ❌ | Required when variance > threshold | High |
| Variance threshold alert | ❌ | Auto-flag if |cashDifference| > N | High |
| Z-Report persistence (snapshot) | ❌ | Immutable record after close | High |
| Period lock after Z-report | ❌ | Prevent backdated sales after close | High |
| Cash deposit GL entry at session close | ❌ | Dr Safe / Cr POS Cash | Medium |
| Denomination-level cash count | ❌ | Count by note/coin to derive total | Medium |
| Multiple cashier handoffs in one session | ❌ | Shift handover tracking | Low |

---

### 3.13 Receipt Generation

#### Current Behavior

- Receipt rendered client-side as HTML (POSSales.jsx `generateDocumentPrintHtml()`)
- Sent to browser print dialog (`window.print()`)
- PDF via `downloadPdfViaServer()` — server renders HTML to PDF (Puppeteer/similar)
- No thermal printer integration (relies on external print server or OS driver)

**Receipt fields present:**
- Invoice number, date, time, branch, cashier, terminal
- Line items (code, name, qty, unit, price, discount, net)
- Tax breakdown, totals
- Payment mode, amount tendered, change

**Receipt fields absent:**
- Batch numbers (not printed)
- Serial numbers (not implemented)
- QR code / barcode on receipt
- Return policy statement
- Loyalty points earned/balance
- Transaction ID / gateway reference

#### Gaps

| Feature | Current | Required | Severity |
|---------|---------|----------|----------|
| Receipt archival (stored copy) | ❌ | Store receipt HTML/PDF linked to invoice | High |
| Receipt reprint from history | ❌ | `GET /api/pos/invoices/{id}/receipt` | Medium |
| Thermal printer integration | ❌ | ESC/POS or print service | Medium |
| QR code (invoice ref) | ❌ | UAE e-invoicing requirement | High |
| Batch number on receipt | ❌ | Required for batch-tracked goods | Medium |
| Email receipt | ❌ | Send to customer email | Low |
| WhatsApp receipt | ❌ | Send via WhatsApp Business API | Low |

---

### 3.14 Returns & Refund Workflow

#### Current Behavior

**Return initiation at POS:**
- `GET /api/pos/checkout/invoices/lookup?number=INV-...` → find original invoice
- `POST /api/sales-returns` → create SalesReturn document (not POS-specific)

**Return process:**
1. Create `SalesReturn` with link to original `SalesInvoice`
2. Select items and quantities to return
3. Confirm return → reverse stock movement (positive qty to stock_movements)
4. GL reversal: Dr Sales Returns (4002) / Cr AR (1100)
5. Refund: new Payment row with negative amount or credit to customer

**What works:**
- Stock correctly reversed via positive stock_movement
- GL reversed

**What is missing:**

| Feature | Current | Required | Severity |
|---------|---------|----------|----------|
| Return reason codes | ❌ | Defective / Wrong Item / Change of Mind / etc. | High |
| Return approval workflow | ❌ | Supervisor approve above AED threshold | High |
| Batch reconciliation | ❌ | Returned batch must match sold batch | High |
| Serial reconciliation | ❌ | Serial must match sold serial | N/A (serials not implemented) |
| Partial return | Partial | Line-level partial qty | Medium |
| Refund method enforcement | ❌ | Refund to original payment method | High |
| Return within N days | ❌ | Block if return window expired | Medium |
| Return receipt | ❌ | Printed return document with reference | Medium |

---

### 3.15 Audit Trail

#### Current Behavior

Audit is implicit through entity timestamps:
- `createdAt`, `createdBy`, `updatedAt`, `updatedBy` via `BaseEntity` + `@EnableJpaAuditing`
- No dedicated audit table
- No action log

**What IS recorded:**
- Who created/last-modified each entity
- Session open/close timestamps and user
- GL journal creation

**What IS NOT recorded:**
- Item-level modifications in cart (price change, discount change, qty change)
- Who voided a cart line (only `voided = true` flag, no user/timestamp)
- Failed stock checks (exception thrown, not persisted)
- Failed credit limit checks
- Soft-delete history (only `isActive = false`)
- Receipt reprint events
- Session X-report requests
- Who recalled a held sale

#### ERP Standard Audit Log

```
pos_audit_log:
  id, branch_id, terminal_id, session_id
  user_id, user_name
  action_type: ITEM_ADDED | ITEM_REMOVED | ITEM_VOIDED | QTY_CHANGED |
               PRICE_OVERRIDDEN | DISCOUNT_APPLIED | PAYMENT_ATTEMPTED |
               PAYMENT_FAILED | PAYMENT_SUCCESS | INVOICE_CANCELLED |
               RECEIPT_REPRINTED | SESSION_OPENED | SESSION_CLOSED |
               CASH_DROP | SUPERVISOR_OVERRIDE | RETURN_INITIATED | ...
  entity_type, entity_id
  old_value (JSON), new_value (JSON)
  timestamp
  notes
```

#### Gaps

| Area | Current | Required | Severity |
|------|---------|----------|----------|
| Dedicated audit table | ❌ | See above schema | High |
| Cart modification log | ❌ | Every change per line | High |
| Void attribution | ❌ | User + reason + timestamp | High |
| Failed-check log | ❌ | Persist failed validation attempts | Medium |
| Supervisor override log | ❌ | When supervisor permits below-cost sale | High |
| Receipt reprint log | ❌ | Fraud detection | Medium |

---

### 3.16 Multi-Counter & Multi-Device

#### Current Behavior

- Each terminal identified by `terminalId` (string, from request)
- Session opened per terminal (no unique constraint enforced in DB)
- No device registration table
- No concept of counter assignment or branch-counter relationship

**Concurrency in the DB:**

```
pos_sessions: no UNIQUE constraint on (branch_id, terminal_id, status='OPEN')
```

Two simultaneous requests to open a session for the same terminal will both succeed, creating two OPEN sessions — the second `getActivePosSession()` call returns the first one found, effectively ignoring the second. But both exist in the DB and both accumulate invoice totals independently.

**No offline mode** — POS is entirely online-only. Network disconnect stops the system.

#### ERP Standard

```
devices:
  id, device_code, device_name
  branch_id, counter_id
  status: ACTIVE | INACTIVE | BLOCKED
  last_heartbeat

pos_counters:
  id, counter_name, branch_id
  current_session_id, status: OPEN | CLOSED

Unique constraint: ONE open session per terminal at any time.
Heartbeat from device every 30s; if missed 3x, auto-close session.
```

#### Gaps

| Feature | Current | Required | Severity |
|---------|---------|----------|----------|
| Device registration | ❌ | Device must be registered before use | High |
| Unique OPEN session per terminal | ❌ (no DB constraint) | UNIQUE(terminal_id, status='OPEN') | High |
| Counter assignment | ❌ | Session tied to physical counter | Medium |
| Offline POS mode | ❌ | Queue transactions locally, sync on reconnect | Medium |
| Device heartbeat / auto-close | ❌ | Detect abandoned sessions | Low |
| Real-time inventory locking across terminals | ❌ | SELECT FOR UPDATE at reservation | Critical |

---

### 3.17 Layaway

#### Current Behavior

Documented in §2.3. Key points:

- Batch reservations are created at layaway save (batches locked for layaway)
- Deposit amount stored but not posted to GL (financial deferred)
- Due date tracked; expired status computed at read time but not persisted
- Conversion creates a new POS invoice from layaway items

#### Gaps

| Feature | Current | Required | Severity |
|---------|---------|----------|----------|
| Deposit GL posting (Dr Cash / Cr Customer Advance) | ❌ | Post deposit on receipt | Critical |
| Partial payment history | ❌ | Multiple deposit rows linked to layaway | High |
| Due date extension with approval | ❌ | Extend + log who approved | Medium |
| Expiry auto-close (batch job) | ❌ | Scheduled job to cancel + release | Medium |
| Layaway receipt | ❌ | Print deposit receipt at creation | Medium |

---

## 4. Sequence Diagram — Complete POS Sales Lifecycle

```
CUSTOMER       CASHIER         POS Frontend       POS Backend                     DB / GL
    |               |                |                  |                              |
    |── arrives ──▶|                |                  |                              |
    |               |── open session|                  |                              |
    |               |               |──POST /sessions/open──▶                         |
    |               |               |                  |── INSERT pos_sessions ──────▶|
    |               |               |◀── session data ─|                              |
    |               |               |                  |                              |
    |── selects ──▶|                |                  |                              |
    | products      |── scan ──────▶|                  |                              |
    |               |               |──GET /pos/resolve?q=<barcode>──▶                |
    |               |               |                  |── SELECT product_barcodes ──▶|
    |               |               |                  |── SELECT batch_master ──────▶|
    |               |               |◀── resolve result|                              |
    |               |               |                  |                              |
    |               |               | [add to cart]    |                              |
    |               |               | [repeat per item]|                              |
    |               |               |                  |                              |
    |               |── checkout ──▶|                  |                              |
    |               |               |──POST /pos/checkout──▶                          |
    |               |               |                  |── buildInvoice()             |
    |               |               |                  |── INSERT sales_invoices ────▶|
    |               |               |                  |   (status=DRAFT)             |
    |               |               |                  |                              |
    |               |               |                  |── stockCheckService.validate()|
    |               |               |                  |── SELECT stock_movements ───▶|
    |               |               |                  |                              |
    |               |               |                  |── reservePinnedBatches()     |
    |               |               |                  |── INSERT batch_allocations ─▶|
    |               |               |                  |   (RESERVED, MANUAL_SCANNED) |
    |               |               |                  |                              |
    |               |               |                  |── ensureFefoSelections()     |
    |               |               |                  |── INSERT batch_allocations ─▶|
    |               |               |                  |   (RESERVED, AUTO_FEFO)      |
    |               |               |                  |                              |
    |               |               |                  |── DeliveryNoteService.create()|
    |               |               |                  |── INSERT delivery_notes ────▶|
    |               |               |                  |                              |
    |               |               |                  | [FAST_SALE only]             |
    |               |               |                  |── markDelivered()            |
    |               |               |                  |── consumeAllocations() ─────▶|
    |               |               |                  |   batch_allocations→CONSUMED |
    |               |               |                  |── INSERT stock_movements ───▶|
    |               |               |                  |   (qty negative, SALES_INV)  |
    |               |               |                  |── UPDATE inventory_balances ▶|
    |               |               |                  |                              |
    |               |               |                  |── PostingEngine (SI journal) |
    |               |               |                  |── INSERT journal_entries ───▶|
    |               |               |                  |   Dr AR / Cr DeferredRev / VAT|
    |               |               |                  |                              |
    |               |               |                  |── PostingEngine (DN journal) |
    |               |               |                  |── INSERT journal_entries ───▶|
    |               |               |                  |   Dr COGS/Cr Inventory       |
    |               |               |                  |   Dr DeferredRev/Cr Revenue  |
    |               |               |                  |                              |
    |── pays ──────▶|               |                  |                              |
    |  (cash/card)  |── enter ─────▶|                  |                              |
    |               |  payment      |──recordPayment()──▶                             |
    |               |               |                  |── INSERT payments ──────────▶|
    |               |               |                  |── ReceiptVoucherService      |
    |               |               |                  |── INSERT journal_entries ───▶|
    |               |               |                  |   Dr Cash / Cr AR            |
    |               |               |                  |── recordInvoiceOnSession()   |
    |               |               |                  |── UPDATE pos_sessions ──────▶|
    |               |               |◀── invoice data ─|                              |
    |               |               |                  |                              |
    |               |── print ─────▶|                  |                              |
    |◀─ receipt ────|               | generateHtml()   |                              |
    |               |               | window.print()   |                              |
    |               |               |                  |                              |
```

---

## 5. Risk Analysis

### Risk Matrix

| Risk | Probability | Impact | Current Mitigation | Recommended Fix |
|------|------------|--------|--------------------|-----------------|
| **Oversell from race condition** | High (multi-terminal) | Critical | None | SELECT FOR UPDATE at reservation |
| **Expired batch sold** | High | High (compliance) | None | Expiry gate at scan + reservation |
| **Duplicate payment charge** | Medium | Critical | None | Idempotency key on checkout |
| **Layaway deposit not in books** | Certain | High (audit) | None | GL post deposit |
| **Session variance not investigated** | High | High (fraud) | cashDifference field | Supervisor approval gate |
| **Voided line untraced** | High | High (audit) | None | Audit log with user + reason |
| **Invoice exists without stock deduction** (JVM crash mid-TX) | Low | High | @Transactional rollback | Outbox pattern |
| **Two sessions on same terminal** | Medium | High (reporting) | None | DB UNIQUE constraint |
| **Price override unlogged** | High | High (fraud) | None | Audit log + permission gate |
| **Return of wrong batch** | Medium | High (traceability) | None | Validate return batch against sold batch |

---

## 6. Stock Accuracy Analysis

### Current Stock Flow

```
Stock On Hand = SUM(stock_movements.quantity) WHERE product_id = X AND warehouse_id = Y

Outbound deduction sources:
  - POS FAST_SALE   → DeliveryNoteService.markDelivered() → postOutboundStock()
  - Sales DN        → same path
  - Stock-take adj  → StockTakeService

Reserved-but-not-deducted:
  - batch_allocations (status=RESERVED) → not subtracted from stock_movements
  - Available formula does NOT subtract reserved qty
```

**Critical gap:** The available stock check does NOT subtract:
1. Quantities reserved by other in-flight checkouts (batch_allocations RESERVED)
2. Quantities reserved by layaways (PosLayaway batch reservations)

**Available Stock Formula (current):**
```
Available = SUM(stock_movements.quantity) for product + warehouse
```

**Available Stock Formula (required):**
```
Available = SUM(stock_movements.quantity)
          - SUM(batch_allocations.quantity WHERE status=RESERVED AND source_type=SALES_INVOICE)
          - SUM(batch_allocations.quantity WHERE status=RESERVED AND source_type=LAYAWAY)
```

Until this formula is corrected, the stock check can approve multiple concurrent sales that collectively exceed on-hand stock.

---

## 7. Financial Flow Analysis

### Complete POS Financial Flow

```
FAST_SALE Transaction: Bill = AED 1,050 (1,000 goods + 50 VAT), WAC cost = AED 650

Step 1 — Invoice Posted (SI journal):
  Dr  AR (1100)           1,050
      Cr Deferred Rev (2051)  1,000
      Cr VAT Output (2100)       50

Step 2 — Payment Received (RV journal):
  Dr  Cash (1001)         1,050
      Cr AR (1100)            1,050

Step 3 — Goods Delivered (DN journal):
  Dr  COGS (5001)           650
      Cr Inventory (1200)     650

  Dr  Deferred Rev (2051)  1,000
      Cr Sales Revenue (4001) 1,000

Net GL Position After Sale:
  Cash          +1,050
  Inventory       -650
  Sales Revenue +1,000
  COGS            +650  (expense)
  VAT Output Tax   +50  (liability)
  AR               0   (debited then cleared)
  Deferred Rev     0   (debited then cleared)

Gross Profit = 1,000 - 650 = 350  ✅
```

**This is correct double-entry accounting.**

### Financial Flow Gaps

| Gap | Financial Risk |
|-----|---------------|
| Layaway deposit not posted | Liability understated (customer paid but not in books) |
| Cash movement only debits 6099 (generic expense) | Expense misclassification |
| No period lock after Z-report | Backdated transactions alter closed-period financials |
| No branch-level P&L dimension | Cannot report branch-level profitability |
| Split payment amounts not tracked individually | Cash/card reconciliation impossible |
| Card payment → Dr Cash (1001), not Bank (1010) | Cash balance inflated (card settlement pending) |

---

## 8. Accounting Impact Analysis

### 8.1 Card Payment Account Misclassification

**Current:** Card payments → `Dr Cash in Hand (1001)`  
**Required:** Card payments → `Dr Card Receivable / Merchant Settlement (1015)`

Card proceeds arrive in the bank 1–3 days after the sale. Posting directly to Cash overstates cash on hand and understates the "pending card settlement" receivable.

**Corrected Card Payment Journal:**
```
Day of sale:
  Dr  Merchant Settlement Receivable (1015)   amount
      Cr AR (1100)                            amount

Bank settlement day (from bank statement import):
  Dr  Bank (1010)                             amount net of fees
  Dr  Merchant Fees (6090)                    fees
      Cr Merchant Settlement Receivable (1015) gross
```

### 8.2 Deferred Revenue Timing

The IFRS 15 deferred revenue model is correct for WORKFLOW_DRIVEN mode. For FAST_SALE, the DN is immediately delivered in the same transaction, so Step 1 (deferred) and Step 3 (recognition) occur in the same atomic block — net effect is the same as direct revenue recognition. This is acceptable.

### 8.3 Missing Cost Centre Dimension

No GL line carries a branch or cost-centre dimension. Multi-branch deployment makes P&L reporting impossible without a dimension field on `journal_entry_lines`.

**Required:**
```
journal_entry_lines:
  + branch_id (FK to branches)
  + cost_centre_code (VARCHAR)
  + project_code (VARCHAR, nullable)
```

---

## 9. Missing Features List

### Critical (Block Go-Live for Serious Use)
- [ ] `SELECT FOR UPDATE` at batch/stock reservation to prevent oversell
- [ ] Expired batch gate at scan and reservation
- [ ] Payment idempotency key (prevent duplicate charge on network retry)
- [ ] Layaway deposit GL posting (Dr Cash / Cr Customer Advance Liability)
- [ ] Unique DB constraint: one OPEN session per terminal

### High Priority (Fix Before Multi-Counter Deployment)
- [ ] Dedicated `pos_audit_log` table with action-level entries
- [ ] Void attribution (user + reason + timestamp on voided line)
- [ ] Price override permission gate (role-based; supervisor required)
- [ ] Split payment as separate Payment rows (one per leg)
- [ ] Return batch validation (returned batch must match sold batch)
- [ ] Return reason codes
- [ ] Supervisor approval gate for session close with variance > threshold
- [ ] Z-Report persistence (immutable snapshot on close)
- [ ] Period lock after Z-report (prevent backdated POS sales)
- [ ] Card payment to Merchant Settlement Receivable (not Cash)
- [ ] Available stock formula to subtract reserved quantities
- [ ] Branch / cost-centre dimension on GL journal lines
- [ ] Return approval workflow above AED threshold
- [ ] Device registration table with ACTIVE/INACTIVE status

### Medium Priority (Complete ERP Parity)
- [ ] Serial number tracking (serial_master, AVAILABLE → SOLD lifecycle)
- [ ] Receipt archival (store printed receipt linked to invoice)
- [ ] Receipt reprint endpoint with reprint log
- [ ] QR code on receipt (UAE e-invoicing FTA requirement)
- [ ] Batch number printed on receipt
- [ ] Denomination-level cash count at session close
- [ ] Cash deposit GL entry at session close (Dr Safe / Cr POS Cash)
- [ ] Layaway partial payment history (multiple deposit rows)
- [ ] Layaway expiry batch job (auto-cancel + release)
- [ ] Email receipt
- [ ] Thermal printer integration (ESC/POS or print service)
- [ ] Return within N days enforcement
- [ ] minExpiryDaysForSale enforcement in FEFO selection

### Low Priority (Enhancement)
- [ ] Promotion / coupon engine
- [ ] Loyalty points earn and redeem
- [ ] Offline POS mode (queue + sync)
- [ ] Device heartbeat / auto-close abandoned sessions
- [ ] WhatsApp receipt
- [ ] Denomination calculator UI for cash counting
- [ ] Multi-cashier handover in one session
- [ ] UPI / digital wallet payment mode

---

## 10. Recommended Architecture

### 10.1 Inventory Reservation State Machine

Introduce a `InventoryReservation` concept distinct from `BatchAllocation`:

```
states:
  NONE → SOFT_RESERVED (cart item added, no lock)
       → HARD_RESERVED (checkout initiated, row locked)
       → CONSUMED       (DN delivered, stock deducted)
       → RELEASED       (sale cancelled or cart abandoned)

Transitions:
  Add to cart        → SOFT_RESERVED (optimistic, no lock)
  Checkout POST      → HARD_RESERVED (SELECT FOR UPDATE on batch_master)
  DN delivered       → CONSUMED
  Invoice cancelled  → RELEASED
  Session timeout    → RELEASED (batch job)
```

### 10.2 Payment State Machine

```
INITIATED → PENDING_AUTHORIZATION → AUTHORIZED → CAPTURED → SETTLED
                                  → DECLINED
                                  → EXPIRED
                 CAPTURED → REFUNDED (partial or full)
```

### 10.3 Audit Log Architecture

```java
@Entity
public class PosAuditLog extends BaseEntity {
    String sessionId, terminalId, branchId;
    String userId, userName;
    PosAction action;   // enum: ITEM_ADDED, PRICE_OVERRIDDEN, ...
    String entityType, entityId;
    String oldValueJson, newValueJson;
    String notes;
    // inherited: createdAt, createdBy
}
```

Write audit entries asynchronously via `@Async` (fire-and-forget, non-transactional) so audit failures never block checkout.

### 10.4 Checkout Transaction Boundary (Recommended)

```
@Transactional
checkout():
    1. SELECT FOR UPDATE on batch_master rows needed           ← new
    2. Validate stock (with lock held)                        ← promoted
    3. Validate batch expiry                                  ← new
    4. INSERT sales_invoice (DRAFT)
    5. INSERT batch_allocations (HARD_RESERVED)
    6. INSERT delivery_note (DRAFT)
    7. [FAST_SALE] deliver DN: consume allocations + stock movement + GL
    8. [WORKFLOW_DRIVEN] DN stays DRAFT
    9. Post SI journal (AR / Deferred / VAT)
   10. Record Payment
   11. Post RV journal (Cash/Card / AR)
   12. Update session totals
   13. Commit — release locks
```

---

## 11. Database Improvements

### 11.1 Missing Constraints

```sql
-- Prevent two OPEN sessions on same terminal
ALTER TABLE pos_sessions
  ADD CONSTRAINT uq_terminal_open_session
  UNIQUE (terminal_id, status)
  WHERE status = 'OPEN';

-- Prevent double-allocation of same batch unit
ALTER TABLE batch_allocations
  ADD CONSTRAINT uq_batch_unit_active
  UNIQUE (batch_number, quantity_unit_index)
  WHERE status IN ('RESERVED', 'CONSUMED');
```

### 11.2 Missing Indexes

```sql
-- Batch expiry filter (used by FEFO selector)
CREATE INDEX idx_batch_master_expiry_product
  ON batch_master (product_id, expiry_date ASC)
  WHERE expiry_date IS NOT NULL;

-- Session lookup (called on every checkout)
CREATE INDEX idx_pos_sessions_terminal_status
  ON pos_sessions (terminal_id, status);

-- Audit log queries (by session, by user, by action)
CREATE INDEX idx_pos_audit_session   ON pos_audit_log (session_id, created_at DESC);
CREATE INDEX idx_pos_audit_user      ON pos_audit_log (user_id, created_at DESC);
CREATE INDEX idx_pos_audit_entity    ON pos_audit_log (entity_type, entity_id);
```

### 11.3 New Tables

```sql
-- Device registration
CREATE TABLE pos_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_code VARCHAR(50) UNIQUE NOT NULL,
  device_name VARCHAR(100),
  branch_id UUID REFERENCES branches(id),
  status VARCHAR(20) DEFAULT 'ACTIVE',  -- ACTIVE | INACTIVE | BLOCKED
  last_heartbeat TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by VARCHAR(100)
);

-- Audit log
CREATE TABLE pos_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id VARCHAR(100),
  terminal_id VARCHAR(100),
  branch_id UUID,
  user_id VARCHAR(100),
  user_name VARCHAR(200),
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100),
  entity_id VARCHAR(200),
  old_value JSONB,
  new_value JSONB,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Serial master (for serialized products)
CREATE TABLE serial_master (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  serial_number VARCHAR(200) UNIQUE NOT NULL,
  product_id UUID REFERENCES products(id),
  batch_number VARCHAR(200),
  status VARCHAR(30) DEFAULT 'AVAILABLE',  -- AVAILABLE | SOLD | RETURNED | DAMAGED
  sold_invoice_id UUID,
  sold_date DATE,
  returned_date DATE,
  warranty_expiry DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Layaway payment history
CREATE TABLE pos_layaway_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  layaway_id UUID REFERENCES pos_layaways(id),
  payment_date DATE NOT NULL,
  amount NUMERIC(18,2) NOT NULL,
  payment_mode VARCHAR(50),
  reference_number VARCHAR(200),
  received_by VARCHAR(100),
  journal_entry_id UUID,   -- link to GL posting
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 11.4 Schema Changes

```sql
-- Add cost centre to journal entry lines
ALTER TABLE journal_entry_lines
  ADD COLUMN branch_id UUID,
  ADD COLUMN cost_centre_code VARCHAR(50);

-- Add idempotency key to payments (prevent double-charge)
ALTER TABLE payments
  ADD COLUMN idempotency_key VARCHAR(200) UNIQUE;

-- Add return reason to sales_return items
ALTER TABLE sales_return_items
  ADD COLUMN return_reason VARCHAR(100),
  ADD COLUMN return_reason_notes TEXT;

-- Add card-specific fields to payments
ALTER TABLE payments
  ADD COLUMN gateway_reference VARCHAR(200),
  ADD COLUMN gateway_status VARCHAR(50),
  ADD COLUMN gateway_response_code VARCHAR(20),
  ADD COLUMN settled_to_account_id UUID;
```

---

## 12. Performance Improvements

### 12.1 N+1 Queries in Checkout

Current `buildInvoice()` fetches product details per line item in a loop. For a 20-item cart this is 20 separate selects.

**Fix:** Batch-fetch all product IDs upfront:
```java
List<String> productCodes = request.getItems().stream()
    .map(PosCheckoutRequest.Item::getProductCode)
    .collect(Collectors.toList());
Map<String, Product> products = productRepository
    .findAllByProductCodeIn(productCodes)
    .stream()
    .collect(Collectors.toMap(Product::getProductCode, p -> p));
```

### 12.2 Stock Check Query

The stock availability check runs one `SUM(quantity)` aggregate per invoice line — another N query loop. Batch into a single group-by query:

```sql
SELECT product_id, warehouse_id, SUM(quantity) AS on_hand
FROM stock_movements
WHERE product_id IN (:productIds)
  AND warehouse_id = :warehouseId
GROUP BY product_id, warehouse_id
```

### 12.3 FEFO Batch Selection

`autoReserveFefoForSalesInvoiceLine()` runs a query per line. Batch across all lines requiring FEFO selection.

### 12.4 Session Totals

`recordInvoiceOnSession()` does a `SELECT + UPDATE` on `pos_sessions`. Under high volume this is a hot-row contention point.

**Fix:** Use `UPDATE pos_sessions SET total_cash_sales = total_cash_sales + ? WHERE id = ?` instead of load-then-save. Avoids optimistic lock conflicts.

### 12.5 Held Sale JSON Size

Storing the full cart as a JSON blob in `pos_held_sales.cartJson` can grow large (many items, nested data). Add a `compressed` flag and compress large blobs (GZIP + Base64).

---

## 13. Security Improvements

### 13.1 Price Override Without Permission Check

**Current:** Any cashier can change the unit price of any cart line on the frontend. No backend validation rejects a below-cost or zero price.

**Required:**
```java
// In buildInvoice():
if (item.getUnitPrice().compareTo(product.getCostPrice()) < 0) {
    permissionService.requirePermission(currentUser, Permission.POS_OVERRIDE_BELOW_COST);
}
if (item.getUnitPrice().compareTo(product.getSellingPrice()) < 0) {
    permissionService.requirePermission(currentUser, Permission.POS_PRICE_OVERRIDE);
}
```

### 13.2 Void Line Without Attribution

Any cashier can void any line silently. A malicious cashier can void a line, pocket the payment, and the system has no record.

**Required:** Voiding requires:
- A reason code (mandatory)
- Supervisor PIN for voids above AED threshold
- Entry in `pos_audit_log`

### 13.3 Session Close Without Supervisor

A cashier can close their own session, including sessions with large cash variances. Supervisor sign-off is not enforced.

### 13.4 Held Sale Access Control

Any terminal in the same session can recall any held sale. If a terminal is shared among cashiers, cashier B can recall and checkout cashier A's held sale.

**Required:** Held sale recall restricted to: same `createdBy` OR supervisor role.

### 13.5 Invoice Lookup for Returns

`GET /api/pos/checkout/invoices/lookup` has no `@PreAuthorize` — any authenticated user can look up any invoice by number. Should restrict to SALES_RETURN permission.

### 13.6 Terminal ID From Request

`terminalId` is passed by the client in every request and trusted as-is. A tampered client can impersonate any terminal.

**Required:** Terminal ID must come from a registered device token (JWT claim or device certificate), not from a request parameter.

---

## 14. POS Implementation Roadmap

### Phase 1 — Safety Fixes (Before Any Live Traffic)
**Target: 2 weeks**

| # | Task | File / Area |
|---|------|-------------|
| 1.1 | Add UNIQUE constraint on `(terminal_id, status='OPEN')` in `pos_sessions` | DB migration |
| 1.2 | Add `SELECT FOR UPDATE` at batch reservation in `BatchSelectionService` | `BatchSelectionService.java` |
| 1.3 | Add expiry gate in `reserveScannedBatchForSalesInvoiceLine()` | `BatchSelectionService.java` |
| 1.4 | Subtract `batch_allocations (RESERVED)` from available-stock formula | `StockMovementRepository.java` |
| 1.5 | Add idempotency key to `payments` table + check before recording | `PaymentService.java` |
| 1.6 | Post layaway deposit to GL on create | `PosLayawayService.java` + `PostingEngineService.java` |
| 1.7 | Add `@PreAuthorize` on invoice lookup for returns | `PosCheckoutController.java` |

### Phase 2 — Audit & Compliance (Before Multi-Counter Deployment)
**Target: 3 weeks**

| # | Task | File / Area |
|---|------|-------------|
| 2.1 | Create `pos_audit_log` table + `PosAuditLog` entity | New entity + migration |
| 2.2 | Log: item add/remove/void, qty change, price change, payment attempt/fail | `PosAuditService.java` (new) |
| 2.3 | Void attribution: require reason code + record user + timestamp | `PosCheckoutController.java` |
| 2.4 | Price override permission gate on backend | `SalesInvoiceService.java` |
| 2.5 | Persist Z-Report snapshot on session close | `PosSessionService.java` |
| 2.6 | Supervisor approval gate on session close with variance | `PosSessionService.java` |
| 2.7 | Add `pos_devices` table + device authentication | New entity + `SecurityConfig.java` |
| 2.8 | Return batch validation (returned batch = sold batch) | `SalesReturnService.java` |
| 2.9 | Return reason codes on `sales_return_items` | Entity + migration |

### Phase 3 — Payment & Accounting Hardening
**Target: 3 weeks**

| # | Task | File / Area |
|---|------|-------------|
| 3.1 | Split payment: one `Payment` row per leg | `PosCheckoutController.java` + `PaymentService.java` |
| 3.2 | Card payment → Merchant Settlement Receivable (1015) | `PostingEngineService.java` + COA |
| 3.3 | Add `branch_id` + `cost_centre_code` to `journal_entry_lines` | DB migration + `PostingEngineService.java` |
| 3.4 | Add layaway payment history table | New entity + migration |
| 3.5 | Period lock: block POS sales to closed fiscal periods | `PostingEngineService.java` |
| 3.6 | Add `PENDING` / `FAILED` payment status lifecycle | `Payment.java` + `PaymentService.java` |
| 3.7 | Cash deposit GL at session close | `PosSessionService.java` |

### Phase 4 — Receipt & Customer Experience
**Target: 2 weeks**

| # | Task | File / Area |
|---|------|-------------|
| 4.1 | Store receipt HTML/PDF linked to invoice on checkout | `PosCheckoutController.java` |
| 4.2 | Receipt reprint endpoint with audit log | New endpoint |
| 4.3 | Add QR code to receipt (invoice number, branch, date) | `POSSales.jsx` (frontend) |
| 4.4 | Print batch numbers on receipt for batch-controlled items | `POSSales.jsx` + receipt template |
| 4.5 | Email receipt via `JavaMailSender` | `ReceiptService.java` (new) |

### Phase 5 — Serial Numbers & Advanced Stock
**Target: 4 weeks**

| # | Task | File / Area |
|---|------|-------------|
| 5.1 | Create `serial_master` table + entity | New entity + migration |
| 5.2 | Implement serial scan in POS resolve | `PosSearchService.java` |
| 5.3 | Serial status lifecycle (AVAILABLE → SOLD → RETURNED) | `SerialMasterService.java` (new) |
| 5.4 | Serial deduction on DN delivery | `DeliveryNoteService.java` |
| 5.5 | Serial validation on returns | `SalesReturnService.java` |
| 5.6 | `minExpiryDaysForSale` enforcement in FEFO | `BatchSelectionService.java` |

### Phase 6 — Performance & Scale
**Target: Ongoing**

| # | Task |
|---|------|
| 6.1 | Batch product fetch in checkout (eliminate N+1) |
| 6.2 | Batch stock check query (single GROUP BY) |
| 6.3 | Batch FEFO selection across all lines |
| 6.4 | Atomic session total update (UPDATE ... SET col = col + ?) |
| 6.5 | Offline POS queue (IndexedDB → sync on reconnect) |
| 6.6 | Thermal printer integration (ESC/POS via print service) |

---

*End of Report*
