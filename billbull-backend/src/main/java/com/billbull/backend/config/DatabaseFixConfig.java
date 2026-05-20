package com.billbull.backend.config;

import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;
import java.util.Map;

@Configuration
public class DatabaseFixConfig {

    @Bean
    public CommandLineRunner updateCheckConstraints(JdbcTemplate jdbcTemplate) {
        return args -> {
            try {
                System.out.println("Checking and updating database check constraints for enums...");

                ensureProductSchemaColumns(jdbcTemplate);
                ensureBatchMasterSchemaColumns(jdbcTemplate);

                // 1. Fix delivery_notes_status_check
                updateStatusConstraint(jdbcTemplate, "delivery_notes", "delivery_notes_status_check",
                        List.of("DRAFT", "DISPATCHED", "DELIVERED", "CANCELLED"));

                // 2. Fix sales_orders_status_check — must mirror SalesOrderStatus enum exactly.
                //    PARTIALLY_DELIVERED was missing, breaking SO status sync after a DN
                //    that delivers only some lines (e.g. a mixed stock+service order
                //    where the service line is correctly excluded from the DN).
                updateStatusConstraint(jdbcTemplate, "sales_orders", "sales_orders_status_check",
                        List.of("DRAFT", "CONFIRMED", "PARTIALLY_PAID", "PARTIALLY_DELIVERED",
                                "INVOICED", "DELIVERED", "DISPATCHED"));

                // 3. Fix stock_movements source_type check to include STOCK_TAKE (BB-019)
                //    and STOCK_TAKE_BATCH (per-batch ledger entries posted on approval)
                updateColumnConstraint(jdbcTemplate, "stock_movements", "stock_movements_source_type_check",
                        "source_type",
                        List.of("LPO", "GRN", "DIRECT_PURCHASE", "DELIVERY_NOTE",
                                "STOCK_TRANSFER_IN", "STOCK_TRANSFER_OUT",
                                "SALES_INVOICE", "CANCELLED", "STOCK_TAKE", "STOCK_TAKE_BATCH",
                                "STOCK_TAKE_ADJUSTMENT"));

                ensureStockTakeBatchIdentityConstraint(jdbcTemplate);
                ensureStockTakeBatchSeededColumn(jdbcTemplate);

                System.out.println("Database constraints updated successfully.");
            } catch (Exception e) {
                System.err.println("Failed to update database constraints: " + e.getMessage());
                // Non-fatal error, let app continue
            }
        };
    }

    private void ensureProductSchemaColumns(JdbcTemplate jdbcTemplate) {
        try {
            jdbcTemplate.execute(
                    "ALTER TABLE products ADD COLUMN IF NOT EXISTS expiry_enabled BOOLEAN DEFAULT FALSE");
            jdbcTemplate.execute("UPDATE products SET expiry_enabled = FALSE WHERE expiry_enabled IS NULL");
            jdbcTemplate.execute("ALTER TABLE products ALTER COLUMN expiry_enabled SET DEFAULT FALSE");
            jdbcTemplate.execute("ALTER TABLE products ALTER COLUMN expiry_enabled SET NOT NULL");

            jdbcTemplate.execute(
                    "ALTER TABLE products ADD COLUMN IF NOT EXISTS fefo_enabled BOOLEAN DEFAULT TRUE");
            jdbcTemplate.execute("UPDATE products SET fefo_enabled = TRUE WHERE fefo_enabled IS NULL");
            jdbcTemplate.execute("ALTER TABLE products ALTER COLUMN fefo_enabled SET DEFAULT TRUE");
            jdbcTemplate.execute("ALTER TABLE products ALTER COLUMN fefo_enabled SET NOT NULL");

            jdbcTemplate.execute(
                    "ALTER TABLE products ADD COLUMN IF NOT EXISTS min_expiry_days_for_sale INTEGER DEFAULT 0");
            jdbcTemplate.execute("UPDATE products SET min_expiry_days_for_sale = 0 WHERE min_expiry_days_for_sale IS NULL");
            jdbcTemplate.execute("ALTER TABLE products ALTER COLUMN min_expiry_days_for_sale SET DEFAULT 0");
            jdbcTemplate.execute("ALTER TABLE products ALTER COLUMN min_expiry_days_for_sale SET NOT NULL");
        } catch (Exception e) {
            System.err.println("Error ensuring product schema columns: " + e.getMessage());
        }
    }

    private void ensureBatchMasterSchemaColumns(JdbcTemplate jdbcTemplate) {
        try {
            jdbcTemplate.execute(
                    "ALTER TABLE batch_master ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'AVAILABLE'");
            jdbcTemplate.execute("UPDATE batch_master SET status = 'AVAILABLE' WHERE status IS NULL");
            jdbcTemplate.execute("ALTER TABLE batch_master ALTER COLUMN status SET DEFAULT 'AVAILABLE'");
            jdbcTemplate.execute("ALTER TABLE batch_master ALTER COLUMN status SET NOT NULL");

            jdbcTemplate.execute("ALTER TABLE batch_master ADD COLUMN IF NOT EXISTS manufacturing_date DATE");

            jdbcTemplate.execute("ALTER TABLE batch_master ADD COLUMN IF NOT EXISTS entry_date DATE");
            jdbcTemplate.execute("UPDATE batch_master SET entry_date = generated_date WHERE entry_date IS NULL");

            jdbcTemplate.execute("ALTER TABLE batch_master ADD COLUMN IF NOT EXISTS qty_unit_no INTEGER");
            jdbcTemplate.execute("UPDATE batch_master SET qty_unit_no = unit_index WHERE qty_unit_no IS NULL");
        } catch (Exception e) {
            System.err.println("Error ensuring batch_master phase-3 columns: " + e.getMessage());
        }
    }

    private void ensureStockTakeBatchSeededColumn(JdbcTemplate jdbcTemplate) {
        try {
            jdbcTemplate.execute(
                    "ALTER TABLE stock_take_item_batches ADD COLUMN IF NOT EXISTS seeded BOOLEAN DEFAULT FALSE");
            jdbcTemplate.execute(
                    "UPDATE stock_take_item_batches SET seeded = FALSE WHERE seeded IS NULL");
            jdbcTemplate.execute(
                    "ALTER TABLE stock_take_item_batches ALTER COLUMN seeded SET DEFAULT FALSE");
            jdbcTemplate.execute(
                    "ALTER TABLE stock_take_item_batches ALTER COLUMN seeded SET NOT NULL");
        } catch (Exception e) {
            System.err.println("Error ensuring stock_take_item_batches.seeded column: " + e.getMessage());
        }
    }

    private void ensureStockTakeBatchIdentityConstraint(JdbcTemplate jdbcTemplate) {
        try {
            jdbcTemplate.execute("ALTER TABLE stock_take_item_batches DROP CONSTRAINT IF EXISTS uk_stock_take_item_batch");

            List<Map<String, Object>> constraints = jdbcTemplate.queryForList(
                    "SELECT conname FROM pg_constraint WHERE conname = ?",
                    "uk_stock_take_item_batch_identity");

            if (constraints.isEmpty()) {
                jdbcTemplate.execute("""
                        ALTER TABLE stock_take_item_batches
                        ADD CONSTRAINT uk_stock_take_item_batch_identity
                        UNIQUE (stock_take_item_id, batch_number, expiry_date)
                        """);
            }
        } catch (Exception e) {
            System.err.println("Error ensuring stock take batch identity constraint: " + e.getMessage());
        }
    }

    private void updateStatusConstraint(JdbcTemplate jdbcTemplate, String tableName, String constraintName,
            List<String> allowedValues) {
        updateColumnConstraint(jdbcTemplate, tableName, constraintName, "status", allowedValues);
    }

    private void updateColumnConstraint(JdbcTemplate jdbcTemplate, String tableName, String constraintName,
            String columnName, List<String> allowedValues) {
        try {
            // Check if constraint exists
            List<Map<String, Object>> constraints = jdbcTemplate.queryForList(
                    "SELECT conname FROM pg_constraint WHERE conname = ?", constraintName);

            if (!constraints.isEmpty()) {
                System.out.println("Dropping constraint: " + constraintName);
                jdbcTemplate.execute("ALTER TABLE " + tableName + " DROP CONSTRAINT " + constraintName);
            }

            // Build the CHECK clause
            StringBuilder checkClause = new StringBuilder(columnName + " IN (");
            for (int i = 0; i < allowedValues.size(); i++) {
                checkClause.append("'").append(allowedValues.get(i)).append("'");
                if (i < allowedValues.size() - 1) {
                    checkClause.append(", ");
                }
            }
            checkClause.append(")");

            System.out.println("Adding updated constraint to " + tableName + ": " + checkClause);
            jdbcTemplate.execute(
                    "ALTER TABLE " + tableName + " ADD CONSTRAINT " + constraintName + " CHECK (" + checkClause + ")");

        } catch (Exception e) {
            System.err.println(
                    "Error updating constraint " + constraintName + " on table " + tableName + ": " + e.getMessage());
        }
    }
}
