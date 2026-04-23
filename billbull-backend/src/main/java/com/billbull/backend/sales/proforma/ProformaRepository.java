package com.billbull.backend.sales.proforma;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.math.BigDecimal;
import java.util.List;

public interface ProformaRepository extends JpaRepository<ProformaInvoice, Long> {
    List<ProformaInvoice> findByStatus(ProformaStatus status);

    @Query("""
            SELECT pi_item.itemCode, COALESCE(SUM(pi_item.quantity), 0)
            FROM ProformaInvoice pi JOIN pi.items pi_item
            WHERE pi_item.itemCode IN :productCodes
              AND pi.status = com.billbull.backend.sales.proforma.ProformaStatus.ISSUED
            GROUP BY pi_item.itemCode
        """)
    List<Object[]> sumReservedQuantityForProducts(@Param("productCodes") List<String> productCodes);

    @Query("""
            SELECT COALESCE(SUM(pi_item.quantity), 0)
            FROM ProformaInvoice pi JOIN pi.items pi_item
            WHERE pi_item.itemCode = :productCode
              AND pi.status = com.billbull.backend.sales.proforma.ProformaStatus.ISSUED
        """)
    BigDecimal sumReservedQuantity(@Param("productCode") String productCode);
}
