-- Sales Return Phase 2 — which historical rows are incompatible with the new economic model.
--
-- READ-ONLY. Every statement here is a SELECT. Nothing in this file modifies, repairs or
-- back-fills anything, and nothing in the Phase 2 change does either: per the brief's §23 and
-- the economic model's §05, legacy rows need a target-state definition and accounting sign-off
-- before remediation, and the posting date of any corrective JV is not a developer's choice.
--
-- Run per tenant database. Record the counts; they scope the remediation conversation.
--
-- Not in this file: stale invoice-status exposure — invoices whose STORED status disagrees with
-- what InvoiceBalanceService.resolveInvoiceStatus derives from the allocation ledgers. That is a
-- separate population with a separate cause (an aborted POS checkout, not a return), and its
-- figures must NOT be added to the return-driven numbers below. It lives in
-- sales_return_phase2_stale_invoice_status.sql, which also carries the full canonical-recompute
-- simulation and the invoice-level reconciliation.
--
-- Not in this file: the Phase 0 quantification (card/bank settlement residue, cash returns with
-- no drawer movement, legacy voucher double-counting, restocked returns with no stock movement,
-- day-boundary splits, cross-branch returns). Those live in
-- sales_return_phase0_quantification.sql and are unchanged by Phase 2.

-- ---------------------------------------------------------------------------
-- 1. Returns that the split model would have settled differently
-- ---------------------------------------------------------------------------
-- The population that matters most. Each of these refunded, vouchered or credited more than
-- the customer had actually paid for the goods: under Phase 2 the excess would have been an AR
-- allocation instead of value handed back. Approximated against the invoice's CURRENT balance,
-- because the balance at the time of the return is not retained anywhere.
--
-- Interpretation: refund_amount > balance_at_return means money (or redeemable value) left the
-- business for goods the customer had not paid for. The invoice balance was NOT reduced by the
-- return under the old model, so the customer was both refunded and still billed.
SELECT r.return_number,
       r.return_date,
       r.refund_method,
       r.total_amount                                   AS return_value,
       r.refund_amount                                  AS settled_amount,
       i.invoice_number,
       i.invoice_total,
       i.balance                                        AS invoice_balance_now,
       LEAST(r.total_amount, COALESCE(i.balance, 0))    AS would_be_unpaid_portion,
       r.total_amount - LEAST(r.total_amount, COALESCE(i.balance, 0))
                                                        AS would_be_paid_portion
FROM sales_returns r
JOIN sales_invoices i ON i.invoice_number = r.linked_invoice
WHERE r.status = 'APPROVED'
  AND COALESCE(i.balance, 0) > 0
  AND COALESCE(r.refund_amount, r.total_amount) > COALESCE(i.balance, 0) * 0  -- any settlement
  AND LEAST(r.total_amount, COALESCE(i.balance, 0)) > 0                       -- some unpaid part
ORDER BY (r.total_amount - LEAST(r.total_amount, COALESCE(i.balance, 0))) ASC,
         r.return_date DESC;

-- Headline count for the same population.
SELECT COUNT(*)                                                   AS returns_split_would_change,
       COALESCE(SUM(LEAST(r.total_amount, COALESCE(i.balance, 0))), 0)
                                                                  AS ar_that_would_have_been_credited
FROM sales_returns r
JOIN sales_invoices i ON i.invoice_number = r.linked_invoice
WHERE r.status = 'APPROVED'
  AND LEAST(r.total_amount, COALESCE(i.balance, 0)) > 0;

-- ---------------------------------------------------------------------------
-- 2. CUSTOMER_CREDIT returns that the deleted derived subtraction was reducing
-- ---------------------------------------------------------------------------
-- These are the rows the removal of sumLedgerCredit* changes the reported outstanding for.
-- Before Phase 2 the Customer List, the customer summary card and the statement opening
-- balance subtracted the FULL total_amount of each of these from the customer's outstanding,
-- while AR aging, the credit-limit check, the AR reports and reconcileAR did not. After Phase 2
-- none of them subtract anything, because a return credit reaches AR through
-- sales_invoices.balance — and no allocation rows exist for these historical returns.
--
-- Consequence to state plainly: for these customers the Customer List / summary / statement
-- opening balance will RISE by the amounts below, to agree with AR aging and GL 1100. The
-- previously displayed figure was the one that disagreed with the general ledger.
--
-- The economic model's §05 cut-over recommendation is to convert these to allocations against
-- the invoices they were raised against, up to each invoice's outstanding, with any surplus
-- becoming held credit at 2062. That is a one-off script requiring sign-off, and account 2062
-- does not yet exist — so it is deliberately NOT performed here.
SELECT r.customer_code,
       COUNT(*)                   AS ledger_credit_returns,
       SUM(r.total_amount)        AS previously_subtracted_from_outstanding,
       MIN(r.return_date)         AS earliest,
       MAX(r.return_date)         AS latest
FROM sales_returns r
WHERE r.status = 'APPROVED'
  AND r.customer_code IS NOT NULL
  AND (r.refund_method = 'CUSTOMER_CREDIT'
       OR (r.refund_method IS NULL
           AND (r.return_action IS NULL OR UPPER(r.return_action) LIKE '%CREDIT%')))
GROUP BY r.customer_code
ORDER BY previously_subtracted_from_outstanding DESC;

-- Grand total: the size of the reported-outstanding restatement across the tenant.
SELECT COUNT(*)                                     AS total_ledger_credit_returns,
       COALESCE(SUM(r.total_amount), 0)             AS total_outstanding_restatement
FROM sales_returns r
WHERE r.status = 'APPROVED'
  AND (r.refund_method = 'CUSTOMER_CREDIT'
       OR (r.refund_method IS NULL
           AND (r.return_action IS NULL OR UPPER(r.return_action) LIKE '%CREDIT%')));

-- ---------------------------------------------------------------------------
-- 3. Customers whose effective outstanding was negative under the old formula
-- ---------------------------------------------------------------------------
-- Sizes R1b. Under Phase 2 a negative effective outstanding is structurally impossible, so
-- these customers' reported figures move to zero-or-positive. The magnitude below is roughly
-- the held customer credit that would exist on day one of the full model — the figure the
-- Decision 7 (account 2062) conversation needs.
WITH inv AS (
    SELECT customer_code, COALESCE(SUM(balance), 0) AS invoice_outstanding
    FROM sales_invoices
    WHERE status NOT IN ('CANCELLED', 'DRAFT')
    GROUP BY customer_code
),
credits AS (
    SELECT customer_code, COALESCE(SUM(total_amount), 0) AS old_derived_credit
    FROM sales_returns
    WHERE status = 'APPROVED'
      AND customer_code IS NOT NULL
      AND (refund_method = 'CUSTOMER_CREDIT'
           OR (refund_method IS NULL
               AND (return_action IS NULL OR UPPER(return_action) LIKE '%CREDIT%')))
    GROUP BY customer_code
)
SELECT c.customer_code,
       c.invoice_outstanding,
       COALESCE(k.old_derived_credit, 0)                              AS old_derived_credit,
       c.invoice_outstanding - COALESCE(k.old_derived_credit, 0)      AS old_effective_outstanding,
       c.invoice_outstanding                                          AS new_effective_outstanding
FROM inv c
LEFT JOIN credits k ON k.customer_code = c.customer_code
WHERE c.invoice_outstanding - COALESCE(k.old_derived_credit, 0) < 0
ORDER BY old_effective_outstanding ASC;

-- ---------------------------------------------------------------------------
-- 4. Approved returns with no linked invoice
-- ---------------------------------------------------------------------------
-- Under Phase 2 these have no receivable to split against, so the whole return value is
-- treated as a paid portion. That is the conservative reading and matches what the old code
-- effectively did, but it means these rows can never carry an AR allocation. Counted because
-- the economic model's §20 recommends rejecting unlinked returns outright (Phase 3) and
-- decision 9 asks for this population first.
SELECT COUNT(*)                          AS unlinked_approved_returns,
       COALESCE(SUM(total_amount), 0)    AS unlinked_value,
       MIN(return_date)                  AS earliest,
       MAX(return_date)                  AS latest
FROM sales_returns
WHERE status = 'APPROVED'
  AND (linked_invoice IS NULL OR linked_invoice = '');

-- ---------------------------------------------------------------------------
-- 5. Returns whose refund_amount is not the paid portion (i.e. all legacy rows)
-- ---------------------------------------------------------------------------
-- Diagnostic for the X/Z "Receivable credited" figure, which Phase 2 defines as
-- total_amount - refund_amount. V78 backfilled refund_amount = total_amount for every legacy
-- row, so for all of them that figure reads zero: historical reports will show no receivable
-- credited, which is correct for the old model's behaviour and must not be read as a Phase 2
-- figure. Returns approved after the cut-over carry the real split.
SELECT CASE WHEN refund_amount IS NULL THEN 'null refund_amount'
            WHEN refund_amount = total_amount THEN 'refund_amount = total (legacy/fully paid)'
            ELSE 'refund_amount < total (a real split)'
       END                               AS shape,
       COUNT(*)                          AS returns,
       COALESCE(SUM(total_amount), 0)    AS total_value,
       COALESCE(SUM(total_amount - COALESCE(refund_amount, total_amount)), 0)
                                         AS implied_receivable_credited
FROM sales_returns
WHERE status = 'APPROVED'
GROUP BY 1
ORDER BY returns DESC;

-- ---------------------------------------------------------------------------
-- 6. Serial units returned in a scrap condition but left indistinguishable
-- ---------------------------------------------------------------------------
-- Sizes the §20B fix retrospectively. Before it, every returned serial became RETURNED
-- whatever condition the line recorded, so a damaged unit and a resaleable one look identical
-- in the serial register. Neither state is saleable today, so nothing is mis-stocked right
-- now — but these rows cannot be reclassified without a physical check.
SELECT COUNT(DISTINCT sm.serial_number) AS serials_returned_in_scrap_condition
FROM serial_master sm
WHERE sm.status = 'RETURNED'
  AND EXISTS (
      SELECT 1
      FROM sales_return_items sri
      JOIN sales_returns r ON r.id = sri.sales_return_id
      JOIN sales_invoices i ON i.invoice_number = r.linked_invoice
      JOIN sales_invoice_items sii ON sii.sales_invoice_id = i.id
      WHERE sii.serial_number = sm.serial_number
        AND sii.item_code = sri.item_code
        AND r.status = 'APPROVED'
        AND COALESCE(sri.return_condition, 'DAMAGED') <> 'GOOD'
  );

-- ---------------------------------------------------------------------------
-- 7. Confirmation that Phase 2 wrote no allocation rows for historical returns
-- ---------------------------------------------------------------------------
-- Expected: zero rows dated before the deployment date. Allocations are only ever written at
-- approval, so any row here that predates the cut-over means something back-filled history.
SELECT COUNT(*) AS allocations_total,
       MIN(applied_date) AS earliest_allocation,
       MAX(applied_date) AS latest_allocation
FROM sales_return_credit_applications;
