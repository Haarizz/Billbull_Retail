-- V137 — Vendor Price Shares: vendor portal access + vendor-quoted VAT on LPO lines.
--
--   purchase_rfq_vendors.portal_token        random link secret for /vendor-portal/{token} (one per vendor per RFQ)
--   purchase_rfq_vendors.otp_*               one-time code state: SHA-256 hash, expiry, wrong-guess count, send throttle
--   purchase_rfq_vendors.portal_last_access_at
--   purchase_rfq_portal_sessions             short-lived vendor sessions issued after a correct code (token stored hashed)
--   lpo_items.purchase_tax                   optional per-line VAT % (e.g. the rate a vendor quoted on an RFQ). NULL keeps
--                                            the old behaviour: the product's purchase tax is resolved at read time.
--
-- Additive and idempotent. V136 is the highest version before this.

DO $$
BEGIN
    IF to_regclass('public.purchase_rfq_vendors') IS NOT NULL THEN
        ALTER TABLE purchase_rfq_vendors ADD COLUMN IF NOT EXISTS portal_token VARCHAR(64);
        ALTER TABLE purchase_rfq_vendors ADD COLUMN IF NOT EXISTS otp_hash VARCHAR(64);
        ALTER TABLE purchase_rfq_vendors ADD COLUMN IF NOT EXISTS otp_expires_at TIMESTAMP;
        ALTER TABLE purchase_rfq_vendors ADD COLUMN IF NOT EXISTS otp_attempts INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE purchase_rfq_vendors ADD COLUMN IF NOT EXISTS otp_sent_at TIMESTAMP;
        ALTER TABLE purchase_rfq_vendors ADD COLUMN IF NOT EXISTS otp_window_start TIMESTAMP;
        ALTER TABLE purchase_rfq_vendors ADD COLUMN IF NOT EXISTS otp_send_count INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE purchase_rfq_vendors ADD COLUMN IF NOT EXISTS portal_last_access_at TIMESTAMP;
        CREATE UNIQUE INDEX IF NOT EXISTS ux_purchase_rfq_vendors_portal_token ON purchase_rfq_vendors (portal_token);
    END IF;

    IF to_regclass('public.lpo_items') IS NOT NULL THEN
        ALTER TABLE lpo_items ADD COLUMN IF NOT EXISTS purchase_tax NUMERIC(7, 2);
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS purchase_rfq_portal_sessions (
    id                   BIGSERIAL PRIMARY KEY,
    created_at           TIMESTAMP,
    created_by           VARCHAR(255),
    created_by_user_id   BIGINT,
    updated_at           TIMESTAMP,
    updated_by           VARCHAR(255),
    is_active            BOOLEAN NOT NULL DEFAULT TRUE,
    rfq_vendor_id        BIGINT NOT NULL REFERENCES purchase_rfq_vendors (id) ON DELETE CASCADE,
    token_hash           VARCHAR(64) NOT NULL,
    expires_at           TIMESTAMP NOT NULL,
    client_ip            VARCHAR(64)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_purchase_rfq_portal_sessions_token ON purchase_rfq_portal_sessions (token_hash);
CREATE INDEX IF NOT EXISTS ix_purchase_rfq_portal_sessions_vendor ON purchase_rfq_portal_sessions (rfq_vendor_id);
