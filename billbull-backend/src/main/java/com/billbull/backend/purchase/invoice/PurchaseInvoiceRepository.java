package com.billbull.backend.purchase.invoice;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PurchaseInvoiceRepository
                extends JpaRepository<PurchaseInvoice, Long> {

        List<PurchaseInvoice> findByStatus(InvoiceStatus status);

        java.util.Optional<PurchaseInvoice> findByInvoiceNumber(String invoiceNumber);

        boolean existsByInvoiceNumber(String invoiceNumber);

        @Query("SELECT i.invoiceNumber FROM PurchaseInvoice i WHERE i.invoiceNumber LIKE CONCAT(:prefix, '%')")
        List<String> findInvoiceNumbersByPrefix(@Param("prefix") String prefix);

        /** QA-018: batch lookup used by StatementService to populate description/reference. */
        List<PurchaseInvoice> findByInvoiceNumberIn(List<String> invoiceNumbers);

        boolean existsByVendorName(String vendorName);

        boolean existsByVendorNameAndVendorInvoiceNo(String vendorName, String vendorInvoiceNo);

        boolean existsByVendorNameAndVendorInvoiceNoAndIdNot(String vendorName, String vendorInvoiceNo, Long id);

        boolean existsByLpoIdAndStockPostedTrue(Long lpoId);

        List<PurchaseInvoice> findByLpoId(Long lpoId);

        List<PurchaseInvoice> findByLpoIdOrReferenceNo(Long lpoId, String referenceNo);

        @Query("SELECT DISTINCT i FROM PurchaseInvoice i LEFT JOIN FETCH i.items WHERE i.invoiceDate >= :dateFrom AND i.invoiceDate <= :dateTo ORDER BY i.invoiceDate DESC")
        List<PurchaseInvoice> findForReportsBounded(@Param("dateFrom") java.time.LocalDate dateFrom, @Param("dateTo") java.time.LocalDate dateTo);

        @Query("SELECT DISTINCT i FROM PurchaseInvoice i LEFT JOIN FETCH i.items WHERE i.invoiceDate >= :dateFrom ORDER BY i.invoiceDate DESC")
        List<PurchaseInvoice> findForReportsFromDate(@Param("dateFrom") java.time.LocalDate dateFrom);

        @Query("SELECT DISTINCT i FROM PurchaseInvoice i LEFT JOIN FETCH i.items WHERE i.invoiceDate <= :dateTo ORDER BY i.invoiceDate DESC")
        List<PurchaseInvoice> findForReportsToDate(@Param("dateTo") java.time.LocalDate dateTo);

        @Query("SELECT DISTINCT i FROM PurchaseInvoice i LEFT JOIN FETCH i.items ORDER BY i.invoiceDate DESC")
        List<PurchaseInvoice> findForReportsAll();

        default List<PurchaseInvoice> findForReports(java.time.LocalDate dateFrom, java.time.LocalDate dateTo) {
                if (dateFrom != null && dateTo != null) return findForReportsBounded(dateFrom, dateTo);
                if (dateFrom != null) return findForReportsFromDate(dateFrom);
                if (dateTo != null) return findForReportsToDate(dateTo);
                return findForReportsAll();
        }

        // --- STATEMENT QUERIES ---
        @org.springframework.data.jpa.repository.Query("SELECT SUM(s.grandTotal) FROM PurchaseInvoice s WHERE s.vendorName = :vendorName AND s.invoiceDate < :startDate AND s.status <> 'CANCELLED'")
        java.math.BigDecimal calculateOpeningBalance(String vendorName, java.time.LocalDate startDate);

        /** Total invoiced amount for a vendor (all non-cancelled invoices). */
        @org.springframework.data.jpa.repository.Query("SELECT COALESCE(SUM(i.grandTotal), 0) FROM PurchaseInvoice i WHERE i.vendorName = :vendorName AND i.status <> 'CANCELLED'")
        java.math.BigDecimal sumInvoicedByVendorName(@org.springframework.data.repository.query.Param("vendorName") String vendorName);

        /** Batched variant of {@link #sumInvoicedByVendorName}: one grouped query for all vendors. Rows: [vendorName, sum]. */
        @org.springframework.data.jpa.repository.Query("SELECT i.vendorName, COALESCE(SUM(i.grandTotal), 0) FROM PurchaseInvoice i WHERE i.status = com.billbull.backend.purchase.invoice.InvoiceStatus.POSTED GROUP BY i.vendorName")
        java.util.List<Object[]> sumInvoicedGroupedByVendorName();

        /**
         * Bulk outstanding AP per vendor: sum of grandTotal for POSTED invoices that are
         * not fully paid. Rows: [vendorName, outstandingSum].
         */
        @org.springframework.data.jpa.repository.Query("SELECT i.vendorName, COALESCE(SUM(i.grandTotal), 0) FROM PurchaseInvoice i " +
               "WHERE i.status = com.billbull.backend.purchase.invoice.InvoiceStatus.POSTED " +
               "AND i.paymentStatus <> com.billbull.backend.purchase.invoice.PaymentStatus.PAID " +
               "AND i.vendorName IS NOT NULL " +
               "GROUP BY i.vendorName")
        java.util.List<Object[]> sumOutstandingByVendorName();

        /**
         * Single-vendor variant of {@link #sumOutstandingByVendorName()}.
         *
         * <p>Same predicate, no GROUP BY. Note the name is the existing one: this is the
         * GROSS grandTotal of POSTED, not-fully-paid invoices — invoice-linked payments are
         * netted off by the caller, exactly as {@code VendorService.list()} does.
         */
        @org.springframework.data.jpa.repository.Query("SELECT COALESCE(SUM(i.grandTotal), 0) FROM PurchaseInvoice i " +
               "WHERE i.status = com.billbull.backend.purchase.invoice.InvoiceStatus.POSTED " +
               "AND i.paymentStatus <> com.billbull.backend.purchase.invoice.PaymentStatus.PAID " +
               "AND i.vendorName = :vendorName")
        java.math.BigDecimal sumOutstandingForVendorName(@org.springframework.data.repository.query.Param("vendorName") String vendorName);

        /**
         * How many of one vendor's invoices are past due. A count only — never an amount.
         *
         * <p>{@code PurchaseInvoice} stores no per-invoice balance, so there is no honest
         * overdue *amount* to report: {@code grandTotal} is the gross, and the payments that
         * would reduce it are tracked at vendor level, not against the invoice. Subtracting
         * one from the other would attribute unrelated payments to these specific invoices.
         * So the amount stays absent and only the count is exposed.
         *
         * <p>The count itself needs no balance. Whether an invoice is settled is a fact the
         * invoice already carries in its own {@code paymentStatus}, and this query reuses the
         * exact predicate {@link #sumOutstandingForVendorName} already relies on
         * ({@code status = POSTED AND paymentStatus <> PAID}), narrowed to invoices whose
         * {@code dueDate} has passed. Strictly before today, so an invoice due today is not
         * overdue; invoices with no due date cannot be aged and are excluded.
         *
         * <p>Reads through the existing {@code idx_purchase_invoice_vendor_due}
         * (vendor_name, due_date).
         */
        @org.springframework.data.jpa.repository.Query("SELECT COUNT(i) FROM PurchaseInvoice i " +
               "WHERE i.status = com.billbull.backend.purchase.invoice.InvoiceStatus.POSTED " +
               "AND i.paymentStatus <> com.billbull.backend.purchase.invoice.PaymentStatus.PAID " +
               "AND i.vendorName = :vendorName " +
               "AND i.dueDate IS NOT NULL " +
               "AND i.dueDate < :today")
        long countOverdueForVendorName(@org.springframework.data.repository.query.Param("vendorName") String vendorName,
                        @org.springframework.data.repository.query.Param("today") java.time.LocalDate today);

        @org.springframework.data.jpa.repository.Query("SELECT new com.billbull.backend.financials.statement.StatementEntryDTO(s.invoiceDate, s.invoiceNumber, 'INVOICE', CAST(0 AS big_decimal), s.grandTotal, CAST(s.status AS string)) FROM PurchaseInvoice s WHERE s.vendorName = :vendorName AND s.invoiceDate BETWEEN :startDate AND :endDate AND s.status <> 'CANCELLED'")
        List<com.billbull.backend.financials.statement.StatementEntryDTO> findStatementEntries(String vendorName,
                        java.time.LocalDate startDate, java.time.LocalDate endDate);

        /** Global AP sub-ledger total: sum of grandTotal for all non-cancelled, unpaid invoices. */
        @org.springframework.data.jpa.repository.Query("SELECT COALESCE(SUM(i.grandTotal), 0) FROM PurchaseInvoice i WHERE i.status NOT IN ('CANCELLED', 'PAID')")
        java.math.BigDecimal sumGlobalOutstandingAP();

        /**
         * Vendor ids, most purchased-from first — the primary ranking behind the global
         * search modal's empty-query vendor preview.
         *
         * <p>Counts POSTED invoices: invoices inside the activity window first, then the
         * all-time count, ties broken on the most recent invoice. The all-time tier keeps
         * the biggest suppliers on top through a quiet stretch instead of letting the
         * preview fall back to alphabetical. Returns ids only; the caller re-reads the
         * vendors through its own branch-scoped query.
         */
        @org.springframework.data.jpa.repository.Query("SELECT i.vendorId FROM PurchaseInvoice i "
                + "WHERE i.vendorId IS NOT NULL "
                + "AND i.status = com.billbull.backend.purchase.invoice.InvoiceStatus.POSTED "
                + "GROUP BY i.vendorId "
                + "ORDER BY SUM(CASE WHEN i.invoiceDate >= :since THEN 1 ELSE 0 END) DESC, "
                + "COUNT(i.id) DESC, MAX(i.invoiceDate) DESC")
        List<Long> findMostPurchasedVendorIds(
                @org.springframework.data.repository.query.Param("since") java.time.LocalDate since,
                org.springframework.data.domain.Pageable pageable);
}
