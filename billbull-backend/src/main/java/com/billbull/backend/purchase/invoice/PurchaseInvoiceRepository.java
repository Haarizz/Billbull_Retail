package com.billbull.backend.purchase.invoice;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PurchaseInvoiceRepository
                extends JpaRepository<PurchaseInvoice, Long> {

        List<PurchaseInvoice> findByStatus(InvoiceStatus status);

        /** QA-018: batch lookup used by StatementService to populate description/reference. */
        List<PurchaseInvoice> findByInvoiceNumberIn(List<String> invoiceNumbers);

        boolean existsByVendorName(String vendorName);

        boolean existsByVendorNameAndVendorInvoiceNo(String vendorName, String vendorInvoiceNo);

        boolean existsByVendorNameAndVendorInvoiceNoAndIdNot(String vendorName, String vendorInvoiceNo, Long id);

        boolean existsByLpoIdAndStockPostedTrue(Long lpoId);

        List<PurchaseInvoice> findByLpoId(Long lpoId);

        List<PurchaseInvoice> findByLpoIdOrReferenceNo(Long lpoId, String referenceNo);

        @Query("SELECT DISTINCT i FROM PurchaseInvoice i LEFT JOIN FETCH i.items "
                        + "WHERE (:dateFrom IS NULL OR i.invoiceDate >= :dateFrom) "
                        + "AND (:dateTo IS NULL OR i.invoiceDate <= :dateTo) "
                        + "ORDER BY i.invoiceDate DESC")
        List<PurchaseInvoice> findForReports(@Param("dateFrom") java.time.LocalDate dateFrom,
                        @Param("dateTo") java.time.LocalDate dateTo);

        // --- STATEMENT QUERIES ---
        @org.springframework.data.jpa.repository.Query("SELECT SUM(s.grandTotal) FROM PurchaseInvoice s WHERE s.vendorName = :vendorName AND s.invoiceDate < :startDate AND s.status <> 'CANCELLED'")
        java.math.BigDecimal calculateOpeningBalance(String vendorName, java.time.LocalDate startDate);

        /** Total invoiced amount for a vendor (all non-cancelled invoices). */
        @org.springframework.data.jpa.repository.Query("SELECT COALESCE(SUM(i.grandTotal), 0) FROM PurchaseInvoice i WHERE i.vendorName = :vendorName AND i.status <> 'CANCELLED'")
        java.math.BigDecimal sumInvoicedByVendorName(@org.springframework.data.repository.query.Param("vendorName") String vendorName);

        /** Batched variant of {@link #sumInvoicedByVendorName}: one grouped query for all vendors. Rows: [vendorName, sum]. */
        @org.springframework.data.jpa.repository.Query("SELECT i.vendorName, COALESCE(SUM(i.grandTotal), 0) FROM PurchaseInvoice i WHERE i.status <> 'CANCELLED' GROUP BY i.vendorName")
        java.util.List<Object[]> sumInvoicedGroupedByVendorName();

        @org.springframework.data.jpa.repository.Query("SELECT new com.billbull.backend.financials.statement.StatementEntryDTO(s.invoiceDate, s.invoiceNumber, 'INVOICE', CAST(0 AS big_decimal), s.grandTotal, CAST(s.status AS string)) FROM PurchaseInvoice s WHERE s.vendorName = :vendorName AND s.invoiceDate BETWEEN :startDate AND :endDate AND s.status <> 'CANCELLED'")
        List<com.billbull.backend.financials.statement.StatementEntryDTO> findStatementEntries(String vendorName,
                        java.time.LocalDate startDate, java.time.LocalDate endDate);

        /** Global AP sub-ledger total: sum of grandTotal for all non-cancelled, unpaid invoices. */
        @org.springframework.data.jpa.repository.Query("SELECT COALESCE(SUM(i.grandTotal), 0) FROM PurchaseInvoice i WHERE i.status NOT IN ('CANCELLED', 'PAID')")
        java.math.BigDecimal sumGlobalOutstandingAP();
}
