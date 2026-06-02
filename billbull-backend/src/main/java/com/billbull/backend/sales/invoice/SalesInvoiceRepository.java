package com.billbull.backend.sales.invoice;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@Repository
public interface SalesInvoiceRepository extends JpaRepository<SalesInvoice, Long> {

        Optional<SalesInvoice> findByInvoiceNumber(String invoiceNumber);

        boolean existsByCustomerCode(String customerCode);

        List<SalesInvoice> findAllByOrderByInvoiceDateDesc();

        /**
         * Sales-report loader: date-bounded invoices with their line items fetched
         * in a single query (no per-invoice N+1). Pass null dates for no bound.
         */
        @Query("SELECT DISTINCT i FROM SalesInvoice i LEFT JOIN FETCH i.items "
                        + "WHERE (:dateFrom IS NULL OR i.invoiceDate >= :dateFrom) "
                        + "AND (:dateTo IS NULL OR i.invoiceDate <= :dateTo) "
                        + "ORDER BY i.invoiceDate DESC")
        List<SalesInvoice> findForReports(@Param("dateFrom") LocalDate dateFrom,
                        @Param("dateTo") LocalDate dateTo);

        /** QA-018: batch lookup used by StatementService to populate description/reference. */
        List<SalesInvoice> findByInvoiceNumberIn(List<String> invoiceNumbers);

        @Query("SELECT MAX(i.invoiceNumber) FROM SalesInvoice i WHERE i.invoiceNumber LIKE :prefix%")
        String findLastInvoiceNumberByPrefix(@Param("prefix") String prefix);

        @Query("SELECT i.invoiceNumber FROM SalesInvoice i WHERE i.invoiceNumber LIKE CONCAT(:prefix, '%')")
        List<String> findInvoiceNumbersByPrefix(@Param("prefix") String prefix);

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
                        "WHERE i.itemCode = :itemCode AND s.status NOT IN (com.billbull.backend.sales.invoice.SalesInvoiceStatus.DRAFT, com.billbull.backend.sales.invoice.SalesInvoiceStatus.CANCELLED) "
                        + "AND (:customerCode IS NULL OR :customerCode = '' OR s.customerCode = :customerCode) "
                        + "AND (s.branchId = :branchId OR s.branchId IS NULL) "
                        +
                        "ORDER BY s.invoiceDate DESC, s.id DESC")
        List<PriceHistoryDTO> findPriceHistoryByItemCodeAndBranchScope(
                        @Param("itemCode") String itemCode,
                        @Param("customerCode") String customerCode,
                        @Param("branchId") Long branchId,
                        org.springframework.data.domain.Pageable pageable);

        // --- DASHBOARD AGGREGATE QUERIES ---

        @Query("SELECT si.invoiceDate, SUM(si.invoiceTotal), COUNT(si) FROM SalesInvoice si " +
               "WHERE si.status <> com.billbull.backend.sales.invoice.SalesInvoiceStatus.CANCELLED " +
               "AND (:startDate IS NULL OR si.invoiceDate >= :startDate) " +
               "AND (:endDate IS NULL OR si.invoiceDate < :endDate) " +
               "GROUP BY si.invoiceDate ORDER BY si.invoiceDate")
        List<Object[]> findSalesTrend(@Param("startDate") LocalDate startDate,
                                      @Param("endDate") LocalDate endDate);

        @Query("SELECT COALESCE(si.paymentMode, 'Cash'), SUM(si.invoiceTotal) FROM SalesInvoice si " +
               "WHERE si.status <> com.billbull.backend.sales.invoice.SalesInvoiceStatus.CANCELLED " +
               "AND (:startDate IS NULL OR si.invoiceDate >= :startDate) " +
               "AND (:endDate IS NULL OR si.invoiceDate < :endDate) " +
               "GROUP BY si.paymentMode")
        List<Object[]> findPaymentBreakdown(@Param("startDate") LocalDate startDate,
                                            @Param("endDate") LocalDate endDate);

        @Query("SELECT COALESCE(SUM(si.invoiceTotal), 0), COUNT(si), COALESCE(SUM(si.balance), 0) " +
               "FROM SalesInvoice si " +
               "WHERE si.status <> com.billbull.backend.sales.invoice.SalesInvoiceStatus.CANCELLED " +
               "AND (:startDate IS NULL OR si.invoiceDate >= :startDate) " +
               "AND (:endDate IS NULL OR si.invoiceDate < :endDate)")
        Object[] findSalesTotals(@Param("startDate") LocalDate startDate,
                                 @Param("endDate") LocalDate endDate);

        @Query(value = "SELECT COALESCE(d.name, 'Uncategorized') AS dept_name, SUM(sii.net_amount) AS revenue " +
                       "FROM sales_invoice_items sii " +
                       "JOIN sales_invoices si ON si.id = sii.sales_invoice_id " +
                       "LEFT JOIN products p ON p.code = sii.item_code AND p.is_active = true " +
                       "LEFT JOIN departments d ON d.id = p.department_id " +
                       "WHERE si.status <> 'CANCELLED' " +
                       "AND (:startDate IS NULL OR si.invoice_date >= :startDate) " +
                       "AND (:endDate IS NULL OR si.invoice_date < :endDate) " +
                       "GROUP BY d.name ORDER BY revenue DESC LIMIT 4",
               nativeQuery = true)
        List<Object[]> findTopDepartments(@Param("startDate") LocalDate startDate,
                                          @Param("endDate") LocalDate endDate);

        @Query("SELECT si FROM SalesInvoice si ORDER BY si.id DESC")
        List<SalesInvoice> findRecentForDashboard(Pageable pageable);

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
