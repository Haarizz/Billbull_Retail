package com.billbull.backend.financials.cheque;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface PayChequeEventRepository extends JpaRepository<PayChequeEvent, Long> {

    List<PayChequeEvent> findByPayChequeIdOrderByCreatedAtAscIdAsc(Long payChequeId);
}
