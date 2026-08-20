package com.billbull.backend.inventory.reports.reconciliation;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;
import java.util.Map;

@Service
@Transactional(readOnly = true)
public class HistoricalReconciliationService {

    private final JdbcTemplate jdbcTemplate;

    public HistoricalReconciliationService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    /**
     * HISTORICAL RECONCILIATION - DRY RUN
     * Identifies historical DELIVERED delivery notes where the physical stock deduction
     * was silently clamped and lost due to the negativeOverride bug.
     *
     * It compares the requested base quantity (current_qty + foc) against the absolute sum
     * of recorded stock movements.
     */
    public List<Map<String, Object>> identifyMissingNegativeStockMovements() {
        String sql = """
            SELECT 
                dn.dn_number AS "dnNumber",
                dn.status AS "status",
                dn.branch_name AS "branch",
                w.name AS "warehouse",
                p.code AS "productCode",
                p.name AS "productName",
                -- Base quantity calculation
                SUM(COALESCE(dni.current_qty, 0) + COALESCE(dni.foc, 0)) AS "expectedQty",
                ABS(COALESCE(SUM(sm.quantity), 0)) AS "recordedQty",
                (SUM(COALESCE(dni.current_qty, 0) + COALESCE(dni.foc, 0)) - ABS(COALESCE(SUM(sm.quantity), 0))) AS "missingQty",
                'Silently clamped negative stock' AS "reason",
                'STOCK_TAKE_ADJUSTMENT or MANUAL_MOVEMENT for missingQty' AS "proposedRepair"
            FROM 
                delivery_note_items dni
            JOIN 
                delivery_notes dn ON dn.id = dni.delivery_note_id
            JOIN 
                products p ON p.id = dni.product_id
            JOIN 
                warehouses w ON w.id = dn.warehouse_id
            LEFT JOIN 
                stock_movements sm ON sm.source_id = dn.id 
                                   AND sm.source_type = 'DELIVERY_NOTE' 
                                   AND sm.product_id = dni.product_id
            WHERE 
                dn.status = 'DELIVERED'
            GROUP BY 
                dn.id, dn.dn_number, dn.status, dn.branch_name, w.name, p.code, p.name
            HAVING 
                SUM(COALESCE(dni.current_qty, 0) + COALESCE(dni.foc, 0)) > ABS(COALESCE(SUM(sm.quantity), 0))
            ORDER BY 
                dn.id DESC
        """;

        return jdbcTemplate.queryForList(sql);
    }
}
