package com.billbull.backend.purchase.rfq;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface RfqActivityRepository extends JpaRepository<RfqActivity, Long> {

    List<RfqActivity> findByRfqIdOrderByOccurredAtDescIdDesc(Long rfqId);
}
