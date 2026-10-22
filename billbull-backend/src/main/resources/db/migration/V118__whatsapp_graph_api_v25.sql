-- V118 — Move saved WhatsApp settings off Graph API v21.0 and older.
--
-- Meta's version table (developers.facebook.com/docs/graph-api/changelog/versions): v21.0 is
-- available until 21 Jan 2027 and v20.0 and older have expired. v21.0 was the default every
-- settings page saved, so a stored v21.0 is the old default rather than a choice. Those rows,
-- older versions and blank values move to v25.0 (available until 29 Jul 2028), the new default
-- (settings.whatsapp.GraphApiVersion.DEFAULT).
--
-- Left alone: v22.0 and newer, which someone set on purpose and Meta still serves (the settings
-- page warns 90 days before each expires), and any value that is not "vNN.N"-shaped, which the
-- page reports as invalid instead of being guessed at here.
--
-- Idempotent: after one run nothing matches. No row is touched when the table does not exist.
DO $$
BEGIN
    IF to_regclass('public.whatsapp_config') IS NOT NULL THEN
        UPDATE public.whatsapp_config
           SET graph_api_version = 'v25.0'
         WHERE graph_api_version IS NULL
            OR btrim(graph_api_version) = ''
            OR (graph_api_version ~ '^v[0-9]{1,2}\.[0-9]{1,2}$'
                AND split_part(substr(graph_api_version, 2), '.', 1)::int <= 21);
    END IF;
END $$;
