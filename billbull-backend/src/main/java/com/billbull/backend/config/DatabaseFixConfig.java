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

                // 1. Fix delivery_notes_status_check
                updateStatusConstraint(jdbcTemplate, "delivery_notes", "delivery_notes_status_check",
                        List.of("DRAFT", "DISPATCHED", "DELIVERED", "CANCELLED"));

                // 2. Fix sales_orders_status_check
                updateStatusConstraint(jdbcTemplate, "sales_orders", "sales_orders_status_check",
                        List.of("DRAFT", "CONFIRMED", "PARTIALLY_PAID", "INVOICED", "DELIVERED", "DISPATCHED"));

                // 3. Fix stock_movements source_type check to include STOCK_TAKE (BB-019)
                updateColumnConstraint(jdbcTemplate, "stock_movements", "stock_movements_source_type_check",
                        "source_type",
                        List.of("LPO", "GRN", "DIRECT_PURCHASE", "DELIVERY_NOTE",
                                "STOCK_TRANSFER_IN", "STOCK_TRANSFER_OUT",
                                "SALES_INVOICE", "CANCELLED", "STOCK_TAKE"));

                System.out.println("Database constraints updated successfully.");
            } catch (Exception e) {
                System.err.println("Failed to update database constraints: " + e.getMessage());
                // Non-fatal error, let app continue
            }
        };
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
