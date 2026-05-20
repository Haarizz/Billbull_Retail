package com.billbull.backend.sales.invoice;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface SalesInvoiceRepository extends JpaRepository<SalesInvoice, Long> {

        Optional<SalesInvoice> findByInvoiceNumber(String invoiceNumber);

        boolean existsByCustomerCode(String customerCode);

        List<SalesInvoice> findAllByOrderByInvoiceDateDesc();

        @Query("SELECT MAX(i.invoiceNumber) FROM SalesInvoice i WHERE i.invoiceNumber LIKE :prefix%")
        String findLastInvoiceNumberByPrefix(String prefix);

        @Query("SELECT SUM(i.quantity) FROM SalesInvoiceItem i WHERE i.itemCode = :itemCode AND i.salesInvoice.salesType = com.billbull.backend.sales.invoice.SalesType.DIRECT_SALE AND i.salesInvoice.status = com.billbull.backend.sales.invoice.SalesInvoiceStatus.DRAFT")
        java.math.BigDecimal sumDraftDirectSaleQuantity(
                        @org.springframework.data.repository.query.Param("itemCode") String itemCode);

        // --- STATEMENT QUERIES ---
        @Query("SELECT SUM(s.invoiceTotal) FROM SalesInvoice s WHERE s.customerCode = :customerCode AND s.invoiceDate < :startDate AND s.status <> 'CANCELLED'")
        Double calculateOpeningBalance(String customerCode, java.time.LocalDate startDate);

        // --- CREDIT LIMIT QUERIES ---
        /**
         * Returns total outstanding (unpaid) balance for a customer across all
         * non-cancelled invoices. Used by the credit-limit enforcement logic.
         */
        @Query("SELECT COALESCE(SUM(s.balance), 0) FROM SalesInvoice s WHERE s.customerCode = :customerCode "
                        + "AND s.status NOT IN (com.billbull.backend.sales.invoice.SalesInvoiceStatus.CANCELLED, "
                        + "com.billbull.backend.sales.invoice.SalesInvoiceStatus.PAID)")
        Double findOutstandingBalanceByCustomerCode(
                        @org.springframework.data.repository.query.Param("customerCode") String customerCode);

        @Query("SELECT new com.billbull.backend.financials.statement.StatementEntryDTO(s.invoiceDate, s.invoiceNumber, 'INVOICE', s.invoiceTotal, CAST(0 AS double), CAST(s.status AS string)) "
                        +
                        "FROM SalesInvoice s WHERE s.customerCode = :customerCode AND s.invoiceDate BETWEEN :startDate AND :endDate AND s.status <> 'CANCELLED'")
        List<com.billbull.backend.financials.statement.StatementEntryDTO> findStatementEntries(String customerCode,
                        java.time.LocalDate startDate, java.time.LocalDate endDate);

        @Query("SELECT new com.billbull.backend.sales.invoice.PriceHistoryDTO(s.invoiceDate, s.invoiceNumber, s.customerName, i.price) "
                        +
                        "FROM SalesInvoiceItem i JOIN i.salesInvoice s " +
                        "WHERE i.itemCode = :itemCode AND s.status = com.billbull.backend.sales.invoice.SalesInvoiceStatus.POSTED "
                        +
                        "ORDER BY s.invoiceDate DESC, s.id DESC")
        List<PriceHistoryDTO> findPriceHistoryByItemCode(String itemCode,
                        org.springframework.data.domain.Pageable pageable);

        @Query("SELECT new com.billbull.backend.sales.invoice.PriceHistoryDTO(s.invoiceDate, s.invoiceNumber, s.customerName, i.price) "
                        +
                        "FROM SalesInvoiceItem i JOIN i.salesInvoice s " +
                        "WHERE i.itemCode = :itemCode AND s.status = com.billbull.backend.sales.invoice.SalesInvoiceStatus.POSTED "
                        + "AND (s.branchId = :branchId OR s.branchId IS NULL) "
                        +
                        "ORDER BY s.invoiceDate DESC, s.id DESC")
        List<PriceHistoryDTO> findPriceHistoryByItemCodeAndBranchScope(
                        String itemCode,
                        Long branchId,
                        org.springframework.data.domain.Pageable pageable);

        // --- RECONCILIATION QUERIES ---

        /** Posted invoices where delivery is still PENDING (no delivery note completed). */
        @Query("SELECT s FROM SalesInvoice s WHERE s.status IN ('POSTED', 'CONFIRMED', 'PARTIALLY_PAID') "
                        + "AND s.deliveryStatus = 'PENDING'")
        List<SalesInvoice> findOrphanedInvoices();

        /** Delivered invoices where total recognized revenue on items is less than subTotal. */
        @Query("SELECT DISTINCT s FROM SalesInvoice s JOIN s.items i "
                        + "WHERE s.deliveryStatus = 'DELIVERED' "
                        + "AND s.status NOT IN ('CANCELLED', 'DRAFT') "
                        + "GROUP BY s "
                        + "HAVING COALESCE(SUM(i.recognizedRevenue), 0) < s.subTotal")
        List<SalesInvoice> findUnderRecognizedInvoices();

        /** Invoices where total recognized revenue exceeds subTotal (data corruption). */
        @Query("SELECT DISTINCT s FROM SalesInvoice s JOIN s.items i "
                        + "WHERE s.status NOT IN ('CANCELLED', 'DRAFT') "
                        + "GROUP BY s "
                        + "HAVING COALESCE(SUM(i.recognizedRevenue), 0) > s.subTotal")
        List<SalesInvoice> findOverRecognizedInvoices();
}
