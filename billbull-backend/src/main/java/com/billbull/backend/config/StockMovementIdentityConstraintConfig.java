package com.billbull.backend.config;

import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;

@Configuration
public class StockMovementIdentityConstraintConfig {

    @Bean
    public CommandLineRunner ensureStockMovementIdentityConstraints(JdbcTemplate jdbcTemplate) {
        return args -> {
            try {
                dropLegacySourceProductUniqueConstraints(jdbcTemplate);
                jdbcTemplate.execute("""
                        CREATE UNIQUE INDEX IF NOT EXISTS ux_sm_outbound_source_identity
                        ON stock_movements (
                            source_type,
                            source_id,
                            product_id,
                            warehouse_id,
                            bin_id,
                            batch_number,
                            expiry_date
                        )
                        NULLS NOT DISTINCT
                        WHERE quantity < 0
                        """);
            } catch (Exception e) {
                System.err.println("Error ensuring stock movement identity constraints: " + e.getMessage());
            }
        };
    }

    private void dropLegacySourceProductUniqueConstraints(JdbcTemplate jdbcTemplate) {
        List<String> constraints = jdbcTemplate.queryForList("""
                SELECT c.conname
                FROM pg_constraint c
                JOIN pg_class t ON t.oid = c.conrelid
                WHERE t.relname = 'stock_movements'
                  AND c.contype = 'u'
                  AND (
                      SELECT string_agg(a.attname, ',' ORDER BY cols.ord)
                      FROM unnest(c.conkey) WITH ORDINALITY AS cols(attnum, ord)
                      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = cols.attnum
                  ) = 'source_type,source_id,product_id'
                """, String.class);

        for (String constraint : constraints) {
            jdbcTemplate.execute("ALTER TABLE stock_movements DROP CONSTRAINT IF EXISTS " + quoteIdentifier(constraint));
        }

        List<String> indexes = jdbcTemplate.queryForList("""
                SELECT indexname
                FROM pg_indexes
                WHERE tablename = 'stock_movements'
                  AND indexdef ILIKE 'CREATE UNIQUE INDEX%'
                  AND indexdef ILIKE '%(source_type, source_id, product_id)%'
                """, String.class);

        for (String index : indexes) {
            jdbcTemplate.execute("DROP INDEX IF EXISTS " + quoteIdentifier(index));
        }
    }

    private String quoteIdentifier(String identifier) {
        if (identifier == null || !identifier.matches("[A-Za-z0-9_]+")) {
            throw new IllegalArgumentException("Unsafe database identifier: " + identifier);
        }
        return "\"" + identifier + "\"";
    }
}
