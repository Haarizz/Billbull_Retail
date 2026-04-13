package com.billbull.backend.sales.salesorder;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import java.math.BigDecimal;
import java.util.List;

@Repository
public interface SalesOrderRepository extends JpaRepository<SalesOrder, Long> {

  @Query("""
          SELECT COALESCE(SUM(si.quantity), 0)
          FROM SalesOrder so JOIN so.items si
          WHERE si.itemCode = :productCode
            AND so.status IN (
              com.billbull.backend.sales.salesorder.SalesOrderStatus.CONFIRMED,
              com.billbull.backend.sales.salesorder.SalesOrderStatus.PARTIALLY_PAID,
              com.billbull.backend.sales.salesorder.SalesOrderStatus.INVOICED
            )
      """)
  BigDecimal sumReservedQuantity(@Param("productCode") String productCode);

  @Query("""
          SELECT si.itemCode, COALESCE(SUM(si.quantity), 0)
          FROM SalesOrder so JOIN so.items si
          WHERE si.itemCode IN :productCodes
            AND so.status IN (
              com.billbull.backend.sales.salesorder.SalesOrderStatus.CONFIRMED,
              com.billbull.backend.sales.salesorder.SalesOrderStatus.PARTIALLY_PAID,
              com.billbull.backend.sales.salesorder.SalesOrderStatus.INVOICED
            )
          GROUP BY si.itemCode
      """)
  List<Object[]> sumReservedQuantityForProducts(@Param("productCodes") List<String> productCodes);

  java.util.Optional<SalesOrder> findBySoNumber(String soNumber);

  boolean existsByCustomerCode(String customerCode);
}
