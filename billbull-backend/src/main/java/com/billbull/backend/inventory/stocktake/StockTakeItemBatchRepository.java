package com.billbull.backend.inventory.stocktake;

import java.time.LocalDate;
import java.util.List;
import java.util.Objects;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface StockTakeItemBatchRepository extends JpaRepository<StockTakeItemBatch, Long> {
    List<StockTakeItemBatch> findByItemId(Long itemId);
    List<StockTakeItemBatch> findByItemIdAndBatchNumber(Long itemId, String batchNumber);
    boolean existsByItemIdAndBatchNumber(Long itemId, String batchNumber);

    // Resolve the null-parameter check in Java rather than JPQL — PostgreSQL refuses
    // to infer the data type for a bare `?  IS NULL` predicate on an untyped parameter.
    default boolean existsIdentity(Long itemId, String batchNumber, LocalDate expiryDate, Long excludeId) {
        return findByItemIdAndBatchNumber(itemId, batchNumber).stream()
                .filter(b -> excludeId == null || !Objects.equals(b.getId(), excludeId))
                .anyMatch(b -> Objects.equals(b.getExpiryDate(), expiryDate));
    }

    int countByItemId(Long itemId);
}
