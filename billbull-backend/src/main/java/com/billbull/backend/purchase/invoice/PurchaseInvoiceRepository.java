package com.billbull.backend.purchase.invoice;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PurchaseInvoiceRepository
                extends JpaRepository<PurchaseInvoice, Long> {

        List<PurchaseInvoice> findByStatus(InvoiceStatus status);

        java.util.Optional<PurchaseInvoice> findByInvoiceNumber(String invoiceNumber);

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

        @org.springframework.data.jpa.repository.Query("SELECT new com.billbull.backend.financials.statement.StatementEntryDTO(s.invoiceDate, s.invoiceNumber, 'INVOICE', CAST(0 AS big_decimal), s.grandTotal, CAST(s.status AS string)) FROM PurchaseInvoice s WHERE s.vendorName = :vendorName AND s.invoiceDate BETWEEN :startDate AND :endDate AND s.status <> 'CANCELLED'")
        List<com.billbull.backend.financials.statement.StatementEntryDTO> findStatementEntries(String vendorName,
                        java.time.LocalDate startDate, java.time.LocalDate endDate);

        /** Global AP sub-ledger total: sum of grandTotal for all non-cancelled, unpaid invoices. */
        @org.springframework.data.jpa.repository.Query("SELECT COALESCE(SUM(i.grandTotal), 0) FROM PurchaseInvoice i WHERE i.status NOT IN ('CANCELLED', 'PAID')")
        java.math.BigDecimal sumGlobalOutstandingAP();
}
