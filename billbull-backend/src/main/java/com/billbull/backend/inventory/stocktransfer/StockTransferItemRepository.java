package com.billbull.backend.inventory.stocktransfer;

import org.springframework.data.jpa.repository.JpaRepository;

public interface StockTransferItemRepository extends JpaRepository<StockTransferItem, Long> {
}
