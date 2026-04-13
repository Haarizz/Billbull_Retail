package com.billbull.backend.purchase.invoice;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface PurchaseInvoiceRepository
                extends JpaRepository<PurchaseInvoice, Long> {

        List<PurchaseInvoice> findByStatus(InvoiceStatus status);

        boolean existsByVendorName(String vendorName);

        boolean existsByLpoIdAndStockPostedTrue(Long lpoId);

        List<PurchaseInvoice> findByLpoId(Long lpoId);

        List<PurchaseInvoice> findByLpoIdOrReferenceNo(Long lpoId, String referenceNo);

        // --- STATEMENT QUERIES ---
        @org.springframework.data.jpa.repository.Query("SELECT SUM(s.grandTotal) FROM PurchaseInvoice s WHERE s.vendorName = :vendorName AND s.invoiceDate < :startDate AND s.status <> 'CANCELLED'")
        java.math.BigDecimal calculateOpeningBalance(String vendorName, java.time.LocalDate startDate);

        @org.springframework.data.jpa.repository.Query("SELECT new com.billbull.backend.financials.statement.StatementEntryDTO(s.invoiceDate, s.invoiceNumber, 'INVOICE', CAST(0 AS big_decimal), s.grandTotal, CAST(s.status AS string)) FROM PurchaseInvoice s WHERE s.vendorName = :vendorName AND s.invoiceDate BETWEEN :startDate AND :endDate AND s.status <> 'CANCELLED'")
        List<com.billbull.backend.financials.statement.StatementEntryDTO> findStatementEntries(String vendorName,
                        java.time.LocalDate startDate, java.time.LocalDate endDate);
}
