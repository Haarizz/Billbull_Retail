-- Per-branch Credit Voucher expiry policy.
--
-- All three columns are nullable and default to NULL on purpose: NULL means "this branch has
-- not chosen a policy", and the resolver then falls back to the global sales.voucher.expiry-months
-- property (12 months). Existing deployments therefore keep issuing exactly the vouchers they
-- issued before this migration ran, with no data backfill required.
ALTER TABLE pos_settings
    ADD COLUMN IF NOT EXISTS credit_voucher_expiry_mode VARCHAR(10),
    ADD COLUMN IF NOT EXISTS credit_voucher_expiry_months INTEGER,
    ADD COLUMN IF NOT EXISTS credit_voucher_expiry_date DATE;
