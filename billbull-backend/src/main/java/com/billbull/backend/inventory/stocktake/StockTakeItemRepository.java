package com.billbull.backend.inventory.stocktake;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface StockTakeItemRepository extends JpaRepository<StockTakeItem, Long> {
    List<StockTakeItem> findBySessionId(Long sessionId);
}
