package com.billbull.backend.inventory.stocktake;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface StockTakeUnitScanRepository extends JpaRepository<StockTakeUnitScan, Long> {
    List<StockTakeUnitScan> findBySessionOrderByCreatedAtDesc(StockTakeSession session);
    long countBySessionAndStatus(StockTakeSession session, StockTakeUnitScanStatus status);
    long countBySessionAndStatusAndResolution(StockTakeSession session, StockTakeUnitScanStatus status, StockTakeUnknownScanResolution resolution);
    boolean existsBySessionAndStatusAndResolution(StockTakeSession session, StockTakeUnitScanStatus status, StockTakeUnknownScanResolution resolution);
}
