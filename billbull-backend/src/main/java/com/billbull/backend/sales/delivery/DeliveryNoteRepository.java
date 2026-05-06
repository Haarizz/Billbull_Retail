package com.billbull.backend.sales.delivery;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.math.BigDecimal;
import java.util.List;

public interface DeliveryNoteRepository extends JpaRepository<DeliveryNote, Long> {
  // Sums DN items for proforma-backed notes by productId, converting to base units via ProductPacking.
  // Used to deduct PI-level reservations already covered by an active DN (deduplication).
  @Query("""
          SELECT i.product.id, COALESCE(SUM(i.currentQty * COALESCE(pp.conversion, 1)), 0)
          FROM DeliveryNote dn JOIN dn.items i
          LEFT JOIN com.billbull.backend.inventory.product.ProductPacking pp
              ON pp.product.id = i.product.id AND LOWER(pp.unit.name) = LOWER(i.unit) AND pp.isActive = true
          WHERE i.product.id IN :productIds
            AND dn.proformaNo IS NOT NULL
            AND dn.status IN ('DRAFT', 'DISPATCHED')
          GROUP BY i.product.id
      """)
  List<Object[]> sumReservedQtyForProformasByProduct(@Param("productIds") List<Long> productIds);

  @Query("""
          SELECT COALESCE(SUM(i.currentQty * COALESCE(pp.conversion, 1)), 0)
          FROM DeliveryNote dn JOIN dn.items i
          LEFT JOIN com.billbull.backend.inventory.product.ProductPacking pp
              ON pp.product.id = i.product.id AND LOWER(pp.unit.name) = LOWER(i.unit) AND pp.isActive = true
          WHERE i.product.id = :productId
            AND dn.warehouse.id = :warehouseId
            AND dn.status IN ('DRAFT', 'DISPATCHED')
      """)
  BigDecimal sumReservedQtyInDispatchedNotes(
      @Param("productId") Long productId,
      @Param("warehouseId") Long warehouseId);

  @Query("""
          SELECT COALESCE(SUM(i.currentQty * COALESCE(pp.conversion, 1)), 0)
          FROM DeliveryNote dn JOIN dn.items i
          LEFT JOIN com.billbull.backend.inventory.product.ProductPacking pp
              ON pp.product.id = i.product.id AND LOWER(pp.unit.name) = LOWER(i.unit) AND pp.isActive = true
          WHERE dn.sourceDocumentType = :sourceDocumentType
            AND dn.sourceDocumentId = :sourceDocumentId
            AND i.product.id = :productId
            AND (:warehouseId IS NULL OR dn.warehouse.id = :warehouseId)
            AND dn.status IN ('DRAFT', 'DISPATCHED')
      """)
  BigDecimal sumReservedQtyForSourceDocument(
      @Param("sourceDocumentType") String sourceDocumentType,
      @Param("sourceDocumentId") Long sourceDocumentId,
      @Param("productId") Long productId,
      @Param("warehouseId") Long warehouseId);

  @Query("""
          SELECT COALESCE(SUM(i.currentQty * COALESCE(pp.conversion, 1)), 0)
          FROM DeliveryNote dn JOIN dn.items i
          LEFT JOIN com.billbull.backend.inventory.product.ProductPacking pp
              ON pp.product.id = i.product.id AND LOWER(pp.unit.name) = LOWER(i.unit) AND pp.isActive = true
          WHERE i.product.id = :productId
            AND dn.warehouse.id = :warehouseId
            AND i.binId IS NULL
            AND dn.status IN ('DRAFT', 'DISPATCHED')
      """)
  BigDecimal sumUnassignedReservedQtyInDispatchedNotes(
      @Param("productId") Long productId,
      @Param("warehouseId") Long warehouseId);

  @Query("""
          SELECT COALESCE(SUM(i.currentQty * COALESCE(pp.conversion, 1)), 0)
          FROM DeliveryNote dn JOIN dn.items i
          LEFT JOIN com.billbull.backend.inventory.product.ProductPacking pp
              ON pp.product.id = i.product.id AND LOWER(pp.unit.name) = LOWER(i.unit) AND pp.isActive = true
          WHERE i.product.id = :productId
            AND i.binId = :binId
            AND dn.status IN ('DRAFT', 'DISPATCHED')
      """)
  BigDecimal sumReservedQtyInDispatchedNotesByBin(
      @Param("productId") Long productId,
      @Param("binId") Long binId);

  @Query("""
          SELECT i.product.id, COALESCE(SUM(i.currentQty * COALESCE(pp.conversion, 1)), 0)
          FROM DeliveryNote dn JOIN dn.items i
          LEFT JOIN com.billbull.backend.inventory.product.ProductPacking pp
              ON pp.product.id = i.product.id AND LOWER(pp.unit.name) = LOWER(i.unit) AND pp.isActive = true
          WHERE i.product.id IN :productIds
            AND dn.status IN ('DRAFT', 'DISPATCHED')
          GROUP BY i.product.id
      """)
  List<Object[]> sumReservedQtyForProducts(@Param("productIds") List<Long> productIds);

  List<DeliveryNote> findBySourceDocumentTypeAndSourceDocumentId(String sourceDocumentType,
      Long sourceDocumentId);

  @Query("SELECT dn FROM DeliveryNote dn WHERE dn.customerCode = :customerCode AND dn.linkedSalesInvoice IS NULL AND dn.status <> :excludedStatus ORDER BY dn.dnDate DESC")
  List<DeliveryNote> findUninvoicedByCustomer(
      @Param("customerCode") String customerCode,
      @Param("excludedStatus") DeliveryNoteStatus excludedStatus);

  List<DeliveryNote> findByDnNumberIn(List<String> dnNumbers);

  boolean existsByDnNumber(String dnNumber);

  /**
   * Returns DELIVERED notes where financial posting has not yet occurred.
   * Used by reconciliation to detect accounting gaps (e.g. pre-migration DNs
   * or retries that were blocked before the financialPosted flag was introduced).
   */
  List<DeliveryNote> findByStatusAndFinancialPostedFalse(DeliveryNoteStatus status);

  @Query("SELECT COUNT(dn) > 0 FROM DeliveryNote dn WHERE dn.proformaNo = :piNo AND dn.status <> com.billbull.backend.sales.delivery.DeliveryNoteStatus.CANCELLED")
  boolean existsActiveByProformaNo(@Param("piNo") String piNo);

  @Query("SELECT COUNT(dn) > 0 FROM DeliveryNote dn WHERE dn.salesOrderNo = :soNo AND dn.status <> com.billbull.backend.sales.delivery.DeliveryNoteStatus.CANCELLED")
  boolean existsActiveBySalesOrderNo(@Param("soNo") String soNo);
}
