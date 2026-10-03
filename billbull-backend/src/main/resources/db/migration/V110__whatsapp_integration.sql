-- WhatsApp Business (Meta Cloud API) integration.
--
-- whatsapp_config        — single row (id = 1) of tenant settings, same shape as email_config;
--                          one template-name column per document (quotation, sales order, sales invoice).
--                          access_token / app_secret / webhook_verify_token hold EncryptedStringConverter
--                          ciphertext ("enc:v1:..."), hence the wide columns.
-- whatsapp_message_logs  — one row per document sent; webhook status callbacks update it by wamid.
--
-- Additive and idempotent — no existing data is touched. Hibernate entities:
-- settings.whatsapp.WhatsAppConfig / WhatsAppMessageLog.
DO $$
BEGIN
    IF to_regclass('public.whatsapp_config') IS NULL THEN
        CREATE TABLE public.whatsapp_config (
            id                       bigint        PRIMARY KEY,
            enabled                  boolean       DEFAULT false,
            graph_api_version        varchar(20),
            phone_number_id          varchar(64),
            business_account_id      varchar(64),
            access_token             varchar(2048),
            app_secret               varchar(512),
            webhook_verify_token     varchar(512),
            default_country_code     varchar(5),
            quotation_template_name     varchar(512),
            sales_order_template_name   varchar(512),
            sales_invoice_template_name varchar(512),
            template_language           varchar(15)
        );
    END IF;

    -- Per-document template columns, also for a whatsapp_config that Hibernate auto-DDL
    -- created before this script ran.
    ALTER TABLE public.whatsapp_config ADD COLUMN IF NOT EXISTS sales_order_template_name varchar(512);
    ALTER TABLE public.whatsapp_config ADD COLUMN IF NOT EXISTS sales_invoice_template_name varchar(512);

    IF to_regclass('public.whatsapp_message_logs') IS NULL THEN
        CREATE TABLE public.whatsapp_message_logs (
            id                 bigserial     PRIMARY KEY,
            document_type      varchar(40)   NOT NULL,
            document_id        bigint,
            document_no        varchar(100),
            branch_id          bigint,
            to_phone           varchar(20)   NOT NULL,
            template_name      varchar(512),
            wamid              varchar(128),
            status             varchar(20)   NOT NULL,
            error_code         integer,
            error_message      varchar(1000),
            status_updated_at  timestamp,
            created_at         timestamp,
            created_by         varchar(255),
            created_by_user_id bigint,
            updated_at         timestamp,
            updated_by         varchar(255),
            is_active          boolean       NOT NULL DEFAULT true
        );

        -- "Send history" on a document.
        CREATE INDEX idx_whatsapp_msg_document
            ON public.whatsapp_message_logs (document_type, document_id);

        -- Webhook lookups; NULL wamids (failed before Meta accepted) are allowed to repeat.
        CREATE UNIQUE INDEX uq_whatsapp_msg_wamid
            ON public.whatsapp_message_logs (wamid);
    END IF;
END $$;
