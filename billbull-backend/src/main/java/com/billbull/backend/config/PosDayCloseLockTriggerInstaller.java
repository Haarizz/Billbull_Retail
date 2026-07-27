package com.billbull.backend.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Installs a PostgreSQL trigger that makes {@code pos_day_closes} rows immutable at
 * the database level, formalizing what is already true in application code (no
 * service path ever updates or deletes a saved Z-Report snapshot). Every row is
 * immutable from the moment it's inserted, so the trigger rejects UPDATE/DELETE
 * unconditionally — no date-range check needed, unlike the accounting period lock.
 *
 * Idempotent: uses CREATE OR REPLACE so re-running on startup is safe.
 * Modeled directly on {@link PeriodLockTriggerInstaller}.
 *
 * Runs at Order 10 (after all seeders).
 */
@Component
@Order(10)
@Slf4j
public class PosDayCloseLockTriggerInstaller implements ApplicationRunner {

    private final JdbcTemplate jdbc;

    public PosDayCloseLockTriggerInstaller(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            installTrigger();
            log.info("[PosDayCloseLockTrigger] DB-level Z-Report immutability trigger installed/refreshed.");
        } catch (Exception e) {
            // Non-fatal: the application already never updates/deletes a saved
            // PosDayClose row. Log so it can be investigated without blocking startup.
            log.warn("[PosDayCloseLockTrigger] Could not install pos_day_closes lock trigger: {}", e.getMessage());
        }
    }

    private void installTrigger() {
        jdbc.execute("""
            CREATE OR REPLACE FUNCTION enforce_pos_day_close_immutable()
            RETURNS TRIGGER AS $$
            BEGIN
                RAISE EXCEPTION
                    'DAY_CLOSE_IMMUTABLE: pos_day_closes rows cannot be modified or deleted once created.'
                    USING ERRCODE = 'P0001';
            END;
            $$ LANGUAGE plpgsql;
            """);

        jdbc.execute("DROP TRIGGER IF EXISTS trg_pos_day_close_immutable ON pos_day_closes;");

        jdbc.execute("""
            CREATE TRIGGER trg_pos_day_close_immutable
            BEFORE UPDATE OR DELETE
            ON pos_day_closes
            FOR EACH ROW
            EXECUTE FUNCTION enforce_pos_day_close_immutable();
            """);
    }
}
