-- V106 — Composite index on lpos for the vendor details panel's "recent LPOs" read.
--
-- LpoRepository.findRecentByVendorId() filters by vendor_id and orders by
-- lpo_date DESC, bounded to a handful of rows. The existing lpos indexes are
-- idx_lpo_branch (branch_id), idx_lpo_branch_status_date (branch_id, status,
-- lpo_date), idx_lpo_status (status) and idx_lpo_date (lpo_date) — none of them
-- leads with vendor_id, so that query would otherwise scan the table and sort.
--
-- (vendor_id, lpo_date) lets PostgreSQL seek to the vendor and walk the index
-- backwards for the newest rows, with no sort step.

DO $$
BEGIN
    IF to_regclass('public.lpos') IS NOT NULL THEN
        CREATE INDEX IF NOT EXISTS idx_lpo_vendor_date
            ON public.lpos (vendor_id, lpo_date);
        RAISE NOTICE 'V106: created composite index idx_lpo_vendor_date on lpos(vendor_id, lpo_date).';
    ELSE
        RAISE NOTICE 'V106: lpos absent — skipping (fresh DB, Hibernate will create it).';
    END IF;
END $$;
