package com.billbull.backend.inventory.stocktake;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface StockTakeExpectedUnitRepository extends JpaRepository<StockTakeExpectedUnit, Long> {
    long countBySession(StockTakeSession session);
    long countBySessionAndScannedTrue(StockTakeSession session);
    boolean existsBySession(StockTakeSession session);
    List<StockTakeExpectedUnit> findBySession(StockTakeSession session);
    List<StockTakeExpectedUnit> findBySessionAndProductId(StockTakeSession session, Long productId);

    Optional<StockTakeExpectedUnit> findFirstBySessionAndUnitBarcodeIgnoreCaseAndScannedFalse(
            StockTakeSession session, String unitBarcode);

    Optional<StockTakeExpectedUnit> findFirstBySessionAndUnitBarcodeIgnoreCase(
            StockTakeSession session, String unitBarcode);

    @Query("""
        SELECT e FROM StockTakeExpectedUnit e
        WHERE e.session = :session
          AND e.productId = :productId
          AND ((:binId IS NULL AND e.expectedBinId IS NULL) OR e.expectedBinId = :binId)
    """)
    List<StockTakeExpectedUnit> findBySessionAndProductAndExpectedBin(
            @Param("session") StockTakeSession session,
            @Param("productId") Long productId,
            @Param("binId") Long binId);
}
