package com.billbull.backend.sales.proforma;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.math.BigDecimal;
import java.util.List;

public interface ProformaRepository extends JpaRepository<ProformaInvoice, Long> {
    List<ProformaInvoice> findByStatus(ProformaStatus status);

    List<ProformaInvoice> findByPiDateBetween(java.time.LocalDate from, java.time.LocalDate to);

    boolean existsByPiNumber(String piNumber);

    @Query("SELECT pi.piNumber FROM ProformaInvoice pi WHERE pi.piNumber LIKE CONCAT(:prefix, '%')")
    List<String> findPiNumbersByPrefix(@Param("prefix") String prefix);

    // Once a delivery note exists against a proforma the DN takes over the reservation,
    // so these queries exclude proformas that have an active (non-cancelled) DN.
    // This mirrors the SalesOrderRepository pattern where INVOICED SOs are excluded.

    @Query("""
            SELECT p.id, COALESCE(SUM(pi_item.quantity * COALESCE(pp.conversion, 1)), 0)
            FROM ProformaInvoice pi JOIN pi.items pi_item
            JOIN com.billbull.backend.inventory.product.Product p
                ON p.code = pi_item.itemCode AND p.isActive = true
            LEFT JOIN com.billbull.backend.inventory.product.ProductPacking pp
                ON pp.product.id = p.id AND LOWER(pp.unit.name) = LOWER(pi_item.unit) AND pp.isActive = true
            WHERE pi_item.itemCode IN :productCodes
              AND pi.status = com.billbull.backend.sales.proforma.ProformaStatus.ISSUED
              AND NOT EXISTS (
                SELECT 1 FROM com.billbull.backend.sales.delivery.DeliveryNote dn
                WHERE dn.proformaNo = pi.piNumber
                  AND dn.status <> com.billbull.backend.sales.delivery.DeliveryNoteStatus.CANCELLED
              )
            GROUP BY p.id
        """)
    List<Object[]> sumReservedQuantityForProducts(@Param("productCodes") List<String> productCodes);

    @Query("""
            SELECT p.id, pi.warehouse.id, COALESCE(SUM(pi_item.quantity * COALESCE(pp.conversion, 1)), 0)
            FROM ProformaInvoice pi JOIN pi.items pi_item
            JOIN com.billbull.backend.inventory.product.Product p
                ON p.code = pi_item.itemCode AND p.isActive = true
            LEFT JOIN com.billbull.backend.inventory.product.ProductPacking pp
                ON pp.product.id = p.id AND LOWER(pp.unit.name) = LOWER(pi_item.unit) AND pp.isActive = true
            WHERE pi_item.itemCode IN :productCodes
              AND pi.status = com.billbull.backend.sales.proforma.ProformaStatus.ISSUED
              AND NOT EXISTS (
                SELECT 1 FROM com.billbull.backend.sales.delivery.DeliveryNote dn
                WHERE dn.proformaNo = pi.piNumber
                  AND dn.status <> com.billbull.backend.sales.delivery.DeliveryNoteStatus.CANCELLED
              )
            GROUP BY p.id, pi.warehouse.id
        """)
    List<Object[]> sumReservedQuantityForProductsByWarehouse(@Param("productCodes") List<String> productCodes);

    @Query("""
            SELECT COALESCE(SUM(pi_item.quantity * COALESCE(pp.conversion, 1)), 0)
            FROM ProformaInvoice pi JOIN pi.items pi_item
            JOIN com.billbull.backend.inventory.product.Product p
                ON p.code = pi_item.itemCode AND p.isActive = true
            LEFT JOIN com.billbull.backend.inventory.product.ProductPacking pp
                ON pp.product.id = p.id AND LOWER(pp.unit.name) = LOWER(pi_item.unit) AND pp.isActive = true
            WHERE pi_item.itemCode = :productCode
              AND pi.status = com.billbull.backend.sales.proforma.ProformaStatus.ISSUED
              AND NOT EXISTS (
                SELECT 1 FROM com.billbull.backend.sales.delivery.DeliveryNote dn
                WHERE dn.proformaNo = pi.piNumber
                  AND dn.status <> com.billbull.backend.sales.delivery.DeliveryNoteStatus.CANCELLED
              )
        """)
    BigDecimal sumReservedQuantity(@Param("productCode") String productCode);

    // Returns (itemCode, productId, requiredQtyInBaseUnits) for all items on a proforma.
    // Used to validate available stock before issuing.
    @Query("""
            SELECT pi_item.itemCode, p.id, COALESCE(SUM(pi_item.quantity * COALESCE(pp.conversion, 1)), 0)
            FROM ProformaInvoice pi JOIN pi.items pi_item
            JOIN com.billbull.backend.inventory.product.Product p
                ON p.code = pi_item.itemCode AND p.isActive = true
            LEFT JOIN com.billbull.backend.inventory.product.ProductPacking pp
                ON pp.product.id = p.id AND LOWER(pp.unit.name) = LOWER(pi_item.unit) AND pp.isActive = true
            WHERE pi.id = :proformaId
            GROUP BY pi_item.itemCode, p.id
        """)
    List<Object[]> getRequiredStockByProduct(@Param("proformaId") Long proformaId);
}
