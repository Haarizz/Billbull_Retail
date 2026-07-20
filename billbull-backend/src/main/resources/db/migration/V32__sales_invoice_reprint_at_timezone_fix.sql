-- V31 stored last_reprinted_at as a naive TIMESTAMP, populated via the JVM's
-- LocalDateTime.now() (server wall-clock, effectively Asia/Dubai — see
-- spring.jackson.time-zone). Because the value carried no zone/offset, the
-- frontend re-displayed those raw digits as if they were already the
-- viewer's own local time, so a reprint done from India still showed Dubai's
-- wall clock instead of India's. Convert to TIMESTAMPTZ (a real UTC instant)
-- so every viewer's browser converts it to their own local time correctly.
ALTER TABLE sales_invoices
    ALTER COLUMN last_reprinted_at TYPE TIMESTAMPTZ
    USING (last_reprinted_at AT TIME ZONE 'Asia/Dubai');
