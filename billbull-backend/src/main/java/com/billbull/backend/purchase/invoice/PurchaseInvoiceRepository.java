package com.billbull.backend.purchase.invoice;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

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

        // --- STATEMENT QUERIES ---
        @org.springframework.data.jpa.repository.Query("SELECT SUM(s.grandTotal) FROM PurchaseInvoice s WHERE s.vendorName = :vendorName AND s.invoiceDate < :startDate AND s.status <> 'CANCELLED'")
        java.math.BigDecimal calculateOpeningBalance(String vendorName, java.time.LocalDate startDate);

        /** Total invoiced amount for a vendor (all non-cancelled invoices). */
        @org.springframework.data.jpa.repository.Query("SELECT COALESCE(SUM(i.grandTotal), 0) FROM PurchaseInvoice i WHERE i.vendorName = :vendorName AND i.status <> 'CANCELLED'")
        java.math.BigDecimal sumInvoicedByVendorName(@org.springframework.data.repository.query.Param("vendorName") String vendorName);

        @org.springframework.data.jpa.repository.Query("SELECT new com.billbull.backend.financials.statement.StatementEntryDTO(s.invoiceDate, s.invoiceNumber, 'INVOICE', CAST(0 AS big_decimal), s.grandTotal, CAST(s.status AS string)) FROM PurchaseInvoice s WHERE s.vendorName = :vendorName AND s.invoiceDate BETWEEN :startDate AND :endDate AND s.status <> 'CANCELLED'")
        List<com.billbull.backend.financials.statement.StatementEntryDTO> findStatementEntries(String vendorName,
                        java.time.LocalDate startDate, java.time.LocalDate endDate);
}
