package com.billbull.backend.sales.payment;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@Repository
public interface PaymentRepository extends JpaRepository<Payment, Long> {

    Optional<Payment> findByPaymentNumber(String paymentNumber);

    List<Payment> findByCustomerCode(String customerCode);

    List<Payment> findByLinkedInvoice(String linkedInvoice);

    List<Payment> findByPaymentType(PaymentType paymentType);

    List<Payment> findByStatus(PaymentStatus status);

    List<Payment> findByPaymentDateBetween(LocalDate startDate, LocalDate endDate);

    @Query("SELECT p FROM Payment p WHERE p.paymentDate = :date")
    List<Payment> findByDate(LocalDate date);

    @Query("SELECT p FROM Payment p ORDER BY p.paymentNumber DESC LIMIT 1")
    Optional<Payment> findTopByOrderByPaymentNumberDesc();

    @Query("SELECT COALESCE(SUM(p.amount), 0) FROM Payment p WHERE p.paymentType = 'RECEIVED' AND p.paymentDate = :date")
    Double getTotalReceivedForDate(LocalDate date);

    @Query("SELECT COALESCE(SUM(p.amount), 0) FROM Payment p WHERE p.paymentType = 'RECEIVED' AND p.paymentDate BETWEEN :startDate AND :endDate")
    Double getTotalReceivedBetweenDates(LocalDate startDate, LocalDate endDate);

    @Query("SELECT COALESCE(SUM(p.invoiceBalance - p.amount), 0) FROM Payment p WHERE p.status IN ('PENDING', 'PARTIAL')")
    Double getTotalPendingAmount();

    // --- STATEMENT QUERIES ---
    @Query("SELECT SUM(p.amount) FROM Payment p WHERE p.customerCode = :customerCode AND p.paymentDate < :startDate AND p.status <> 'CANCELLED'")
    Double calculateOpeningBalance(String customerCode, java.time.LocalDate startDate);

    @Query("SELECT new com.billbull.backend.financials.statement.StatementEntryDTO(p.paymentDate, p.paymentNumber, 'PAYMENT_RECEIVED', CAST(0 AS double), p.amount, CAST(p.status AS string)) FROM Payment p WHERE p.customerCode = :customerCode AND p.paymentDate BETWEEN :startDate AND :endDate AND p.status <> 'CANCELLED'")
    List<com.billbull.backend.financials.statement.StatementEntryDTO> findStatementEntries(String customerCode,
            java.time.LocalDate startDate, java.time.LocalDate endDate);
}
