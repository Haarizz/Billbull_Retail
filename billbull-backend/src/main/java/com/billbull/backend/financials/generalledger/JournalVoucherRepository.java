package com.billbull.backend.financials.generalledger;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface JournalVoucherRepository extends JpaRepository<JournalVoucher, Long> {
}
