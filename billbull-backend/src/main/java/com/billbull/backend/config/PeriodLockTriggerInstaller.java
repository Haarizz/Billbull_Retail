package com.billbull.backend.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Installs a PostgreSQL trigger that enforces the accounting period lock at the
 * database level (PDF §25 / F-18 / ARCHGAP-004).
 *
 * The trigger fires BEFORE INSERT OR UPDATE on journal_entries and raises an
 * exception if the entry date falls in a closed period. This prevents any
 * direct SQL bypass of the application-layer period lock in
 * AccountingPeriodService.assertOpen().
 *
 * Idempotent: uses CREATE OR REPLACE so re-running on startup is safe.
 *
 * Runs at Order 10 (after all seeders).
 */
@Component
@Order(10)
@Slf4j
public class PeriodLockTriggerInstaller implements ApplicationRunner {

    private final JdbcTemplate jdbc;

    public PeriodLockTriggerInstaller(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            installPeriodLockTrigger();
            log.info("[PeriodLockTrigger] DB-level period lock trigger installed/refreshed.");
        } catch (Exception e) {
            // Non-fatal: the application still has the service-layer guard.
            // Log the error so it can be investigated without blocking startup.
            log.warn("[PeriodLockTrigger] Could not install period lock trigger: {}", e.getMessage());
        }
    }

    private void installPeriodLockTrigger() {
        // 1. Create (or replace) the trigger function
        jdbc.execute("""
            CREATE OR REPLACE FUNCTION enforce_period_lock()
            RETURNS TRIGGER AS $$
            DECLARE
                v_closed_count INTEGER;
            BEGIN
                -- Check if the entry date falls inside any closed accounting period
                SELECT COUNT(*)
                INTO   v_closed_count
                FROM   accounting_periods
                WHERE  status = 'Closed'
                  AND  NEW.date BETWEEN start_date AND end_date;

                IF v_closed_count > 0 THEN
                    RAISE EXCEPTION
                        'PERIOD_LOCKED: Posting date % falls in a closed accounting period.',
                        NEW.date
                        USING ERRCODE = 'P0001';
                END IF;

                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
            """);

        // 2. Drop old trigger if it exists, then recreate (idempotent pattern for pre-PG14)
        jdbc.execute("""
            DROP TRIGGER IF EXISTS trg_period_lock ON journal_entries;
            """);

        jdbc.execute("""
            CREATE TRIGGER trg_period_lock
            BEFORE INSERT OR UPDATE OF date
            ON journal_entries
            FOR EACH ROW
            EXECUTE FUNCTION enforce_period_lock();
            """);

        // 3. Same guard on ledger_entries (direct SQL inserts would bypass journal flow)
        jdbc.execute("""
            DROP TRIGGER IF EXISTS trg_period_lock ON ledger_entries;
            """);

        jdbc.execute("""
            CREATE TRIGGER trg_period_lock
            BEFORE INSERT OR UPDATE OF transaction_date
            ON ledger_entries
            FOR EACH ROW
            EXECUTE FUNCTION enforce_period_lock_ledger();
            """);

        jdbc.execute("""
            CREATE OR REPLACE FUNCTION enforce_period_lock_ledger()
            RETURNS TRIGGER AS $$
            DECLARE
                v_closed_count INTEGER;
            BEGIN
                SELECT COUNT(*)
                INTO   v_closed_count
                FROM   accounting_periods
                WHERE  status = 'Closed'
                  AND  NEW.transaction_date BETWEEN start_date AND end_date;

                IF v_closed_count > 0 THEN
                    RAISE EXCEPTION
                        'PERIOD_LOCKED: Ledger entry date % falls in a closed accounting period.',
                        NEW.transaction_date
                        USING ERRCODE = 'P0001';
                END IF;

                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
            """);
    }
}
