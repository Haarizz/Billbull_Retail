package com.billbull.backend.purchase.rfq;

import java.util.Collection;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface RfqNegotiationRepository extends JpaRepository<RfqNegotiation, Long> {

    List<RfqNegotiation> findByRfqIdOrderByIdAsc(Long rfqId);

    List<RfqNegotiation> findByRfqIdIn(Collection<Long> rfqIds);
}
