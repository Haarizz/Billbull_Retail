-- Shareable document links ("send on WhatsApp without the Meta API").
--
-- When the WhatsApp Business API is not set up, the send dialog creates one of these and puts its
-- public link (/d/<token>) in the WhatsApp message. The customer opens a page with the document's
-- live summary (amount, paid, balance, status) and the document itself, with a PDF download.
--
-- token_hash  — SHA-256 hex of the random link token; the token itself is never stored.
-- html        — snapshot of the print HTML the user's Download PDF uses, taken when the link is made.
-- pdf         — rendered from html on the first PDF request, then kept.
--
-- Additive and idempotent — no existing data is touched. Hibernate entity:
-- document.share.DocumentShareLink.
DO $$
BEGIN
    IF to_regclass('public.document_share_links') IS NULL THEN
        CREATE TABLE public.document_share_links (
            id                  bigserial     PRIMARY KEY,
            token_hash          varchar(64)   NOT NULL,
            document_type       varchar(40)   NOT NULL,
            document_id         bigint        NOT NULL,
            document_no         varchar(100),
            branch_id           bigint,
            html                text          NOT NULL,
            pdf                 bytea,
            expires_at          timestamp,
            view_count          integer       NOT NULL DEFAULT 0,
            last_viewed_at      timestamp,
            created_at          timestamp,
            created_by          varchar(255),
            created_by_user_id  bigint,
            updated_at          timestamp,
            updated_by          varchar(255),
            is_active           boolean       NOT NULL DEFAULT true
        );
    END IF;

    CREATE UNIQUE INDEX IF NOT EXISTS ux_document_share_links_token_hash
        ON public.document_share_links (token_hash);
    CREATE INDEX IF NOT EXISTS ix_document_share_links_document
        ON public.document_share_links (document_type, document_id);
END $$;
