package com.billbull.backend.sales.proforma;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.math.BigDecimal;
import java.util.List;

public interface ProformaRepository extends JpaRepository<ProformaInvoice, Long> {
    List<ProformaInvoice> findByStatus(ProformaStatus status);

    @Query("""
            SELECT p.id, COALESCE(SUM(pi_item.quantity * COALESCE(pp.conversion, 1)), 0)
            FROM ProformaInvoice pi JOIN pi.items pi_item
            JOIN com.billbull.backend.inventory.product.Product p
                ON p.code = pi_item.itemCode AND p.isActive = true
            LEFT JOIN com.billbull.backend.inventory.product.ProductPacking pp
                ON pp.product.id = p.id AND LOWER(pp.unit.name) = LOWER(pi_item.unit) AND pp.isActive = true
            WHERE pi_item.itemCode IN :productCodes
              AND pi.status = com.billbull.backend.sales.proforma.ProformaStatus.ISSUED
            GROUP BY p.id
        """)
    List<Object[]> sumReservedQuantityForProducts(@Param("productCodes") List<String> productCodes);

    @Query("""
            SELECT COALESCE(SUM(pi_item.quantity * COALESCE(pp.conversion, 1)), 0)
            FROM ProformaInvoice pi JOIN pi.items pi_item
            JOIN com.billbull.backend.inventory.product.Product p
                ON p.code = pi_item.itemCode AND p.isActive = true
            LEFT JOIN com.billbull.backend.inventory.product.ProductPacking pp
                ON pp.product.id = p.id AND LOWER(pp.unit.name) = LOWER(pi_item.unit) AND pp.isActive = true
            WHERE pi_item.itemCode = :productCode
              AND pi.status = com.billbull.backend.sales.proforma.ProformaStatus.ISSUED
        """)
    BigDecimal sumReservedQuantity(@Param("productCode") String productCode);
}
