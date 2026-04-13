package com.billbull.backend.sales.delivery;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.math.BigDecimal;
import java.util.List;

public interface DeliveryNoteRepository extends JpaRepository<DeliveryNote, Long> {

  @Query("""
          SELECT COALESCE(SUM(i.currentQty), 0)
          FROM DeliveryNote dn JOIN dn.items i
          WHERE i.product.id = :productId
            AND dn.warehouse.id = :warehouseId
            AND dn.status IN ('DRAFT', 'DISPATCHED')
      """)
  BigDecimal sumReservedQtyInDispatchedNotes(
      @Param("productId") Long productId,
      @Param("warehouseId") Long warehouseId);

  @Query("""
          SELECT COALESCE(SUM(i.currentQty), 0)
          FROM DeliveryNote dn JOIN dn.items i
          WHERE i.product.id = :productId
            AND dn.warehouse.id = :warehouseId
            AND i.binId IS NULL
            AND dn.status IN ('DRAFT', 'DISPATCHED')
      """)
  BigDecimal sumUnassignedReservedQtyInDispatchedNotes(
      @Param("productId") Long productId,
      @Param("warehouseId") Long warehouseId);

  @Query("""
          SELECT COALESCE(SUM(i.currentQty), 0)
          FROM DeliveryNote dn JOIN dn.items i
          WHERE i.product.id = :productId
            AND i.binId = :binId
            AND dn.status IN ('DRAFT', 'DISPATCHED')
      """)
  BigDecimal sumReservedQtyInDispatchedNotesByBin(
      @Param("productId") Long productId,
      @Param("binId") Long binId);

  @Query("""
          SELECT i.product.id, COALESCE(SUM(i.currentQty), 0)
          FROM DeliveryNote dn JOIN dn.items i
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
}
