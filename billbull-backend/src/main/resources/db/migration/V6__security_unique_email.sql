-- V6 — Security: enforce a unique, case-insensitive email for active users (ARCHFIX P0 §1.4 / S3).
--
-- The login flow falls back to findByEmailAndIsActiveTrue, so duplicate active emails make
-- login non-deterministic. A partial unique index on lower(email) over active rows enforces
-- uniqueness without blocking historical/soft-deleted rows that may share an email.
--
-- Guarded so it no-ops on a fresh DB (Flyway runs before Hibernate creates the table).
-- NOT created CONCURRENTLY because Flyway wraps this in a transaction; the users table is
-- small so the brief lock is acceptable. If a tenant already has duplicate active emails this
-- will fail — clean those up first (see the diagnostic query in the comment below).
--
--   SELECT lower(email), count(*) FROM users WHERE is_active = true AND email IS NOT NULL
--   GROUP BY lower(email) HAVING count(*) > 1;

DO $$
BEGIN
    IF to_regclass('public.users') IS NOT NULL THEN
        CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_active
            ON users (lower(email))
            WHERE is_active = true AND email IS NOT NULL;
    END IF;
END $$;
