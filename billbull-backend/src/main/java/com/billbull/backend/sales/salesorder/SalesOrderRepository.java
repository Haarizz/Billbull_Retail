package com.billbull.backend.sales.salesorder;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import java.math.BigDecimal;
import java.util.List;

@Repository
public interface SalesOrderRepository extends JpaRepository<SalesOrder, Long> {

  // INVOICED is excluded: once an SO is invoiced its DN (DRAFT/DISPATCHED) tracks
  // the reservation. Counting both would double-reserve the same stock.
  // Quantity is converted to base units using ProductPacking.conversion so that
  // the result is directly comparable to the StockMovement ledger (always in base units).
  @Query("""
          SELECT COALESCE(SUM(si.quantity * COALESCE(pp.conversion, 1)), 0)
          FROM SalesOrder so JOIN so.items si
          JOIN com.billbull.backend.inventory.product.Product p
              ON p.code = si.itemCode AND p.isActive = true
          LEFT JOIN com.billbull.backend.inventory.product.ProductPacking pp
              ON pp.product.id = p.id AND LOWER(pp.unit.name) = LOWER(si.unit) AND pp.isActive = true
          WHERE si.itemCode = :productCode
            AND so.status IN (
              com.billbull.backend.sales.salesorder.SalesOrderStatus.CONFIRMED,
              com.billbull.backend.sales.salesorder.SalesOrderStatus.PARTIALLY_PAID
            )
            AND NOT EXISTS (
              SELECT 1 FROM com.billbull.backend.sales.delivery.DeliveryNote dn
              WHERE dn.salesOrderNo = so.soNumber
                AND dn.status <> com.billbull.backend.sales.delivery.DeliveryNoteStatus.CANCELLED
            )

      """)
  BigDecimal sumReservedQuantity(@Param("productCode") String productCode);

  @Query("""
          SELECT p.id, COALESCE(SUM(si.quantity * COALESCE(pp.conversion, 1)), 0)
          FROM SalesOrder so JOIN so.items si
          JOIN com.billbull.backend.inventory.product.Product p
              ON p.code = si.itemCode AND p.isActive = true
          LEFT JOIN com.billbull.backend.inventory.product.ProductPacking pp
              ON pp.product.id = p.id AND LOWER(pp.unit.name) = LOWER(si.unit) AND pp.isActive = true
          WHERE si.itemCode IN :productCodes
            AND so.status IN (
              com.billbull.backend.sales.salesorder.SalesOrderStatus.CONFIRMED,
              com.billbull.backend.sales.salesorder.SalesOrderStatus.PARTIALLY_PAID
            )
            AND NOT EXISTS (
              SELECT 1 FROM com.billbull.backend.sales.delivery.DeliveryNote dn
              WHERE dn.salesOrderNo = so.soNumber
                AND dn.status <> com.billbull.backend.sales.delivery.DeliveryNoteStatus.CANCELLED
            )

          GROUP BY p.id
      """)
  List<Object[]> sumReservedQuantityForProducts(@Param("productCodes") List<String> productCodes);

  @Query("""
          SELECT p.id, so.warehouse.id, COALESCE(SUM(si.quantity * COALESCE(pp.conversion, 1)), 0)
          FROM SalesOrder so JOIN so.items si
          JOIN com.billbull.backend.inventory.product.Product p
              ON p.code = si.itemCode AND p.isActive = true
          LEFT JOIN com.billbull.backend.inventory.product.ProductPacking pp
              ON pp.product.id = p.id AND LOWER(pp.unit.name) = LOWER(si.unit) AND pp.isActive = true
          WHERE si.itemCode IN :productCodes
            AND so.status IN (
              com.billbull.backend.sales.salesorder.SalesOrderStatus.CONFIRMED,
              com.billbull.backend.sales.salesorder.SalesOrderStatus.PARTIALLY_PAID
            )
            AND NOT EXISTS (
              SELECT 1 FROM com.billbull.backend.sales.delivery.DeliveryNote dn
              WHERE dn.salesOrderNo = so.soNumber
                AND dn.status <> com.billbull.backend.sales.delivery.DeliveryNoteStatus.CANCELLED
            )

          GROUP BY p.id, so.warehouse.id
      """)
  List<Object[]> sumReservedQuantityForProductsByWarehouse(@Param("productCodes") List<String> productCodes);

  java.util.Optional<SalesOrder> findBySoNumber(String soNumber);

  boolean existsBySoNumber(String soNumber);

  @Query("SELECT so.soNumber FROM SalesOrder so WHERE so.soNumber LIKE CONCAT(:prefix, '%')")
  List<String> findSoNumbersByPrefix(@Param("prefix") String prefix);

  boolean existsByCustomerCode(String customerCode);

  /** Sales-report loader: date-bounded orders with line items fetched in one query. */
  @Query("SELECT DISTINCT o FROM SalesOrder o LEFT JOIN FETCH o.items "
          + "WHERE (:dateFrom IS NULL OR o.orderDate >= :dateFrom) "
          + "AND (:dateTo IS NULL OR o.orderDate <= :dateTo)")
  List<SalesOrder> findForReports(@Param("dateFrom") java.time.LocalDate dateFrom,
          @Param("dateTo") java.time.LocalDate dateTo);
}
