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

        List<SalesInvoice> findByInvoiceDateBetween(LocalDate from, LocalDate to);

        /**
         * Sales-report loader: date-bounded invoices with their line items fetched
         * in a single query (no per-invoice N+1). Pass null dates for no bound.
         */
        @Query("SELECT DISTINCT i FROM SalesInvoice i LEFT JOIN FETCH i.items "
                        + "WHERE i.invoiceDate >= :dateFrom AND i.invoiceDate <= :dateTo "
                        + "ORDER BY i.invoiceDate DESC")
        List<SalesInvoice> findForReportsBounded(@Param("dateFrom") LocalDate dateFrom,
                        @Param("dateTo") LocalDate dateTo);

        @Query("SELECT DISTINCT i FROM SalesInvoice i LEFT JOIN FETCH i.items "
                        + "WHERE i.invoiceDate >= :dateFrom "
                        + "ORDER BY i.invoiceDate DESC")
        List<SalesInvoice> findForReportsFromDate(@Param("dateFrom") LocalDate dateFrom);

        @Query("SELECT DISTINCT i FROM SalesInvoice i LEFT JOIN FETCH i.items "
                        + "WHERE i.invoiceDate <= :dateTo "
                        + "ORDER BY i.invoiceDate DESC")
        List<SalesInvoice> findForReportsToDate(@Param("dateTo") LocalDate dateTo);

        @Query("SELECT DISTINCT i FROM SalesInvoice i LEFT JOIN FETCH i.items "
                        + "ORDER BY i.invoiceDate DESC")
        List<SalesInvoice> findForReportsAll();

        default List<SalesInvoice> findForReports(LocalDate dateFrom, LocalDate dateTo) {
                if (dateFrom != null && dateTo != null) return findForReportsBounded(dateFrom, dateTo);
                if (dateFrom != null) return findForReportsFromDate(dateFrom);
                if (dateTo != null) return findForReportsToDate(dateTo);
                return findForReportsAll();
        }

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
               "AND si.invoiceDate BETWEEN :startDate AND :endDate " +
               "AND (:branchId IS NULL OR si.branchId = :branchId) " +
               "GROUP BY si.invoiceDate ORDER BY si.invoiceDate")
        List<Object[]> findSalesTrend(@Param("startDate") LocalDate startDate,
                                      @Param("endDate") LocalDate endDate,
                                      @Param("branchId") Long branchId);

        default List<Object[]> findSalesTrend(LocalDate startDate, LocalDate endDate) {
            return findSalesTrend(startDate, endDate, null);
        }

        @Query("SELECT COALESCE(si.paymentMode, 'Cash'), SUM(si.invoiceTotal) FROM SalesInvoice si " +
               "WHERE si.status <> com.billbull.backend.sales.invoice.SalesInvoiceStatus.CANCELLED " +
               "AND si.invoiceDate BETWEEN :startDate AND :endDate " +
               "AND (:branchId IS NULL OR si.branchId = :branchId) " +
               "GROUP BY si.paymentMode")
        List<Object[]> findPaymentBreakdown(@Param("startDate") LocalDate startDate,
                                            @Param("endDate") LocalDate endDate,
                                            @Param("branchId") Long branchId);

        default List<Object[]> findPaymentBreakdown(LocalDate startDate, LocalDate endDate) {
            return findPaymentBreakdown(startDate, endDate, null);
        }

        @Query("SELECT COALESCE(SUM(si.invoiceTotal), 0) FROM SalesInvoice si " +
               "WHERE si.status <> com.billbull.backend.sales.invoice.SalesInvoiceStatus.CANCELLED " +
               "AND si.invoiceDate BETWEEN :from AND :to " +
               "AND (:branchId IS NULL OR si.branchId = :branchId)")
        Double sumRevenueBetween(@Param("from") LocalDate from, @Param("to") LocalDate to,
                                 @Param("branchId") Long branchId);

        default Double sumRevenueBetween(LocalDate from, LocalDate to) {
            return sumRevenueBetween(from, to, null);
        }

        @Query("SELECT COUNT(si) FROM SalesInvoice si " +
               "WHERE si.status <> com.billbull.backend.sales.invoice.SalesInvoiceStatus.CANCELLED " +
               "AND si.invoiceDate BETWEEN :from AND :to " +
               "AND (:branchId IS NULL OR si.branchId = :branchId)")
        long countBetween(@Param("from") LocalDate from, @Param("to") LocalDate to,
                          @Param("branchId") Long branchId);

        default long countBetween(LocalDate from, LocalDate to) {
            return countBetween(from, to, null);
        }

        @Query("SELECT COALESCE(SUM(si.balance), 0) FROM SalesInvoice si " +
               "WHERE si.status NOT IN (" +
               "  com.billbull.backend.sales.invoice.SalesInvoiceStatus.CANCELLED," +
               "  com.billbull.backend.sales.invoice.SalesInvoiceStatus.PAID" +
               ") AND si.balance > 0")
        Double sumOutstandingBalance();

        @Query(value = "SELECT COALESCE(d.name, 'Uncategorized') AS dept_name, SUM(sii.net_amount) AS revenue " +
                       "FROM sales_invoice_items sii " +
                       "JOIN sales_invoices si ON si.id = sii.sales_invoice_id " +
                       "LEFT JOIN products p ON p.code = sii.item_code AND p.is_active = true " +
                       "LEFT JOIN departments d ON d.id = p.department_id " +
                       "WHERE si.status <> 'CANCELLED' " +
                       "AND si.invoice_date >= :startDate " +
                       "AND si.invoice_date < :endDate " +
                       "AND (:branchId IS NULL OR si.branch_id = :branchId) " +
                       "GROUP BY d.name ORDER BY revenue DESC LIMIT 4",
               nativeQuery = true)
        List<Object[]> findTopDepartments(@Param("startDate") LocalDate startDate,
                                          @Param("endDate") LocalDate endDate,
                                          @Param("branchId") Long branchId);

        default List<Object[]> findTopDepartments(LocalDate startDate, LocalDate endDate) {
            return findTopDepartments(startDate, endDate, null);
        }

        @Query("SELECT si FROM SalesInvoice si ORDER BY si.id DESC")
        List<SalesInvoice> findRecentForDashboard(Pageable pageable);

        @Query("SELECT COALESCE(SUM(si.taxTotal), 0) FROM SalesInvoice si " +
               "WHERE si.status <> com.billbull.backend.sales.invoice.SalesInvoiceStatus.CANCELLED " +
               "AND si.invoiceDate BETWEEN :from AND :to " +
               "AND (:branchId IS NULL OR si.branchId = :branchId)")
        Double sumTaxTotalBetween(@Param("from") LocalDate from, @Param("to") LocalDate to,
                                  @Param("branchId") Long branchId);

        default Double sumTaxTotalBetween(LocalDate from, LocalDate to) {
            return sumTaxTotalBetween(from, to, null);
        }

        @Query("SELECT COUNT(DISTINCT si.customerName) FROM SalesInvoice si " +
               "WHERE si.status <> com.billbull.backend.sales.invoice.SalesInvoiceStatus.CANCELLED " +
               "AND si.invoiceDate BETWEEN :from AND :to")
        long countDistinctCustomersBetween(@Param("from") LocalDate from, @Param("to") LocalDate to);

        @Query(value = "SELECT sii.item_code, " +
                       "MIN(COALESCE(p.name, sii.item_name)) AS product_name, " +
                       "COALESCE(MIN(d.name), 'Uncategorized') AS dept_name, " +
                       "SUM(sii.quantity) AS qty_sold, " +
                       "SUM(sii.net_amount) AS revenue, " +
                       "MIN(p.id) AS product_id " +
                       "FROM sales_invoice_items sii " +
                       "JOIN sales_invoices si ON si.id = sii.sales_invoice_id " +
                       "LEFT JOIN products p ON p.code = sii.item_code AND p.is_active = true " +
                       "LEFT JOIN departments d ON d.id = p.department_id " +
                       "WHERE si.status <> 'CANCELLED' " +
                       "AND si.invoice_date BETWEEN :startDate AND :endDate " +
                       "AND (:branchId IS NULL OR si.branch_id = :branchId) " +
                       "GROUP BY sii.item_code ORDER BY revenue DESC LIMIT 5",
               nativeQuery = true)
        List<Object[]> findTopProductsBetween(@Param("startDate") LocalDate startDate,
                                              @Param("endDate") LocalDate endDate,
                                              @Param("branchId") Long branchId);

        default List<Object[]> findTopProductsBetween(LocalDate startDate, LocalDate endDate) {
            return findTopProductsBetween(startDate, endDate, null);
        }

        @Query(value = "SELECT EXTRACT(HOUR FROM si.created_at) AS hour, " +
                       "COALESCE(SUM(si.invoice_total), 0) AS sales, COUNT(si.id) AS cnt " +
                       "FROM sales_invoices si " +
                       "WHERE si.status <> 'CANCELLED' AND DATE(si.created_at) = :date " +
                       "AND (:branchId IS NULL OR si.branch_id = :branchId) " +
                       "GROUP BY EXTRACT(HOUR FROM si.created_at) ORDER BY hour",
               nativeQuery = true)
        List<Object[]> findHourlySalesTrend(@Param("date") LocalDate date,
                                            @Param("branchId") Long branchId);

        default List<Object[]> findHourlySalesTrend(LocalDate date) {
            return findHourlySalesTrend(date, null);
        }

        // Branch-level revenue breakdown for a date range
        @Query("SELECT COALESCE(si.branchName, 'Head Office'), SUM(si.invoiceTotal) FROM SalesInvoice si " +
               "WHERE si.status <> com.billbull.backend.sales.invoice.SalesInvoiceStatus.CANCELLED " +
               "AND si.invoiceDate BETWEEN :from AND :to " +
               "AND (:branchId IS NULL OR si.branchId = :branchId) " +
               "GROUP BY si.branchName ORDER BY SUM(si.invoiceTotal) DESC")
        List<Object[]> findBranchPerformanceBetween(@Param("from") LocalDate from, @Param("to") LocalDate to,
                                                    @Param("branchId") Long branchId);

        default List<Object[]> findBranchPerformanceBetween(LocalDate from, LocalDate to) {
            return findBranchPerformanceBetween(from, to, null);
        }

        // Daily profit trend (net_amount minus cost × quantity per day)
        @Query(value = "SELECT si.invoice_date, " +
                       "COALESCE(SUM(sii.net_amount - COALESCE(sii.cost, 0) * sii.quantity), 0) " +
                       "FROM sales_invoices si " +
                       "JOIN sales_invoice_items sii ON sii.sales_invoice_id = si.id " +
                       "WHERE si.status <> 'CANCELLED' AND si.invoice_date BETWEEN :from AND :to " +
                       "AND (:branchId IS NULL OR si.branch_id = :branchId) " +
                       "GROUP BY si.invoice_date ORDER BY si.invoice_date",
               nativeQuery = true)
        List<Object[]> findDailyProfitTrend(@Param("from") LocalDate from, @Param("to") LocalDate to,
                                            @Param("branchId") Long branchId);

        default List<Object[]> findDailyProfitTrend(LocalDate from, LocalDate to) {
            return findDailyProfitTrend(from, to, null);
        }

        // Total profit for a date range
        @Query(value = "SELECT COALESCE(SUM(sii.net_amount - COALESCE(sii.cost, 0) * sii.quantity), 0) " +
                       "FROM sales_invoices si " +
                       "JOIN sales_invoice_items sii ON sii.sales_invoice_id = si.id " +
                       "WHERE si.status <> 'CANCELLED' AND si.invoice_date BETWEEN :from AND :to " +
                       "AND (:branchId IS NULL OR si.branch_id = :branchId)",
               nativeQuery = true)
        Double sumProfitBetween(@Param("from") LocalDate from, @Param("to") LocalDate to,
                                @Param("branchId") Long branchId);

        default Double sumProfitBetween(LocalDate from, LocalDate to) {
            return sumProfitBetween(from, to, null);
        }

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

        /** Global AR sub-ledger total: sum of open balances across all non-cancelled invoices. Used by reconciliation. */
        @Query("SELECT COALESCE(SUM(s.balance), 0) FROM SalesInvoice s WHERE s.status NOT IN (com.billbull.backend.sales.invoice.SalesInvoiceStatus.CANCELLED, com.billbull.backend.sales.invoice.SalesInvoiceStatus.PAID)")
        java.math.BigDecimal sumGlobalOutstandingBalance();

        /**
         * Bulk AR per customer: returns [customerCode, totalInvoiceAmount] for all
         * non-cancelled invoices. Used by CustomerService to compute currentBalance
         * for the customer list without N+1 per-customer queries.
         */
        @Query("SELECT s.customerCode, COALESCE(SUM(s.invoiceTotal), 0) FROM SalesInvoice s " +
               "WHERE s.status <> com.billbull.backend.sales.invoice.SalesInvoiceStatus.CANCELLED " +
               "AND s.customerCode IS NOT NULL " +
               "GROUP BY s.customerCode")
        List<Object[]> sumInvoiceTotalByCustomerCode();

        /**
         * Bulk AR per customer: returns [customerCode, outstandingBalance] using the
         * per-invoice balance field (maintained on each payment). More accurate than
         * invoiceTotal - receipts for the customer list receivables tile.
         */
        @Query("SELECT s.customerCode, COALESCE(SUM(s.balance), 0) FROM SalesInvoice s " +
               "WHERE s.status NOT IN (com.billbull.backend.sales.invoice.SalesInvoiceStatus.CANCELLED, " +
               "com.billbull.backend.sales.invoice.SalesInvoiceStatus.PAID) " +
               "AND s.customerCode IS NOT NULL " +
               "GROUP BY s.customerCode")
        List<Object[]> sumOutstandingBalanceByCustomerCode();
}
