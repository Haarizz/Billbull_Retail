-- V93 — Batch/expiry capture on purchase documents.
--
-- Purchasing already minted per-unit batch identity in batch_master (PurchaseBatchCreationService),
-- but always with expiry_date NULL: there was nowhere on a GRN or purchase invoice line for a
-- receiver to record the expiry printed on the carton. These two tables are that place.
--
-- They hold captured *intent*, one row per lot ("N units share this batch number and this expiry"),
-- and are deliberately NOT a second source of truth for stock. On-hand quantity stays derived from
-- stock_movement, and inventory identity stays per-unit in batch_master — exactly as stock-taking
-- already works. They mirror grn_item_serials / purchase_invoice_item_serials, which play the same
-- role for serialised products.
--
-- Additive and idempotent, per the repo convention: guarded with to_regclass so it is a no-op where
-- Hibernate's ddl-auto has already created the tables, and safe to re-run.

DO $$
BEGIN
    IF to_regclass('public.grn_item_batches') IS NULL THEN
        CREATE TABLE grn_item_batches (
            id                 bigserial PRIMARY KEY,

            grn_item_id        bigint NOT NULL REFERENCES grn_items(id) ON DELETE CASCADE,

            -- NULL means "generate the standard identity" (PU-{ddMMyy}-L{NN}-{code}-{unit}).
            -- A value is a supplier/user lot prefix, honoured the same way stock-taking honours a
            -- typed batch number: the per-unit index is appended to it.
            batch_number       varchar(120),
            manufacturing_date date,
            expiry_date        date,

            -- Base units received under this lot. The lots on a line must total the line quantity.
            quantity           integer NOT NULL DEFAULT 0,

            is_active          boolean NOT NULL DEFAULT true,
            created_at         timestamp,
            created_by         varchar(255),
            updated_at         timestamp,
            updated_by         varchar(255)
        );

        CREATE INDEX idx_grn_item_batch_grn_item ON grn_item_batches (grn_item_id);
        CREATE INDEX idx_grn_item_batch_expiry   ON grn_item_batches (expiry_date);

        RAISE NOTICE 'V93: created grn_item_batches.';
    END IF;

    IF to_regclass('public.purchase_invoice_item_batches') IS NULL THEN
        CREATE TABLE purchase_invoice_item_batches (
            id                 bigserial PRIMARY KEY,

            invoice_item_id    bigint NOT NULL REFERENCES purchase_invoice_items(id) ON DELETE CASCADE,

            batch_number       varchar(120),
            manufacturing_date date,
            expiry_date        date,
            quantity           integer NOT NULL DEFAULT 0,

            is_active          boolean NOT NULL DEFAULT true,
            created_at         timestamp,
            created_by         varchar(255),
            updated_at         timestamp,
            updated_by         varchar(255)
        );

        CREATE INDEX idx_pi_item_batch_invoice_item ON purchase_invoice_item_batches (invoice_item_id);
        CREATE INDEX idx_pi_item_batch_expiry       ON purchase_invoice_item_batches (expiry_date);

        RAISE NOTICE 'V93: created purchase_invoice_item_batches.';
    END IF;
END $$;

-- batch_master.expiry_date already exists and is already indexed for FEFO selection
-- (idx_batch_master_selection covers product_code, bin_id, status, expiry_date), so nothing is
-- added there. Historical rows keep expiry_date NULL, which BatchSelectionService already treats
-- as non-expiring — existing stock is unaffected by this change.
