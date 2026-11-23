-- Document share links: optional display label, so a POS sale (a SALES_INVOICE row) is shown to
-- the customer as a "Receipt" rather than an "Invoice". Null = the document type's own label.
-- Additive and idempotent. Hibernate entity: document.share.DocumentShareLink.
DO $$
BEGIN
    IF to_regclass('public.document_share_links') IS NOT NULL THEN
        ALTER TABLE public.document_share_links ADD COLUMN IF NOT EXISTS document_label varchar(40);
    END IF;
END $$;
