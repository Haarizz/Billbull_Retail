package com.billbull.backend.inventory.warehouse;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface BinStockRepository extends JpaRepository<BinStock, Long> {

    List<BinStock> findByBinId(Long binId);

    List<BinStock> findByBinIdAndProductId(Long binId, Long productId);

    List<BinStock> findByProductId(Long productId);
}
