-- Sales Return Phase 2 — stale invoice-status exposure, quantified.
--
-- READ-ONLY. Every statement here is a SELECT. Nothing in this file modifies, repairs or
-- back-fills anything.
--
-- WHY THIS FILE IS SEPARATE FROM sales_return_phase2_incompatible_history.sql
-- ---------------------------------------------------------------------------
-- That file sizes RETURN-DRIVEN restatement: rows whose settlement the Phase 2 split model
-- would have handled differently. This file sizes a different and unrelated population —
-- invoices whose STORED status disagrees with what the canonical recomputation derives from
-- the allocation ledgers. The two must never be added together into one number: one is a
-- consequence of the new economic model, the other is pre-existing data damage that the new
-- canonical status owner merely makes visible.
--
-- THE MECHANISM
-- -------------
-- InvoiceBalanceService.recomputeInvoiceBalance is the canonical owner of amountPaid,
-- returnCredited, balance and status. It derives:
--
--     totalPaid = SUM(completed ReceiptVoucher by salesInvoiceId)
--               + SUM(APPLIED AdvanceApplication by invoiceNumber)
--     credited  = SUM(APPLIED SalesReturnCreditApplication by invoiceNumber)
--     balance   = max(0, invoiceTotal - totalPaid - credited)
--     status    = InvoiceBalanceService.resolveInvoiceStatus(...)
--
-- and resolveInvoiceStatus, for an invoice currently stamped PAID or PARTIALLY_PAID whose
-- derived totalPaid is zero, returns CONFIRMED (delivered) or POSTED (not delivered) — i.e.
-- it un-pays the invoice. Every AR surface (Customer List, customer summary, credit-limit
-- check, AR aging, SubLedgerReconciliationService.reconcileAR) filters
-- `status NOT IN (CANCELLED, PAID)`, so an invoice wrongly stamped PAID contributes ZERO to
-- reported AR today and its full balance the moment anything triggers a recompute on it.
--
-- A recompute is triggered by any receipt, advance application or approved return touching
-- that invoice. Phase 2 does not back-fill anything and does not recompute on boot; the
-- reclassification therefore happens lazily, one invoice at a time, on the next real event.
--
-- CRITICAL: AN ADVANCE IS NOT A RECEIPT
-- -------------------------------------
-- A naive query that counts only completed receipt vouchers reports false positives: an
-- invoice legitimately settled by an applied customer advance has zero receipts and is
-- correctly PAID. Query 1 nets out advances and return credits, so it reports only rows the
-- canonical recomputation would actually change. Query 1b shows the false positives such a
-- naive query would have produced, so the difference is auditable.
--
-- Run per tenant database. Record the counts; they scope the remediation conversation.

-- ---------------------------------------------------------------------------
-- 1. THE POPULATION: PAID, zero completed receipts, positive stored balance
-- ---------------------------------------------------------------------------
-- The query the audit brief asks for. Columns are exactly the evidence set a finance reviewer
-- needs to identify each row. completed_receipt_count is reported separately from
-- applied_advance and applied_return_credit so a reviewer can see WHY the row is stale rather
-- than only that it is.
SELECT i.invoice_number,
       i.customer_code,
       i.invoice_date,
       i.invoice_total,
       i.balance,
       i.status,
       COALESCE(rv.receipt_count, 0)    AS completed_receipt_count,
       COALESCE(rv.receipt_amount, 0)   AS completed_receipt_amount,
       COALESCE(aa.applied_amount, 0)   AS applied_advance,
       COALESCE(rc.applied_amount, 0)   AS applied_return_credit,
       i.amount_paid                    AS stored_amount_paid,
       i.delivery_status,
       i.sales_type,
       i.pos_session_id,
       i.created_at
FROM sales_invoices i
LEFT JOIN (SELECT sales_invoice_id, COUNT(*) AS receipt_count, SUM(amount) AS receipt_amount
           FROM sales_receipt_vouchers
           WHERE LOWER(TRIM(status)) = 'completed'
           GROUP BY sales_invoice_id) rv ON rv.sales_invoice_id = i.id
LEFT JOIN (SELECT invoice_number, SUM(applied_amount) AS applied_amount
           FROM advance_applications
           WHERE status = 'APPLIED'
           GROUP BY invoice_number) aa ON aa.invoice_number = i.invoice_number
LEFT JOIN (SELECT invoice_number, SUM(applied_amount) AS applied_amount
           FROM sales_return_credit_applications
           WHERE status = 'APPLIED'
           GROUP BY invoice_number) rc ON rc.invoice_number = i.invoice_number
WHERE i.status = 'PAID'
  AND COALESCE(rv.receipt_count, 0) = 0
  AND COALESCE(i.balance, 0) > 0
ORDER BY i.invoice_number;

-- Headline figures for the same population: the count and the AR that becomes visible.
SELECT COUNT(*)                                  AS stale_paid_invoices,
       COALESCE(SUM(i.balance), 0)               AS stale_paid_exposure,
       COALESCE(SUM(i.invoice_total), 0)         AS stale_paid_invoiced,
       MIN(i.invoice_date)                       AS earliest,
       MAX(i.invoice_date)                       AS latest,
       COUNT(DISTINCT i.customer_code)           AS customers_affected
FROM sales_invoices i
LEFT JOIN (SELECT sales_invoice_id, COUNT(*) AS receipt_count
           FROM sales_receipt_vouchers
           WHERE LOWER(TRIM(status)) = 'completed'
           GROUP BY sales_invoice_id) rv ON rv.sales_invoice_id = i.id
WHERE i.status = 'PAID'
  AND COALESCE(rv.receipt_count, 0) = 0
  AND COALESCE(i.balance, 0) > 0;

-- ---------------------------------------------------------------------------
-- 1b. The false positives a receipts-only query produces
-- ---------------------------------------------------------------------------
-- PAID, zero completed receipts, but fully settled by an applied advance and/or return credit.
-- These rows are CORRECT: the canonical recomputation reproduces PAID and balance 0 exactly.
-- Reported so that the difference between this file's figure and a naive count is explicit.
SELECT i.invoice_number,
       i.invoice_total,
       i.balance,
       COALESCE(aa.applied_amount, 0)  AS applied_advance,
       COALESCE(rc.applied_amount, 0)  AS applied_return_credit,
       'correctly PAID via non-receipt settlement' AS reading
FROM sales_invoices i
LEFT JOIN (SELECT sales_invoice_id, COUNT(*) AS receipt_count
           FROM sales_receipt_vouchers
           WHERE LOWER(TRIM(status)) = 'completed'
           GROUP BY sales_invoice_id) rv ON rv.sales_invoice_id = i.id
LEFT JOIN (SELECT invoice_number, SUM(applied_amount) AS applied_amount
           FROM advance_applications
           WHERE status = 'APPLIED'
           GROUP BY invoice_number) aa ON aa.invoice_number = i.invoice_number
LEFT JOIN (SELECT invoice_number, SUM(applied_amount) AS applied_amount
           FROM sales_return_credit_applications
           WHERE status = 'APPLIED'
           GROUP BY invoice_number) rc ON rc.invoice_number = i.invoice_number
WHERE i.status = 'PAID'
  AND COALESCE(rv.receipt_count, 0) = 0
  AND COALESCE(i.balance, 0) = 0
  AND COALESCE(aa.applied_amount, 0) + COALESCE(rc.applied_amount, 0) > 0
ORDER BY i.invoice_number;

-- ---------------------------------------------------------------------------
-- 2. FULL CANONICAL RECOMPUTE SIMULATION — every non-cancelled invoice
-- ---------------------------------------------------------------------------
-- Replicates InvoiceBalanceService.recomputeInvoiceBalance and
-- InvoiceBalanceService.resolveInvoiceStatus in SQL, so the stored row can be compared with
-- what the canonical owner would derive WITHOUT running the recomputation against the tenant.
--
-- Mapped one-for-one from the Java:
--   * CANCELLED invoices are skipped entirely (the recompute returns early).
--   * DRAFT invoices have their MONEY recomputed but keep status DRAFT (resolveInvoiceStatus
--     returns currentStatus for DRAFT), so they appear here with a simulated balance and an
--     unchanged status.
--   * delivered = delivery_status IN ('DELIVERED','AUTO_DELIVERED') OR delivery_status IS NULL
--     (isEffectivelyDelivered).
--   * A completed receipt is status 'Completed', case-insensitive, trimmed (isCompletedStatus).
WITH ledger AS (
    SELECT i.id,
           i.invoice_number,
           i.customer_code,
           i.invoice_date,
           i.status                                               AS stored_status,
           COALESCE(i.invoice_total, 0)                           AS invoice_total,
           i.amount_paid                                          AS stored_amount_paid,
           COALESCE(i.balance, 0)                                 AS stored_balance,
           COALESCE(i.return_credited, 0)                         AS stored_return_credited,
           (i.delivery_status IN ('DELIVERED', 'AUTO_DELIVERED')
            OR i.delivery_status IS NULL)                         AS delivered,
           COALESCE((SELECT SUM(rv.amount) FROM sales_receipt_vouchers rv
                     WHERE rv.sales_invoice_id = i.id
                       AND LOWER(TRIM(rv.status)) = 'completed'), 0)       AS receipts,
           COALESCE((SELECT SUM(aa.applied_amount) FROM advance_applications aa
                     WHERE aa.invoice_number = i.invoice_number
                       AND aa.status = 'APPLIED'), 0)                      AS advances,
           COALESCE((SELECT SUM(rc.applied_amount) FROM sales_return_credit_applications rc
                     WHERE rc.invoice_number = i.invoice_number
                       AND rc.status = 'APPLIED'), 0)                      AS return_credits
    FROM sales_invoices i
    WHERE i.status <> 'CANCELLED'
),
derived AS (
    SELECT l.*,
           l.receipts + l.advances                                         AS total_paid,
           GREATEST(l.invoice_total - l.receipts - l.advances - l.return_credits, 0)
                                                                           AS simulated_balance,
           l.receipts + l.advances + l.return_credits                      AS settled
    FROM ledger l
)
SELECT d.invoice_number,
       d.customer_code,
       d.invoice_date,
       d.invoice_total,
       d.stored_status,
       d.stored_amount_paid,
       d.stored_balance,
       d.receipts            AS completed_receipts,
       d.advances            AS applied_advances,
       d.return_credits      AS applied_return_credits,
       d.total_paid          AS simulated_total_paid,
       d.simulated_balance,
       CASE
           WHEN d.stored_status = 'DRAFT'                              THEN 'DRAFT'
           WHEN d.settled >= d.invoice_total AND d.invoice_total > 0   THEN 'PAID'
           WHEN d.total_paid > 0                                       THEN 'PARTIALLY_PAID'
           WHEN d.stored_status IN ('PAID', 'PARTIALLY_PAID')
                THEN CASE WHEN d.delivered THEN 'CONFIRMED' ELSE 'POSTED' END
           ELSE COALESCE(d.stored_status, 'POSTED')
       END                                                              AS simulated_status,
       d.simulated_balance - d.stored_balance                           AS balance_delta
FROM derived d
ORDER BY d.invoice_number;

-- Only the rows the recomputation would CHANGE. This is the restatement, itemised.
WITH ledger AS (
    SELECT i.id, i.invoice_number, i.customer_code, i.status AS stored_status,
           COALESCE(i.invoice_total, 0) AS invoice_total,
           COALESCE(i.balance, 0) AS stored_balance,
           (i.delivery_status IN ('DELIVERED', 'AUTO_DELIVERED')
            OR i.delivery_status IS NULL) AS delivered,
           COALESCE((SELECT SUM(rv.amount) FROM sales_receipt_vouchers rv
                     WHERE rv.sales_invoice_id = i.id
                       AND LOWER(TRIM(rv.status)) = 'completed'), 0) AS receipts,
           COALESCE((SELECT SUM(aa.applied_amount) FROM advance_applications aa
                     WHERE aa.invoice_number = i.invoice_number
                       AND aa.status = 'APPLIED'), 0) AS advances,
           COALESCE((SELECT SUM(rc.applied_amount) FROM sales_return_credit_applications rc
                     WHERE rc.invoice_number = i.invoice_number
                       AND rc.status = 'APPLIED'), 0) AS return_credits
    FROM sales_invoices i
    WHERE i.status <> 'CANCELLED'
),
derived AS (
    SELECT l.*, l.receipts + l.advances AS total_paid,
           GREATEST(l.invoice_total - l.receipts - l.advances - l.return_credits, 0) AS simulated_balance,
           l.receipts + l.advances + l.return_credits AS settled
    FROM ledger l
),
resolved AS (
    SELECT d.*,
           CASE
               WHEN d.stored_status = 'DRAFT'                             THEN 'DRAFT'
               WHEN d.settled >= d.invoice_total AND d.invoice_total > 0  THEN 'PAID'
               WHEN d.total_paid > 0                                      THEN 'PARTIALLY_PAID'
               WHEN d.stored_status IN ('PAID', 'PARTIALLY_PAID')
                    THEN CASE WHEN d.delivered THEN 'CONFIRMED' ELSE 'POSTED' END
               ELSE COALESCE(d.stored_status, 'POSTED')
           END AS simulated_status
    FROM derived d
)
SELECT r.invoice_number, r.customer_code, r.invoice_total,
       r.stored_status, r.simulated_status,
       r.stored_balance, r.simulated_balance,
       r.simulated_balance - r.stored_balance AS balance_delta,
       CASE WHEN r.stored_status <> r.simulated_status AND r.simulated_balance <> r.stored_balance
                 THEN 'status + balance restated'
            WHEN r.stored_status <> r.simulated_status
                 THEN 'status restated only'
            ELSE 'balance restated only'
       END AS restatement_kind
FROM resolved r
WHERE r.stored_status <> r.simulated_status
   OR r.simulated_balance <> r.stored_balance
ORDER BY ABS(r.simulated_balance - r.stored_balance) DESC, r.invoice_number;

-- ---------------------------------------------------------------------------
-- 3. INVOICE RECONCILIATION: stored balance vs independent ledger recomputation
-- ---------------------------------------------------------------------------
-- The tenant-level reconciliation figure. A non-zero `difference` is NOT by itself a defect in
-- the balance algorithm — it is the sum of stored rows the canonical owner has not yet been
-- asked to recompute. Read it alongside query 2's itemisation before drawing any conclusion.
WITH derived AS (
    SELECT i.id,
           COALESCE(i.balance, 0) AS stored_balance,
           GREATEST(COALESCE(i.invoice_total, 0)
                    - COALESCE((SELECT SUM(rv.amount) FROM sales_receipt_vouchers rv
                                WHERE rv.sales_invoice_id = i.id
                                  AND LOWER(TRIM(rv.status)) = 'completed'), 0)
                    - COALESCE((SELECT SUM(aa.applied_amount) FROM advance_applications aa
                                WHERE aa.invoice_number = i.invoice_number
                                  AND aa.status = 'APPLIED'), 0)
                    - COALESCE((SELECT SUM(rc.applied_amount) FROM sales_return_credit_applications rc
                                WHERE rc.invoice_number = i.invoice_number
                                  AND rc.status = 'APPLIED'), 0), 0) AS simulated_balance
    FROM sales_invoices i
    WHERE i.status <> 'CANCELLED'
)
SELECT COUNT(*)                                                         AS invoice_count,
       COUNT(*) FILTER (WHERE stored_balance = simulated_balance)       AS matching_count,
       COUNT(*) FILTER (WHERE stored_balance <> simulated_balance)      AS different_count,
       COALESCE(SUM(stored_balance), 0)                                 AS total_stored_balance,
       COALESCE(SUM(simulated_balance), 0)                              AS total_simulated_balance,
       COALESCE(SUM(simulated_balance), 0) - COALESCE(SUM(stored_balance), 0) AS difference,
       COUNT(*) FILTER (WHERE stored_balance < 0)                       AS negative_stored_balances,
       COUNT(*) FILTER (WHERE simulated_balance < 0)                    AS negative_simulated_balances
FROM derived;

-- ---------------------------------------------------------------------------
-- 4. AR SURFACE COMPARISON — stored vs simulated, per customer
-- ---------------------------------------------------------------------------
-- All five AR surfaces (Customer List, customer summary card, credit-limit check, AR aging,
-- reconcileAR) share one predicate: `status NOT IN (CANCELLED, PAID)` over sales_invoices.balance.
-- StatementService does NOT: it emits Dr invoiceTotal for every invoice with
-- `status <> CANCELLED` and credits receipts, applied advances and the full value of approved
-- returns. A stale PAID invoice therefore already appears in the statement's running balance
-- while contributing nothing to the other four surfaces — they disagree TODAY, before any
-- Phase 2 recomputation.
WITH derived AS (
    SELECT i.customer_code,
           i.status AS stored_status,
           COALESCE(i.invoice_total, 0) AS invoice_total,
           COALESCE(i.balance, 0) AS stored_balance,
           (i.delivery_status IN ('DELIVERED', 'AUTO_DELIVERED')
            OR i.delivery_status IS NULL) AS delivered,
           COALESCE((SELECT SUM(rv.amount) FROM sales_receipt_vouchers rv
                     WHERE rv.sales_invoice_id = i.id
                       AND LOWER(TRIM(rv.status)) = 'completed'), 0) AS receipts,
           COALESCE((SELECT SUM(aa.applied_amount) FROM advance_applications aa
                     WHERE aa.invoice_number = i.invoice_number
                       AND aa.status = 'APPLIED'), 0) AS advances,
           COALESCE((SELECT SUM(rc.applied_amount) FROM sales_return_credit_applications rc
                     WHERE rc.invoice_number = i.invoice_number
                       AND rc.status = 'APPLIED'), 0) AS return_credits
    FROM sales_invoices i
    WHERE i.status <> 'CANCELLED'
),
resolved AS (
    SELECT d.*,
           d.receipts + d.advances AS total_paid,
           GREATEST(d.invoice_total - d.receipts - d.advances - d.return_credits, 0) AS simulated_balance,
           CASE
               WHEN d.stored_status = 'DRAFT' THEN 'DRAFT'
               WHEN d.receipts + d.advances + d.return_credits >= d.invoice_total
                    AND d.invoice_total > 0 THEN 'PAID'
               WHEN d.receipts + d.advances > 0 THEN 'PARTIALLY_PAID'
               WHEN d.stored_status IN ('PAID', 'PARTIALLY_PAID')
                    THEN CASE WHEN d.delivered THEN 'CONFIRMED' ELSE 'POSTED' END
               ELSE COALESCE(d.stored_status, 'POSTED')
           END AS simulated_status
    FROM derived d
)
SELECT customer_code,
       COALESCE(SUM(stored_balance) FILTER (WHERE stored_status NOT IN ('PAID')), 0)
                                                        AS ar_surfaces_now,
       COALESCE(SUM(simulated_balance) FILTER (WHERE simulated_status NOT IN ('PAID')), 0)
                                                        AS ar_surfaces_simulated,
       COALESCE(SUM(invoice_total) - SUM(receipts) - SUM(advances) - SUM(return_credits), 0)
                                                        AS statement_closing_now,
       COALESCE(SUM(simulated_balance) FILTER (WHERE simulated_status NOT IN ('PAID')), 0)
       - COALESCE(SUM(stored_balance) FILTER (WHERE stored_status NOT IN ('PAID')), 0)
                                                        AS ar_surface_delta
FROM resolved
GROUP BY customer_code
HAVING COALESCE(SUM(simulated_balance) FILTER (WHERE simulated_status NOT IN ('PAID')), 0)
     <> COALESCE(SUM(stored_balance) FILTER (WHERE stored_status NOT IN ('PAID')), 0)
ORDER BY ar_surface_delta DESC;

-- ---------------------------------------------------------------------------
-- 5. GL AR CONTROL (1100) vs AR SUB-LEDGER, with the stale rows isolated
-- ---------------------------------------------------------------------------
-- The AR control account is PostingEngineService.ACC_ACCOUNTS_RECEIVABLE = '1100'.
-- SubLedgerReconciliationService.reconcileAR compares its net GL balance against
-- sumGlobalOutstandingBalance(), which excludes CANCELLED and PAID.
--
-- A stale PAID invoice contributes its full amount to the GL side (the Fast Sale / invoice
-- journal debited 1100 and no receipt journal ever credited it) and ZERO to the sub-ledger
-- side. Recomputing it therefore moves the sub-ledger TOWARD the GL, reducing this difference.
-- State that direction explicitly: the restatement is a correction, not a new gap.
SELECT (SELECT COALESCE(SUM(jl.debit) - SUM(jl.credit), 0)
        FROM journal_lines jl WHERE jl.account_code = '1100')          AS gl_1100_net,
       (SELECT COALESCE(SUM(balance), 0) FROM sales_invoices
        WHERE status NOT IN ('CANCELLED', 'PAID'))                     AS ar_subledger_now,
       (SELECT COALESCE(SUM(i.balance), 0)
        FROM sales_invoices i
        LEFT JOIN (SELECT sales_invoice_id, COUNT(*) c FROM sales_receipt_vouchers
                   WHERE LOWER(TRIM(status)) = 'completed' GROUP BY 1) rv
               ON rv.sales_invoice_id = i.id
        WHERE i.status = 'PAID' AND COALESCE(rv.c, 0) = 0 AND COALESCE(i.balance, 0) > 0)
                                                                       AS stale_paid_exposure;

-- ---------------------------------------------------------------------------
-- 6. ORIGIN EVIDENCE: POS checkouts that committed status but not settlement
-- ---------------------------------------------------------------------------
-- PosCheckoutController commits in three separately-committed steps: (1) save DRAFT,
-- (2) updateStatus(PAID|PARTIALLY_PAID|CONFIRMED) — which also posts the Fast Sale GL journal,
-- (3) recordPayment, which creates the Payment row, the ReceiptVoucher and the receipt journal.
-- Steps 1 and 2 are rolled back by deleteQuietly on failure; step 3 is NOT. A step-3 failure
-- therefore leaves the invoice stamped PAID with the sale posted and nothing collected.
--
-- The signature below is that shape: a Fast Sale journal with no matching receipt journal.
--
-- Read the `reading` column, not the row count. An ordinary CREDIT checkout legitimately has a
-- Fast Sale journal (Dr 1100 AR) and no receipt — nothing was collected and the invoice is
-- CONFIRMED / PARTIALLY_PAID, which is correct. Only a row stamped PAID with nothing collected
-- is the aborted-checkout signature.
SELECT CASE WHEN i.status = 'PAID' THEN 'ABORTED CHECKOUT — PAID with nothing collected'
            ELSE 'normal credit sale — AR open and reported'
       END                                          AS reading,
       i.invoice_number,
       i.status,
       i.invoice_total,
       i.balance,
       i.pos_session_id,
       je.entry_number                              AS fast_sale_journal,
       je.created_at                                AS fast_sale_posted_at,
       (SELECT COUNT(*) FROM sales_payments sp WHERE sp.linked_invoice = i.invoice_number)
                                                    AS payment_rows,
       (SELECT COUNT(*) FROM sales_receipt_vouchers rv WHERE rv.sales_invoice_id = i.id)
                                                    AS receipt_rows,
       (SELECT COUNT(*) FROM pos_audit_log pal
        WHERE pal.action = 'CHECKOUT_COMPLETED' AND pal.entity_id = i.id::text)
                                                    AS checkout_completed_audit_rows
FROM sales_invoices i
JOIN journal_entries je ON je.reference = 'FS-' || i.invoice_number
WHERE NOT EXISTS (SELECT 1 FROM sales_receipt_vouchers rv
                  WHERE rv.sales_invoice_id = i.id
                    AND LOWER(TRIM(rv.status)) = 'completed')
  AND COALESCE(i.balance, 0) > 0
ORDER BY (i.status = 'PAID') DESC, i.invoice_number;

-- Session-counter corroboration: a POS session whose recorded invoice_count is lower than the
-- number of invoices carrying its id did not record every checkout, because
-- recordInvoiceOnSession runs AFTER recordPayment in the same request.
SELECT s.id                              AS session_id,
       s.session_date,
       s.invoice_count                   AS recorded_invoice_count,
       COUNT(i.id)                       AS invoices_carrying_session_id,
       s.total_sales                     AS recorded_total_sales,
       COALESCE(SUM(i.invoice_total), 0) AS invoiced_total,
       COALESCE(SUM(i.invoice_total), 0) - COALESCE(s.total_sales, 0) AS unrecorded_value
FROM pos_sessions s
JOIN sales_invoices i ON i.pos_session_id = s.id
GROUP BY s.id, s.session_date, s.invoice_count, s.total_sales
HAVING COUNT(i.id) <> COALESCE(s.invoice_count, 0)
ORDER BY unrecorded_value DESC;
