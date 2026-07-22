package com.billbull.backend.inventory.reservation;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.util.List;

public interface PosStockReservationRepository extends JpaRepository<PosStockReservation, Long> {

    List<PosStockReservation> findBySourceDocumentTypeAndSourceDocumentIdAndStatus(
            String sourceDocumentType, Long sourceDocumentId, PosStockReservationStatus status);

    List<PosStockReservation> findBySourceDocumentTypeAndSourceLineIdAndStatus(
            String sourceDocumentType, Long sourceLineId, PosStockReservationStatus status);

    @Query("""
            SELECT COALESCE(SUM(r.quantity), 0)
            FROM PosStockReservation r
            WHERE r.productId = :productId
              AND r.warehouseId = :warehouseId
              AND r.status = com.billbull.backend.inventory.reservation.PosStockReservationStatus.RESERVED
            """)
    BigDecimal sumReservedByProductAndWarehouse(
            @Param("productId") Long productId,
            @Param("warehouseId") Long warehouseId);

    @Query("""
            SELECT r.productId, r.warehouseId, COALESCE(SUM(r.quantity), 0)
            FROM PosStockReservation r
            WHERE r.productCode IN :productCodes
              AND r.status = com.billbull.backend.inventory.reservation.PosStockReservationStatus.RESERVED
            GROUP BY r.productId, r.warehouseId
            """)
    List<Object[]> sumReservedQuantityForProductsByWarehouse(@Param("productCodes") List<String> productCodes);
}
