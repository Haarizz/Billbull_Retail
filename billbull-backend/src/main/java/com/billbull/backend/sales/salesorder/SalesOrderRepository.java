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
              com.billbull.backend.sales.salesorder.SalesOrderStatus.PARTIALLY_PAID,
              com.billbull.backend.sales.salesorder.SalesOrderStatus.FULLY_PAID
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
              com.billbull.backend.sales.salesorder.SalesOrderStatus.PARTIALLY_PAID,
              com.billbull.backend.sales.salesorder.SalesOrderStatus.FULLY_PAID
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
              com.billbull.backend.sales.salesorder.SalesOrderStatus.PARTIALLY_PAID,
              com.billbull.backend.sales.salesorder.SalesOrderStatus.FULLY_PAID
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

  List<SalesOrder> findByOrderDateBetween(java.time.LocalDate from, java.time.LocalDate to);

  @Query("SELECT COALESCE(SUM(o.orderTotal), 0) FROM SalesOrder o WHERE o.orderDate = :date AND o.status <> com.billbull.backend.sales.salesorder.SalesOrderStatus.DRAFT")
  Double sumOrderTotalForDate(@Param("date") java.time.LocalDate date);

  @Query("SELECT COALESCE(SUM(o.orderTotal), 0) FROM SalesOrder o WHERE o.orderDate BETWEEN :from AND :to AND o.status <> com.billbull.backend.sales.salesorder.SalesOrderStatus.DRAFT")
  Double sumOrderTotalBetween(@Param("from") java.time.LocalDate from, @Param("to") java.time.LocalDate to);

  @Query("SELECT COUNT(o) FROM SalesOrder o WHERE o.orderDate BETWEEN :from AND :to")
  long countBetween(@Param("from") java.time.LocalDate from, @Param("to") java.time.LocalDate to);

  @Query("SELECT COUNT(o) FROM SalesOrder o WHERE o.orderDate BETWEEN :from AND :to AND o.status = com.billbull.backend.sales.salesorder.SalesOrderStatus.CONFIRMED")
  long countConfirmedBetween(@Param("from") java.time.LocalDate from, @Param("to") java.time.LocalDate to);

  @Query("SELECT COALESCE(SUM(o.orderTotal - o.advanceAmount), 0) FROM SalesOrder o WHERE o.status IN (com.billbull.backend.sales.salesorder.SalesOrderStatus.CONFIRMED, com.billbull.backend.sales.salesorder.SalesOrderStatus.PARTIALLY_PAID, com.billbull.backend.sales.salesorder.SalesOrderStatus.FULLY_PAID)")
  Double sumOutstandingBalance();

  long countByStatusIn(java.util.Collection<SalesOrderStatus> statuses);

  /** Sales-report loader: date-bounded orders with line items fetched in one query. */
  @Query("SELECT DISTINCT o FROM SalesOrder o LEFT JOIN FETCH o.items WHERE o.orderDate >= :dateFrom AND o.orderDate <= :dateTo")
  List<SalesOrder> findForReportsBounded(@Param("dateFrom") java.time.LocalDate dateFrom, @Param("dateTo") java.time.LocalDate dateTo);

  @Query("SELECT DISTINCT o FROM SalesOrder o LEFT JOIN FETCH o.items WHERE o.orderDate >= :dateFrom")
  List<SalesOrder> findForReportsFromDate(@Param("dateFrom") java.time.LocalDate dateFrom);

  @Query("SELECT DISTINCT o FROM SalesOrder o LEFT JOIN FETCH o.items WHERE o.orderDate <= :dateTo")
  List<SalesOrder> findForReportsToDate(@Param("dateTo") java.time.LocalDate dateTo);

  @Query("SELECT DISTINCT o FROM SalesOrder o LEFT JOIN FETCH o.items")
  List<SalesOrder> findForReportsAll();

  default List<SalesOrder> findForReports(java.time.LocalDate dateFrom, java.time.LocalDate dateTo) {
      if (dateFrom != null && dateTo != null) return findForReportsBounded(dateFrom, dateTo);
      if (dateFrom != null) return findForReportsFromDate(dateFrom);
      if (dateTo != null) return findForReportsToDate(dateTo);
      return findForReportsAll();
  }
}
