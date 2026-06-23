package com.billbull.backend.pos.layaway;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.math.BigDecimal;
import java.util.List;

public interface PosLayawayPaymentRepository extends JpaRepository<PosLayawayPayment, Long> {

    List<PosLayawayPayment> findByLayaway_IdOrderByPaymentDateAsc(Long layawayId);

    @Query("SELECT COALESCE(SUM(p.amount), 0) FROM PosLayawayPayment p WHERE p.layaway.id = :layawayId")
    BigDecimal sumAmountByLayawayId(@Param("layawayId") Long layawayId);
}
