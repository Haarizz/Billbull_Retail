package com.billbull.backend.sales.delivery;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.util.List;

public interface DeliveryNoteBatchConsumptionRepository extends JpaRepository<DeliveryNoteBatchConsumption, Long> {

    List<DeliveryNoteBatchConsumption> findByDeliveryNoteId(Long deliveryNoteId);

    List<DeliveryNoteBatchConsumption> findByDeliveryNoteItemId(Long deliveryNoteItemId);

    @Query("SELECT COALESCE(SUM(c.totalCost), 0) FROM DeliveryNoteBatchConsumption c WHERE c.deliveryNoteId = :dnId AND c.itemCode = :itemCode")
    BigDecimal sumTotalCostByDnAndItem(@Param("dnId") Long dnId, @Param("itemCode") String itemCode);
}
