package com.billbull.backend.pos.pinlogin;

import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * One-off, idempotent: before V133 the till PIN sat in employees.pos_pin as plain text (and was
 * returned by the employee API). On boot, hash every such PIN into pos_pin_hash and blank the
 * plain column. A legacy PIN that breaks today's rules is hashed anyway — rejecting it here would
 * silently lock that cashier out; HR can replace it from the employee form.
 */
@Component
public class PosPinMigrationRunner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(PosPinMigrationRunner.class);

    private final JdbcTemplate jdbc;
    private final PosPinPolicy pinPolicy;

    public PosPinMigrationRunner(JdbcTemplate jdbc, PosPinPolicy pinPolicy) {
        this.jdbc = jdbc;
        this.pinPolicy = pinPolicy;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        Integer columns = jdbc.queryForObject(
                "SELECT count(*) FROM information_schema.columns WHERE table_schema = current_schema() "
                        + "AND table_name = 'employees' AND column_name IN ('pos_pin', 'pos_pin_hash')",
                Integer.class);
        if (columns == null || columns < 2) {
            return; // fresh database (no legacy column) or migration not applied yet
        }

        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT id, pos_pin FROM employees WHERE pos_pin IS NOT NULL AND pos_pin <> ''");
        for (Map<String, Object> row : rows) {
            String pin = String.valueOf(row.get("pos_pin")).trim();
            Long id = ((Number) row.get("id")).longValue();
            if (pin.isEmpty()) {
                jdbc.update("UPDATE employees SET pos_pin = NULL WHERE id = ?", id);
                continue;
            }
            // encodeUnchecked, not hash(): see class comment.
            jdbc.update("UPDATE employees SET pos_pin_length = CASE WHEN pos_pin_hash IS NULL THEN ? ELSE pos_pin_length END, "
                            + "pos_pin_hash = COALESCE(pos_pin_hash, ?), pos_pin = NULL WHERE id = ?",
                    pin.length(), pinPolicy.encodeUnchecked(pin), id);
        }
        if (!rows.isEmpty()) {
            log.info("Hashed {} legacy plain-text POS PIN(s) into employees.pos_pin_hash", rows.size());
        }
    }
}
