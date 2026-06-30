package com.billbull.backend.sales.payment;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@Repository
public interface PaymentRepository extends JpaRepository<Payment, Long> {

    Optional<Payment> findByPaymentNumber(String paymentNumber);

    boolean existsByPaymentNumber(String paymentNumber);

    @Query("SELECT p.paymentNumber FROM Payment p WHERE p.paymentNumber LIKE CONCAT(:prefix, '%')")
    List<String> findPaymentNumbersByPrefix(@Param("prefix") String prefix);

    List<Payment> findByCustomerCode(String customerCode);

    List<Payment> findByLinkedInvoice(String linkedInvoice);

    List<Payment> findBySplitGroupId(String splitGroupId);

    List<Payment> findBySplitGroupIdIsNotNull();

    List<Payment> findByPaymentType(PaymentType paymentType);

    List<Payment> findByStatus(PaymentStatus status);

    List<Payment> findByPaymentDateBetween(LocalDate startDate, LocalDate endDate);

    @Query("SELECT p FROM Payment p WHERE p.paymentDate = :date")
    List<Payment> findByDate(LocalDate date);

    @Query("SELECT p FROM Payment p ORDER BY p.paymentNumber DESC LIMIT 1")
    Optional<Payment> findTopByOrderByPaymentNumberDesc();

    @Query("SELECT CAST(COALESCE(SUM(p.amount), 0) AS double) FROM Payment p WHERE p.paymentType = 'RECEIVED' AND p.paymentDate = :date")
    Double getTotalReceivedForDate(LocalDate date);

    @Query("SELECT CAST(COALESCE(SUM(p.amount), 0) AS double) FROM Payment p WHERE p.paymentType = 'RECEIVED' AND p.paymentDate BETWEEN :startDate AND :endDate")
    Double getTotalReceivedBetweenDates(LocalDate startDate, LocalDate endDate);

    @Query("SELECT CAST(COALESCE(SUM(p.invoiceBalance - p.amount), 0) AS double) FROM Payment p WHERE p.status IN ('PENDING', 'PARTIAL')")
    Double getTotalPendingAmount();

    // --- STATEMENT QUERIES ---
    @Query("SELECT CAST(SUM(p.amount) AS double) FROM Payment p WHERE p.customerCode = :customerCode AND p.paymentDate < :startDate AND p.status <> 'CANCELLED'")
    Double calculateOpeningBalance(String customerCode, java.time.LocalDate startDate);

    @Query("SELECT new com.billbull.backend.financials.statement.StatementEntryDTO(p.paymentDate, p.paymentNumber, 'PAYMENT_RECEIVED', CAST(0 AS big_decimal), p.amount, CAST(p.status AS string)) FROM Payment p WHERE p.customerCode = :customerCode AND p.paymentDate BETWEEN :startDate AND :endDate AND p.status <> 'CANCELLED'")
    List<com.billbull.backend.financials.statement.StatementEntryDTO> findStatementEntries(String customerCode,
            java.time.LocalDate startDate, java.time.LocalDate endDate);

    // ── POS X/Z-Report tender aggregation ──────────────────────────────────────
    // "Total Paid" on a session/day must equal the actual tender collected, not the
    // invoice value. Tender is the per-leg Payment rows (cash leg + card leg for a
    // split sale) created by PosCheckoutController.recordPayment, joined back to the
    // session via the invoice number (Payment.linkedInvoice = SalesInvoice.invoiceNumber).
    // Excludes cancelled/refund-reversed payments so the figure ties to the cash GL.

    /**
     * Actual RECEIVED tender for a set of invoice numbers, grouped by raw payment mode.
     * Returns rows of [paymentMode, SUM(amount), COUNT]. Caller maps the free-text
     * mode (Cash / Visa / Card / Credit / Bank Transfer / …) into report buckets.
     */
    @Query("SELECT COALESCE(p.paymentMode, 'Cash'), COALESCE(SUM(p.amount), 0), COUNT(p) "
            + "FROM Payment p "
            + "WHERE p.paymentType = com.billbull.backend.sales.payment.PaymentType.RECEIVED "
            + "AND p.status NOT IN (com.billbull.backend.sales.payment.PaymentStatus.CANCELLED, "
            + "com.billbull.backend.sales.payment.PaymentStatus.FAILED) "
            + "AND p.linkedInvoice IN :invoiceNumbers "
            + "GROUP BY p.paymentMode")
    List<Object[]> sumTenderByModeForInvoices(@Param("invoiceNumbers") java.util.Collection<String> invoiceNumbers);

    /**
     * Full RECEIVED tender rows for a set of invoice numbers, latest first. Used to
     * attribute collections to the cashier (Payment.createdBy) and to drive the
     * detailed tender lines in the X/Z report.
     */
    @Query("SELECT p FROM Payment p "
            + "WHERE p.paymentType = com.billbull.backend.sales.payment.PaymentType.RECEIVED "
            + "AND p.status NOT IN (com.billbull.backend.sales.payment.PaymentStatus.CANCELLED, "
            + "com.billbull.backend.sales.payment.PaymentStatus.FAILED) "
            + "AND p.linkedInvoice IN :invoiceNumbers "
            + "ORDER BY p.id DESC")
    List<Payment> findTenderForInvoices(@Param("invoiceNumbers") java.util.Collection<String> invoiceNumbers);

    /**
     * Actual refunded tender (paymentType = MADE) for a set of invoice numbers, grouped by
     * raw payment mode — mirrors {@link #sumTenderByModeForInvoices} for the refund side.
     * Returns rows of [paymentMode, SUM(amount), COUNT].
     */
    @Query("SELECT COALESCE(p.paymentMode, 'Cash'), COALESCE(SUM(p.amount), 0), COUNT(p) "
            + "FROM Payment p "
            + "WHERE p.paymentType = com.billbull.backend.sales.payment.PaymentType.MADE "
            + "AND p.status NOT IN (com.billbull.backend.sales.payment.PaymentStatus.CANCELLED, "
            + "com.billbull.backend.sales.payment.PaymentStatus.FAILED) "
            + "AND p.linkedInvoice IN :invoiceNumbers "
            + "GROUP BY p.paymentMode")
    List<Object[]> sumRefundByModeForInvoices(@Param("invoiceNumbers") java.util.Collection<String> invoiceNumbers);
}
