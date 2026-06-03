package com.billbull.backend.purchase.payment;

import java.math.BigDecimal;
import java.util.Collection;
import java.util.List;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
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

    /** Total payments made to a vendor (all non-cancelled payment vouchers). */
    @org.springframework.data.jpa.repository.Query("SELECT COALESCE(SUM(p.amount), 0) FROM PaymentVoucher p WHERE p.vendorName = :vendorName AND p.status <> 'CANCELLED'")
    java.math.BigDecimal sumPaymentsByVendorName(@org.springframework.data.repository.query.Param("vendorName") String vendorName);

    /** Batched variant of {@link #sumPaymentsByVendorName}: one grouped query for all vendors. Rows: [vendorName, sum]. */
    @Query("SELECT p.vendorName, COALESCE(SUM(p.amount), 0) FROM PaymentVoucher p WHERE p.status <> 'CANCELLED' GROUP BY p.vendorName")
    List<Object[]> sumPaymentsGroupedByVendorName();

    /**
     * Sum of posted on-account payments for a vendor — vouchers not linked to any
     * purchase invoice ({@code invoiceId IS NULL}). These settle the vendor's
     * opening balance, so they must be netted off when showing what OB remains.
     */
    @Query("SELECT COALESCE(SUM(p.amount), 0) FROM PaymentVoucher p WHERE p.vendorName = :vendorName AND p.invoiceId IS NULL AND p.status IN (com.billbull.backend.purchase.payment.PaymentStatus.POSTED, com.billbull.backend.purchase.payment.PaymentStatus.CLEARED)")
    BigDecimal sumOnAccountPaidByVendorName(@Param("vendorName") String vendorName);

    /** Batched variant of {@link #sumOnAccountPaidByVendorName}: one grouped query for all vendors. Rows: [vendorName, sum]. */
    @Query("SELECT p.vendorName, COALESCE(SUM(p.amount), 0) FROM PaymentVoucher p WHERE p.invoiceId IS NULL AND p.status IN (com.billbull.backend.purchase.payment.PaymentStatus.POSTED, com.billbull.backend.purchase.payment.PaymentStatus.CLEARED) GROUP BY p.vendorName")
    List<Object[]> sumOnAccountPaidGroupedByVendorName();

    @org.springframework.data.jpa.repository.Query("SELECT new com.billbull.backend.financials.statement.StatementEntryDTO(p.paymentDate, p.voucherNumber, 'PAYMENT_MADE', p.amount, CAST(0 AS big_decimal), CAST(p.status AS string)) FROM PaymentVoucher p WHERE p.vendorName = :vendorName AND p.paymentDate BETWEEN :startDate AND :endDate AND p.status <> 'CANCELLED'")
    java.util.List<com.billbull.backend.financials.statement.StatementEntryDTO> findStatementEntries(String vendorName,
            java.time.LocalDate startDate, java.time.LocalDate endDate);

    @Query("SELECT SUM(p.amount) FROM PaymentVoucher p WHERE p.invoiceId = :invoiceId AND p.status IN (com.billbull.backend.purchase.payment.PaymentStatus.POSTED, com.billbull.backend.purchase.payment.PaymentStatus.CLEARED)")
    BigDecimal sumPostedAmountByInvoiceId(@Param("invoiceId") Long invoiceId);

    @Query("SELECT SUM(p.amount) FROM PaymentVoucher p WHERE p.invoiceId = :invoiceId AND p.status IN (com.billbull.backend.purchase.payment.PaymentStatus.POSTED, com.billbull.backend.purchase.payment.PaymentStatus.CLEARED) AND (:excludeVoucherId IS NULL OR p.id <> :excludeVoucherId)")
    BigDecimal sumPostedAmountByInvoiceIdExcludingVoucher(
            @Param("invoiceId") Long invoiceId,
            @Param("excludeVoucherId") Long excludeVoucherId);

    java.util.List<PaymentVoucher> findByLpoIdOrderByPaymentDateDesc(Long lpoId);

    /** QA-018: batch lookup used by StatementService to populate description/reference. */
    java.util.List<PaymentVoucher> findByVoucherNumberIn(java.util.List<String> voucherNumbers);

    @Query("SELECT COALESCE(SUM(p.amount), 0) FROM PaymentVoucher p WHERE p.lpoId = :lpoId AND p.status <> 'CANCELLED'")
    BigDecimal sumAdvancePaidByLpoId(@Param("lpoId") Long lpoId);

    /**
     * Branch-scoped, filtered, sorted page of vouchers — pushed into SQL so only
     * one page is materialised. See {@code BranchAccessService.ListScope} for the
     * {@code allBranches}/{@code branchIds} contract. {@code search} must be
     * lower-cased by the caller; pass {@code ""} for no search. {@code statuses}
     * filters by one or more statuses; pass an empty/sentinel-only collection
     * with {@code allStatuses=true} to skip the status predicate.
     */
    @Query("SELECT v FROM PaymentVoucher v WHERE "
            + "(:allBranches = true OR v.branch IS NULL OR v.branch.id IN :branchIds) "
            + "AND (:allStatuses = true OR v.status IN :statuses) "
            + "AND (:search = '' OR LOWER(v.voucherNumber) LIKE CONCAT('%', :search, '%') "
            + "OR LOWER(v.vendorName) LIKE CONCAT('%', :search, '%') "
            + "OR LOWER(v.referenceNumber) LIKE CONCAT('%', :search, '%')) "
            + "ORDER BY v.id DESC")
    Page<PaymentVoucher> searchPage(@Param("allBranches") boolean allBranches,
            @Param("branchIds") Collection<Long> branchIds,
            @Param("allStatuses") boolean allStatuses,
            @Param("statuses") Collection<PaymentStatus> statuses,
            @Param("search") String search,
            Pageable pageable);

    /** Branch-scoped totals of POSTED/CLEARED voucher amounts grouped by payment mode (for stats cards). */
    @Query("SELECT v.paymentMode, COALESCE(SUM(v.amount), 0) FROM PaymentVoucher v WHERE "
            + "(:allBranches = true OR v.branch IS NULL OR v.branch.id IN :branchIds) "
            + "AND v.status IN (com.billbull.backend.purchase.payment.PaymentStatus.POSTED, "
            + "com.billbull.backend.purchase.payment.PaymentStatus.CLEARED) "
            + "GROUP BY v.paymentMode")
    List<Object[]> sumPostedByModeScoped(@Param("allBranches") boolean allBranches,
            @Param("branchIds") Collection<Long> branchIds);

    @Query("SELECT v FROM PaymentVoucher v WHERE "
            + "(:dateFrom IS NULL OR v.paymentDate >= :dateFrom) "
            + "AND (:dateTo IS NULL OR v.paymentDate <= :dateTo) "
            + "ORDER BY v.paymentDate DESC, v.id DESC")
    List<PaymentVoucher> findForReports(@Param("dateFrom") java.time.LocalDate dateFrom,
            @Param("dateTo") java.time.LocalDate dateTo);
}
