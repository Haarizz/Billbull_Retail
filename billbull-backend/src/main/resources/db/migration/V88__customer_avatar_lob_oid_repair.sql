-- Repairs customers.avatar, which was mapped with @Lob on a String field (removed in this
-- same release). On PostgreSQL that makes Hibernate store the value as a Large Object and
-- read it back through the large-object API, which requires an open transaction — so every
-- Customer load outside one failed with "Unable to access lob stream" (caused by
-- "Large Objects may not be used in auto-commit mode"). That is what broke
-- GET /api/pos/checkout/deliveries, whose customer-contact lookup loads Customer rows.
--
-- Two shapes are handled, so the script is correct whichever mapping a tenant DB was
-- created with:
--   a) the column is `oid`      — Hibernate created it; rewrite it as TEXT, pulling the real
--                                 content back out of pg_largeobject first.
--   b) the column is text-ish   — but rows written while @Lob was active hold the OID number
--                                 instead of the content (same shape as V30 on print_templates).
-- Dangling OIDs (a dump/restore that dropped large objects) simply become NULL — there is
-- nothing left to recover, and an avatar is cosmetic. Real content is never discarded.

DO $$
DECLARE
    coltype text;
    rec RECORD;
    recovered text;
BEGIN
    IF to_regclass('public.customers') IS NULL THEN
        RETURN;
    END IF;

    SELECT format_type(a.atttypid, a.atttypmod) INTO coltype
    FROM pg_attribute a
    WHERE a.attrelid = to_regclass('public.customers')
      AND a.attname = 'avatar'
      AND a.attnum > 0
      AND NOT a.attisdropped;

    IF coltype IS NULL THEN
        RETURN;
    END IF;

    IF coltype = 'oid' THEN
        ALTER TABLE customers ADD COLUMN avatar_text text;

        FOR rec IN SELECT id, avatar AS lo_oid FROM customers WHERE avatar IS NOT NULL LOOP
            IF EXISTS (SELECT 1 FROM pg_largeobject_metadata WHERE oid = rec.lo_oid) THEN
                BEGIN
                    recovered := convert_from(lo_get(rec.lo_oid), 'UTF8');
                    UPDATE customers SET avatar_text = recovered WHERE id = rec.id;
                    PERFORM lo_unlink(rec.lo_oid);
                EXCEPTION WHEN OTHERS THEN
                    RAISE WARNING 'customers.avatar recovery failed for id=% (oid=%): %',
                        rec.id, rec.lo_oid, SQLERRM;
                END;
            END IF;
        END LOOP;

        ALTER TABLE customers DROP COLUMN avatar;
        ALTER TABLE customers RENAME COLUMN avatar_text TO avatar;
    ELSE
        -- Widen a legacy varchar(n) first: a recovered avatar is a base64 data URL and
        -- would not fit, and the entity now declares TEXT (ddl-auto=update never widens).
        IF coltype LIKE 'character varying%' THEN
            ALTER TABLE customers ALTER COLUMN avatar TYPE text;
        END IF;

        FOR rec IN SELECT id, avatar AS raw_value FROM customers WHERE avatar ~ '^[0-9]+$' LOOP
            IF EXISTS (SELECT 1 FROM pg_largeobject_metadata WHERE oid = rec.raw_value::oid) THEN
                BEGIN
                    recovered := convert_from(lo_get(rec.raw_value::oid), 'UTF8');
                    UPDATE customers SET avatar = recovered WHERE id = rec.id;
                    PERFORM lo_unlink(rec.raw_value::oid);
                EXCEPTION WHEN OTHERS THEN
                    RAISE WARNING 'customers.avatar repair failed for id=% (oid=%): %',
                        rec.id, rec.raw_value, SQLERRM;
                END;
            END IF;
        END LOOP;
    END IF;
END $$;
