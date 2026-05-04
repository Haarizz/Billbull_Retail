package com.billbull.backend.inventory.stocktake;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface StockTakeItemBatchRepository extends JpaRepository<StockTakeItemBatch, Long> {
    List<StockTakeItemBatch> findByItemId(Long itemId);
    boolean existsByItemIdAndBatchNumber(Long itemId, String batchNumber);
    int countByItemId(Long itemId);
}
