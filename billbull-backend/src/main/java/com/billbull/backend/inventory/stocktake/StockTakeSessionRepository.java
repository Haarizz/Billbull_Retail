package com.billbull.backend.inventory.stocktake;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

@Repository
public interface StockTakeSessionRepository extends JpaRepository<StockTakeSession, Long> {
    List<StockTakeSession> findAllByIsActiveTrueOrderByCreatedAtDesc();
    Optional<StockTakeSession> findBySessionId(String sessionId);
    boolean existsByWarehouseIdAndTypeAndIsActiveTrue(Long warehouseId, StockTakeSession.StockTakeType type);

    @Modifying
    @Query(value = "ALTER TABLE stock_movements DROP CONSTRAINT IF EXISTS stock_movements_source_type_check", nativeQuery = true)
    void dropSourceTypeConstraint();
}
