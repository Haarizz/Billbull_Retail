-- V117 — SMTP security mode on email_config (STARTTLS or SSL).
--
-- email_config was created by Hibernate auto-DDL (no earlier script builds it), so the column
-- is added only when the table exists. Existing rows keep NULL: the application reads NULL as
-- "SSL on port 465, otherwise STARTTLS" (SmtpSecurity.resolve), which is exactly how those rows
-- were sent before this change, and writes the explicit value on the next save.
--
-- Additive and idempotent. Hibernate entity: settings.email.EmailConfig.
DO $$
BEGIN
    IF to_regclass('public.email_config') IS NOT NULL THEN
        ALTER TABLE public.email_config ADD COLUMN IF NOT EXISTS smtp_security varchar(16);
    END IF;
END $$;
