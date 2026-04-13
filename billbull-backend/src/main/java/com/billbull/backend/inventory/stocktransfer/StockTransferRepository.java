package com.billbull.backend.inventory.stocktransfer;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface StockTransferRepository extends JpaRepository<StockTransfer, Long> {
    Optional<StockTransfer> findByTransferNo(String transferNo);
}
