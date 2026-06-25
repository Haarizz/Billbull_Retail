# POS Payment → Invoice Posting: Root-Cause & ERP-Grade Fix

**Date:** 2026-06-25
**Branch:** `feature/pos-erp-audit`
**Severity:** P0 — production-blocking
**Symptom:** A POS cash sale completes ("Payment Complete" modal shows correct Sale Amount,
Deposit Applied, Paid Amount, Change), yet the Sales Invoice list shows **Status = DRAFT,
Paid = AED 0.00, Balance = AED 3080.00**. The Reprint screen shows the same stale DRAFT.

---

## 1. The decisive finding (one root cause, not ten)

The reported "10 issues" are **one defect with nine downstream symptoms.** Every backend side
effect of the payment posted *correctly and committed*; a single stale-entity save at the very
end of checkout then reverted the invoice **header row** back to its pre-payment snapshot.

Ground truth from the live `testdb` for INV-2026-0041 (id 42), captured *before* the fix:

| Layer | Table | State | Verdict |
|---|---|---|---|
| Payment | `sales_payments` | PAY-2026-0028 = 3080.00, COMPLETED | ✅ created |
| Receipt voucher | `sales_receipt_vouchers` | RV-2026-035 = 3080.00, linked to invoice 42 | ✅ created |
| Delivery note | `delivery_notes` | DN-2026-0019, **DELIVERED**, source = invoice 42 | ✅ created |
| Stock | `stock_movements` | id 62, −1.000, ref DN-2026-0019 | ✅ deducted |
| **Invoice header** | `sales_invoices` | **status=DRAFT, amount_paid=NULL, balance=3080, delivery_status=PENDING** | ❌ **reverted** |

The invoice's own `delivery_status = PENDING` while its delivery note is `DELIVERED` is the tell:
`doUpdateStatus()` *did* set the header to DELIVERED in the DB, and something later overwrote it.

### The clobbering write

`PosCheckoutController.checkout()` ran, in order:

1. **Step 1** `saved = invoiceService.save(invoice)` → returns a **detached DRAFT snapshot**
   (`status=DRAFT, amountPaid=null, balance=total, deliveryStatus=PENDING`).
2. **Step 2** `invoiceService.updateStatus(id, PAID)` → in its own committed transaction:
   FEFO/batch reserve, auto-DN, stock deduction, GL posting, `deliveryStatus=DELIVERED`,
   `status=PAID`. **Committed.**
3. **Step 3** `invoiceService.recordPayment(...)` → Payment + ReceiptVoucher created;
   `ReceiptVoucherService.syncLinkedInvoice()` set `amountPaid=3080, balance=0, status=PAID`.
   **Committed.**
4. **§4.1 QR archival** (the bug):
   ```java
   saved.setPosReceiptQr(qr);
   invoiceRepository.save(saved);   // ← merges the Step-1 DRAFT snapshot back
   ```
   `saved` is still the Step-1 object. Its in-memory fields were never refreshed after Steps 2–3
   (which wrote to the DB, not to this detached object). `save()` is a full JPA **merge**, so it
   wrote `status=DRAFT, amountPaid=null, balance=3080, deliveryStatus=PENDING` over the committed
   PAID state. The final `return getById(...)` then read that reverted row back to the client —
   which is why the *persisted* invoice is DRAFT even though the modal (computed client-side from
   the request) looked correct.

Because POS_SALE is the only flow that runs this checkout controller, **only POS sales were
affected**; DIRECT_SALE invoices (e.g. INV-2026-0036, PAID) post through a different path and were
always correct.

### Why `syncLinkedInvoice` couldn't save us

`ReceiptVoucherService.resolveInvoiceStatus()` early-returns the current status when it is
`DRAFT`/`CANCELLED`. Even on a later re-sync the header would stay DRAFT once clobbered. But that
is a *guard*, not the cause — the cause is the stale full-entity save above.

---

## 2. The fix

QR archival must persist **only** the QR column and must never re-save the invoice entity.

**`SalesInvoiceRepository`** — targeted single-column update:
```java
@Modifying
@Query("UPDATE SalesInvoice s SET s.posReceiptQr = :qr WHERE s.id = :id")
void updatePosReceiptQr(@Param("id") Long id, @Param("qr") String qr);
```

**`SalesInvoiceService`** — transactional wrapper:
```java
@Transactional
public void archiveReceiptQr(Long id, String qr) {
    invoiceRepo.updatePosReceiptQr(id, qr);
}
```

**`PosCheckoutController`** — Step 4 now calls `invoiceService.archiveReceiptQr(saved.getId(), qr)`
instead of `invoiceRepository.save(saved)`. Nothing but `pos_receipt_qr` is touched, so the
committed PAID/payment/delivery/GL state survives. The QR archival stays non-blocking (wrapped in
try/catch).

No other writer in the checkout flow re-saves the invoice entity: `recordInvoiceOnSession` does an
atomic UPDATE on the session table, and the serial-number loop saves `SerialMaster` rows. The QR
save was the **sole** clobber.

---

## 3. Per-issue resolution (the original 10)

| # | Reported issue | Verdict | Resolution |
|---|---|---|---|
| 1 | Invoice stays DRAFT after payment | **Root cause** | Fixed — QR save no longer reverts header |
| 2 | Paid = 0 / payment not linked | Symptom of #1 | `amount_paid`/`balance` now survive; Payment + RV were always linked |
| 3 | Success modal shown before commit | Not a bug | Frontend `await`s `posCheckout`; backend already committed Steps 2–3. The modal looked right because totals are computed client-side; the header was the only stale piece |
| 4 | Payment calculation | Correct | Outstanding = Total − Deposit; Change = Tendered − Outstanding. Layaway deposit is folded into recorded tender (`amountTendered += deposit`) |
| 5 | Deposit application | Correct | "Deposit" here is a **layaway** deposit collected at layaway creation; at conversion the full amount is recorded as payment (DB shows 3080) |
| 6 | Inventory posting | Always worked | DN DELIVERED + `stock_movements −1.000` present for every paid sale |
| 7 | Accounting posting | Always worked | Payment → ReceiptVoucher → GL; FAST_SALE posts the combined Cash/Revenue/VAT/COGS entry on DN delivery |
| 8 | Status transitions | Symptom of #1 | DRAFT → PAID + DELIVERED now persists |
| 9 | Reprint shows DRAFT | Symptom of #1 | Reprint reads `invoice.status`; now correct |
| 10 | DB consistency / rollback | Symptom of #1 | All tables were consistent *except* the clobbered header; now fully consistent |

---

## 4. Historical data backfill

11 POS_SALE invoices were left DRAFT/Paid=0 by this bug. Reconciled from receipt-voucher truth in
a single transaction:

- All 11 → `status=PAID, amount_paid=3080, balance=0` (each had a completed RV = invoice total).
- Of those, the 5 with a real DELIVERED delivery note (ids 38–42) → `delivery_status=DELIVERED`.
- The older 6 (ids 29–35) have **no** delivery note (their auto-DN predates the warehouse-defaulting
  fix and never generated), so no stock was deducted — they correctly keep `delivery_status=PENDING`.

Final cross-table check for the screenshot invoices (38–41): header PAID / paid 3080 / bal 0 /
DELIVERED, with matching Payment 3080, RV 3080, DN DELIVERED, stock −1.000. ✅

---

## 5. Tests

- `PosCheckoutControllerTest` — a cash checkout transitions to PAID, records the full 3080 payment,
  archives QR via `archiveReceiptQr`, and **never** calls `invoiceRepository.save` (the regression
  guard). Plus idempotent-replay path.
- `SalesInvoiceQrArchivalTest` — `archiveReceiptQr` delegates to `updatePosReceiptQr` and never
  calls `save`/`findById`.
- Full sales + POS suite: **59 tests green.**

---

## 6. Files changed

- `billbull-backend/.../sales/invoice/SalesInvoiceRepository.java` — `updatePosReceiptQr`
- `billbull-backend/.../sales/invoice/SalesInvoiceService.java` — `archiveReceiptQr`
- `billbull-backend/.../pos/checkout/PosCheckoutController.java` — QR archival rewired
- `billbull-backend/.../test/.../pos/checkout/PosCheckoutControllerTest.java` — new
- `billbull-backend/.../test/.../sales/invoice/SalesInvoiceQrArchivalTest.java` — new
