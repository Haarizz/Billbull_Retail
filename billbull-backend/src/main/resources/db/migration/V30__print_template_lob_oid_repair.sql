-- Repairs pre-existing data corruption on print_templates: @Lob on a String field
-- (removed in this same release) made Hibernate store PostgreSQL Large Object OIDs
-- in header_content/terms_content/footer_content/display_options/columns_config
-- instead of the actual text — the column held a small OID number, and the real
-- content was written into pg_largeobject via that OID. No data was lost; this
-- migration reads the real content back via lo_get() and rewrites each affected
-- column as plain text, then cleans up the now-unreferenced large objects.
--
-- Guarded to only touch values that are (a) purely numeric and (b) a real,
-- existing entry in pg_largeobject_metadata — a genuine legacy TEXT value that
-- merely happens to look numeric is never touched, since it won't have a matching
-- large object OID.

DO $$
DECLARE
    col text;
    rec RECORD;
    recovered text;
BEGIN
    FOREACH col IN ARRAY ARRAY['header_content', 'terms_content', 'footer_content', 'display_options', 'columns_config']
    LOOP
        FOR rec IN EXECUTE format(
            'SELECT id, %I AS raw_value FROM print_templates WHERE %I ~ ''^[0-9]+$''',
            col, col
        )
        LOOP
            IF EXISTS (SELECT 1 FROM pg_largeobject_metadata WHERE oid = rec.raw_value::oid) THEN
                BEGIN
                    recovered := convert_from(lo_get(rec.raw_value::oid), 'UTF8');
                    EXECUTE format('UPDATE print_templates SET %I = $1 WHERE id = $2', col)
                        USING recovered, rec.id;
                    PERFORM lo_unlink(rec.raw_value::oid);
                EXCEPTION WHEN OTHERS THEN
                    RAISE WARNING 'print_templates.% repair failed for id=% (oid=%): %', col, rec.id, rec.raw_value, SQLERRM;
                END;
            END IF;
        END LOOP;
    END LOOP;
END $$;
