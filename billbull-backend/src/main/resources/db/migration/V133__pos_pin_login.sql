-- V133 — PIN sign-in for the POS till.
--
-- employees.pos_pin_hash: BCrypt hash of the employee's till PIN. Replaces the plaintext
--   employees.pos_pin column, which PosPinMigrationRunner hashes into pos_pin_hash and then clears
--   on boot (Java does the hashing so the result matches Spring's BCryptPasswordEncoder). The old
--   column is left in place, empty, so older app builds still start.
-- pos_pin_devices: tills an admin has enabled for PIN sign-in. The till keeps a random token;
--   only its SHA-256 is stored here. A PIN is accepted only together with a live device token.
--
-- Additive and idempotent (to_regclass guard, IF NOT EXISTS); V132 is taken by sales_documents_terms_conditions.

DO $$
BEGIN
    IF to_regclass('public.employees') IS NOT NULL THEN
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS pos_pin_hash VARCHAR(100);
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS pos_pin_devices (
    id            BIGSERIAL PRIMARY KEY,
    token_hash    VARCHAR(64)  NOT NULL UNIQUE,
    branch_id     BIGINT       NOT NULL,
    label         VARCHAR(100),
    terminal_id   VARCHAR(50),
    created_by    VARCHAR(100),
    created_at    TIMESTAMP    NOT NULL DEFAULT now(),
    last_used_at  TIMESTAMP,
    revoked_at    TIMESTAMP,
    revoked_by    VARCHAR(100)
);

CREATE INDEX IF NOT EXISTS idx_pos_pin_devices_branch ON pos_pin_devices (branch_id);
