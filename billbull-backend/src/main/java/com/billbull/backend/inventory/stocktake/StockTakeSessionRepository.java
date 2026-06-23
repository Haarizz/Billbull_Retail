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

    // ARCHFIX §1.6/§1.9: items is LAZY — JOIN FETCH it for the session-list serialization path.
    // DISTINCT collapses the items-join duplication; the nested item.batches load via @BatchSize.
    @Query("SELECT DISTINCT s FROM StockTakeSession s LEFT JOIN FETCH s.items "
            + "WHERE s.isActive = true ORDER BY s.createdAt DESC")
    List<StockTakeSession> findAllActiveWithItems();

    @Modifying
    @Query(value = "ALTER TABLE stock_movements DROP CONSTRAINT IF EXISTS stock_movements_source_type_check", nativeQuery = true)
    void dropSourceTypeConstraint();
}
