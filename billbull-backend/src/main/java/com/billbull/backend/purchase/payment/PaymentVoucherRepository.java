package com.billbull.backend.purchase.payment;

import java.math.BigDecimal;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface PaymentVoucherRepository extends JpaRepository<PaymentVoucher, Long> {
    // Custom query methods can be added here if needed

    // --- STATEMENT QUERIES ---
    @org.springframework.data.jpa.repository.Query("SELECT SUM(p.amount) FROM PaymentVoucher p WHERE p.vendorName = :vendorName AND p.paymentDate < :startDate AND p.status <> 'CANCELLED'")
    java.math.BigDecimal calculateOpeningBalance(String vendorName, java.time.LocalDate startDate);

    @org.springframework.data.jpa.repository.Query("SELECT new com.billbull.backend.financials.statement.StatementEntryDTO(p.paymentDate, p.voucherNumber, 'PAYMENT_MADE', p.amount, CAST(0 AS big_decimal), CAST(p.status AS string)) FROM PaymentVoucher p WHERE p.vendorName = :vendorName AND p.paymentDate BETWEEN :startDate AND :endDate AND p.status <> 'CANCELLED'")
    java.util.List<com.billbull.backend.financials.statement.StatementEntryDTO> findStatementEntries(String vendorName,
            java.time.LocalDate startDate, java.time.LocalDate endDate);

    @Query("SELECT SUM(p.amount) FROM PaymentVoucher p WHERE p.invoiceId = :invoiceId AND p.status IN (com.billbull.backend.purchase.payment.PaymentStatus.POSTED, com.billbull.backend.purchase.payment.PaymentStatus.CLEARED)")
    BigDecimal sumPostedAmountByInvoiceId(@Param("invoiceId") Long invoiceId);

    @Query("SELECT SUM(p.amount) FROM PaymentVoucher p WHERE p.invoiceId = :invoiceId AND p.status IN (com.billbull.backend.purchase.payment.PaymentStatus.POSTED, com.billbull.backend.purchase.payment.PaymentStatus.CLEARED) AND (:excludeVoucherId IS NULL OR p.id <> :excludeVoucherId)")
    BigDecimal sumPostedAmountByInvoiceIdExcludingVoucher(
            @Param("invoiceId") Long invoiceId,
            @Param("excludeVoucherId") Long excludeVoucherId);
}
