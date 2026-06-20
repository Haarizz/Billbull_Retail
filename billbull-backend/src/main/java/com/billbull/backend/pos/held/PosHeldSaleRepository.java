package com.billbull.backend.pos.held;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface PosHeldSaleRepository extends JpaRepository<PosHeldSale, Long> {

    /** Active (not yet recalled) held carts for a session, oldest first. */
    List<PosHeldSale> findByPosSessionIdAndIsActiveTrueOrderByCreatedAtAsc(Long posSessionId);

    long countByPosSessionIdAndIsActiveTrue(Long posSessionId);
}
