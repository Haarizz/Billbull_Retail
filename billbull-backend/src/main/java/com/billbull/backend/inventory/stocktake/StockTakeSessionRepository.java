package com.billbull.backend.inventory.stocktake;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
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

    // Branch-Level Inventory Phase 7 — branch-scoped variant of findAllActiveWithItems. A session's
    // branch is DERIVED from its warehouse (sessions carry warehouseId, not branch_id), so the scope
    // predicate matches sessions whose warehouse belongs to an in-scope branch OR is global
    // (warehouse branch NULL), plus legacy sessions with no warehouse (warehouseId NULL) which stay
    // globally visible. Used ONLY when the toggle is on + a branch is active (via the resolver); the
    // unscoped method above remains the toggle-off / admin path (byte-identical). branchIds never
    // empty (ListScope -1 sentinel). Same JOIN FETCH + DISTINCT + ORDER BY as the unscoped variant.
    @Query("SELECT DISTINCT s FROM StockTakeSession s LEFT JOIN FETCH s.items "
            + "WHERE s.isActive = true AND ("
            + "  s.warehouseId IS NULL "
            + "  OR s.warehouseId IN ("
            + "     SELECT w.id FROM Warehouse w WHERE w.branch.id IN :branchIds OR w.branch IS NULL"
            + "  )"
            + ") ORDER BY s.createdAt DESC")
    List<StockTakeSession> findActiveWithItemsInBranchScope(@Param("branchIds") java.util.Collection<Long> branchIds);

    // Branch id a session belongs to, derived via its warehouse. Null when the session has no
    // warehouse, the warehouse is global/branchless, or the warehouse is missing. Used by the
    // single-session retrieval branch-access guard (Phase 7). Projection-only, null-safe.
    @Query("SELECT w.branch.id FROM Warehouse w WHERE w.id = "
            + "(SELECT s.warehouseId FROM StockTakeSession s WHERE s.id = :sessionId)")
    Long findBranchIdBySessionId(@Param("sessionId") Long sessionId);

    @Modifying
    @Query(value = "ALTER TABLE stock_movements DROP CONSTRAINT IF EXISTS stock_movements_source_type_check", nativeQuery = true)
    void dropSourceTypeConstraint();
}
