package com.billbull.backend.sales.advance;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.util.List;

public interface AdvanceApplicationRepository extends JpaRepository<AdvanceApplication, Long> {

    List<AdvanceApplication> findByAdvanceReceiptId(Long advanceReceiptId);

    List<AdvanceApplication> findByInvoiceNumber(String invoiceNumber);

    @Query("SELECT COALESCE(SUM(a.appliedAmount), 0) FROM AdvanceApplication a WHERE a.advanceReceiptId = :receiptId AND a.status = 'APPLIED'")
    BigDecimal sumAppliedByReceiptId(@Param("receiptId") Long receiptId);
}
