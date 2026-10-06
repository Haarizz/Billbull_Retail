-- V113 — Sales Return reversal.
--
-- Until now an APPROVED sales return was permanent. SalesReturnService refuses to modify it
-- ("Approved returns cannot be modified. Create a reversal instead.") and refuses to delete it
-- ("Approved returns cannot be deleted."), but no reversal existed anywhere in the codebase —
-- no endpoint, no service, no UI. The message pointed at something that was never built, so a
-- mis-keyed return (wrong item, wrong quantity, wrong refund method, a sale entered twice) was
-- unfixable except by hand-written journal entries, which is exactly how one tenant ended up
-- with a correcting JV that left four GL accounts out of step.
--
-- This migration adds the schema the reversal needs. Two parts:
--
-- 1. THE STATUS CHECK CONSTRAINT
--    Hibernate generated sales_returns_status_check from the three SalesReturnStatus values
--    (DRAFT, APPROVED, CANCELLED). REVERSED is a fourth, so the stale constraint is dropped and
--    Hibernate regenerates it with the current enum on the next boot — the same approach
--    QuotationStatusConstraintFixer already takes for sales_quotations.
--
--    CANCELLED is deliberately NOT reused for this. Cancelling a DRAFT is a plain field change
--    with no side effects; reversing an APPROVED return unwinds posted journals, stock, an
--    allocation, possibly a voucher and possibly drawer cash. Collapsing both onto one status
--    would make "was this return's money ever actually moved?" unanswerable from the row.
--
-- 2. THE REVERSAL AUDIT COLUMNS
--    Who reversed it, when, and why. The reason is mandatory at the service layer: a reversal
--    restates a period that may already have been reported on, so "no reason given" is not an
--    acceptable state for a finance reviewer to find.
--
-- Additive and idempotent, like every script here. No existing row changes: every current row
-- keeps its status, and the three new columns are NULL for returns that were never reversed,
-- which is the correct reading of "this has not been reversed".

DO $$
BEGIN
    IF to_regclass('public.sales_returns') IS NOT NULL THEN

        -- 1. Drop the stale status check so REVERSED is accepted. Dropped rather than rewritten
        --    in place: Hibernate owns the constraint's definition and regenerates it from the
        --    enum, so hard-coding the four values here would simply go stale again at the next
        --    enum change. IF EXISTS because a tenant whose schema Hibernate built differently
        --    may not have it at all.
        ALTER TABLE sales_returns DROP CONSTRAINT IF EXISTS sales_returns_status_check;

        -- 2. Reversal audit trail.
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name = 'sales_returns' AND column_name = 'reversed_at') THEN
            ALTER TABLE sales_returns ADD COLUMN reversed_at TIMESTAMP(6) NULL;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name = 'sales_returns' AND column_name = 'reversed_by') THEN
            ALTER TABLE sales_returns ADD COLUMN reversed_by VARCHAR(150) NULL;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name = 'sales_returns' AND column_name = 'reversal_reason') THEN
            ALTER TABLE sales_returns ADD COLUMN reversal_reason VARCHAR(500) NULL;
        END IF;

    END IF;
END $$;
