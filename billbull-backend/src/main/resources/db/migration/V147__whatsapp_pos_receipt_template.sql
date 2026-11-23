-- WhatsApp Business (Meta Cloud API): template for POS receipts, sent from the till's
-- "Share Receipt → WhatsApp". Blank (null) = the till keeps sending a receipt link instead.
-- Additive and idempotent. Hibernate entity: settings.whatsapp.WhatsAppConfig.
DO $$
BEGIN
    IF to_regclass('public.whatsapp_config') IS NOT NULL THEN
        ALTER TABLE public.whatsapp_config ADD COLUMN IF NOT EXISTS pos_receipt_template_name varchar(512);
    END IF;
END $$;
