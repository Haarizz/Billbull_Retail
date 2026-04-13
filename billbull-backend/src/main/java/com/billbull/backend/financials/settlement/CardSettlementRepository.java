package com.billbull.backend.financials.settlement;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface CardSettlementRepository extends JpaRepository<CardSettlement, Long> {
}
