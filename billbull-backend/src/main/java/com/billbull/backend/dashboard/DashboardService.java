package com.billbull.backend.dashboard;

import com.billbull.backend.financials.expense.ExpenseRepository;
import com.billbull.backend.hr.employees.EmployeeRepository;
import com.billbull.backend.inventory.product.ProductRepository;
import com.billbull.backend.purchase.grn.GrnRepository;
import com.billbull.backend.purchase.lpo.LpoRepository;
import com.billbull.backend.purchase.lpo.LpoStatus;
import com.billbull.backend.purchase.stockmovement.StockMovementRepository;
import com.billbull.backend.purchase.vendor.VendorRepository;
import com.billbull.backend.sales.customerledger.CustomerRepository;
import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;
import com.billbull.backend.sales.returns.SalesReturnRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.stream.Collectors;

@Service
@Transactional(readOnly = true)
public class DashboardService {

    private static final ExecutorService QUERY_POOL = Executors.newFixedThreadPool(20);

    // Server-side TTL cache: keyed by timeRange, shared across all users (data is not user-specific)
    private record CacheEntry(DashboardSummaryResponse data, long ts) {}
    private static final Map<String, CacheEntry> SUMMARY_CACHE = new ConcurrentHashMap<>();
    private static final long CACHE_TTL_MS = 3 * 60 * 1_000L; // 3 minutes

    private final SalesInvoiceRepository invoiceRepo;
    private final LpoRepository lpoRepo;
    private final GrnRepository grnRepo;
    private final EmployeeRepository employeeRepo;
    private final ProductRepository productRepo;
    private final StockMovementRepository stockMovementRepo;
    private final CustomerRepository customerRepo;
    private final ExpenseRepository expenseRepo;
    private final VendorRepository vendorRepo;
    private final SalesReturnRepository returnRepo;

    public DashboardService(SalesInvoiceRepository invoiceRepo,
                             LpoRepository lpoRepo,
                             GrnRepository grnRepo,
                             EmployeeRepository employeeRepo,
                             ProductRepository productRepo,
                             StockMovementRepository stockMovementRepo,
                             CustomerRepository customerRepo,
                             ExpenseRepository expenseRepo,
                             VendorRepository vendorRepo,
                             SalesReturnRepository returnRepo) {
        this.invoiceRepo = invoiceRepo;
        this.lpoRepo = lpoRepo;
        this.grnRepo = grnRepo;
        this.employeeRepo = employeeRepo;
        this.productRepo = productRepo;
        this.stockMovementRepo = stockMovementRepo;
        this.customerRepo = customerRepo;
        this.expenseRepo = expenseRepo;
        this.vendorRepo = vendorRepo;
        this.returnRepo = returnRepo;
    }

    public void invalidateCache() {
        SUMMARY_CACHE.clear();
    }

    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public DashboardSummaryResponse getSummary(String timeRange) {
        return getSummary(timeRange, null);
    }

    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public DashboardSummaryResponse getSummary(String timeRange, Long branchId) {
        String cacheKey = (timeRange == null ? "All Time" : timeRange) + ":" + (branchId == null ? "all" : branchId);

        // Serve from cache if still fresh
        CacheEntry cached = SUMMARY_CACHE.get(cacheKey);
        if (cached != null && System.currentTimeMillis() - cached.ts() < CACHE_TTL_MS) {
            return cached.data();
        }

        LocalDate[] range = resolveRange(timeRange);
        LocalDate startDate = range[0];
        LocalDate endDate = range[1];

        // Run all independent queries in parallel.
        LocalDate today = LocalDate.now();
        CompletableFuture<List<Object[]>> trendF        = CompletableFuture.supplyAsync(() -> invoiceRepo.findSalesTrend(startDate, endDate, branchId), QUERY_POOL);
        CompletableFuture<List<Object[]>> payF          = CompletableFuture.supplyAsync(() -> invoiceRepo.findPaymentBreakdown(startDate, endDate, branchId), QUERY_POOL);
        CompletableFuture<List<Object[]>> deptF         = CompletableFuture.supplyAsync(() -> invoiceRepo.findTopDepartments(startDate, endDate, branchId), QUERY_POOL);
        CompletableFuture<Double>         revenueF      = CompletableFuture.supplyAsync(() -> invoiceRepo.sumRevenueBetween(startDate, endDate, branchId), QUERY_POOL);
        CompletableFuture<Long>           invCountF     = CompletableFuture.supplyAsync(() -> invoiceRepo.countBetween(startDate, endDate, branchId), QUERY_POOL);
        CompletableFuture<Double>         outstandingF  = CompletableFuture.supplyAsync(() -> invoiceRepo.sumOutstandingBalance(), QUERY_POOL);
        CompletableFuture<List<SalesInvoice>> recentF   = CompletableFuture.supplyAsync(() -> invoiceRepo.findRecentForDashboard(branchId, PageRequest.of(0, 10)), QUERY_POOL);
        CompletableFuture<Long>           customerF     = CompletableFuture.supplyAsync(() -> customerRepo.count(), QUERY_POOL);
        CompletableFuture<List<Object[]>> topProductsF  = CompletableFuture.supplyAsync(() -> invoiceRepo.findTopProductsBetween(startDate, endDate, branchId), QUERY_POOL);
        CompletableFuture<Long>           totalLposF    = CompletableFuture.supplyAsync(() -> lpoRepo.count(), QUERY_POOL);
        CompletableFuture<Long>           pendingLposF  = CompletableFuture.supplyAsync(() ->
                lpoRepo.countByStatus(LpoStatus.PENDING_APPROVAL) + lpoRepo.countByStatus(LpoStatus.APPROVED), QUERY_POOL);
        CompletableFuture<Long>           grnCountF     = CompletableFuture.supplyAsync(() -> grnRepo.countBetween(startDate, endDate, branchId), QUERY_POOL);
        CompletableFuture<BigDecimal>     grnValueF     = CompletableFuture.supplyAsync(() -> grnRepo.sumGrandTotalBetween(startDate, endDate, branchId), QUERY_POOL);
        CompletableFuture<Long>           vendorCountF  = CompletableFuture.supplyAsync(() -> vendorRepo.count(), QUERY_POOL);
        CompletableFuture<Long>           totalEmpF     = CompletableFuture.supplyAsync(() -> employeeRepo.count(), QUERY_POOL);
        CompletableFuture<Long>           activeEmpF    = CompletableFuture.supplyAsync(() -> employeeRepo.countByStatus("ACTIVE"), QUERY_POOL);
        CompletableFuture<Long>           totalProdF    = CompletableFuture.supplyAsync(() -> productRepo.countAllActive(), QUERY_POOL);
        CompletableFuture<List<Object[]>> productStockF = CompletableFuture.supplyAsync(() -> stockMovementRepo.findActiveProductStockSummary(branchId), QUERY_POOL);
        CompletableFuture<BigDecimal> expenseTotalF     = CompletableFuture.supplyAsync(() -> expenseRepo.sumTotalBetween(startDate, endDate), QUERY_POOL);
        CompletableFuture<BigDecimal> expenseTaxF       = CompletableFuture.supplyAsync(() -> expenseRepo.sumTaxBetween(startDate, endDate), QUERY_POOL);
        CompletableFuture<List<Object[]>> expenseCatF   = CompletableFuture.supplyAsync(() -> expenseRepo.findTopCategoryBetween(startDate, endDate), QUERY_POOL);
        CompletableFuture<Double> vatOnSalesF           = CompletableFuture.supplyAsync(() -> invoiceRepo.sumTaxTotalBetween(startDate, endDate, branchId), QUERY_POOL);
        CompletableFuture<List<Object[]>> hourlySalesF  = CompletableFuture.supplyAsync(() -> invoiceRepo.findHourlySalesTrend(today, branchId), QUERY_POOL);
        CompletableFuture<List<Object[]>> branchPerfF   = CompletableFuture.supplyAsync(() -> invoiceRepo.findBranchPerformanceBetween(startDate, endDate, branchId), QUERY_POOL);
        CompletableFuture<List<Object[]>> dailyProfitF  = CompletableFuture.supplyAsync(() -> invoiceRepo.findDailyProfitTrend(startDate, endDate, branchId), QUERY_POOL);
        CompletableFuture<Double>         totalProfitF  = CompletableFuture.supplyAsync(() -> invoiceRepo.sumProfitBetween(startDate, endDate, branchId), QUERY_POOL);
        CompletableFuture<List<Object[]>> dailyReturnsF = CompletableFuture.supplyAsync(() -> returnRepo.findDailyReturnsTrend(startDate, endDate, branchId), QUERY_POOL);
        CompletableFuture<Double>         totalReturnsF = CompletableFuture.supplyAsync(() -> returnRepo.getTotalReturnsBetweenDates(startDate, endDate, branchId), QUERY_POOL);

        CompletableFuture.allOf(trendF, payF, deptF, revenueF, invCountF, outstandingF, recentF,
                customerF, topProductsF, totalLposF, pendingLposF, grnCountF, grnValueF,
                totalEmpF, activeEmpF, totalProdF, productStockF,
                expenseTotalF, expenseTaxF, expenseCatF, vatOnSalesF, vendorCountF,
                hourlySalesF, branchPerfF, dailyProfitF, totalProfitF, dailyReturnsF, totalReturnsF).join();

        DashboardSummaryResponse response = new DashboardSummaryResponse();
        DateTimeFormatter fmt = DateTimeFormatter.ISO_LOCAL_DATE;

        // Build profit-by-date and returns-by-date lookup maps for merging into the trend
        Map<String, Double> profitByDate = dailyProfitF.join().stream().collect(
                Collectors.toMap(
                        row -> row[0].toString(),
                        row -> row[1] instanceof Number ? ((Number) row[1]).doubleValue() : 0d,
                        (a, b) -> a));
        Map<String, Double> returnsByDate = dailyReturnsF.join().stream().collect(
                Collectors.toMap(
                        row -> row[0].toString(),
                        row -> row[1] instanceof Number ? ((Number) row[1]).doubleValue() : 0d,
                        (a, b) -> a));

        // Sales trend with profit and returns per day
        response.setSalesTrend(trendF.join().stream().map(row -> {
            LocalDate date = (LocalDate) row[0];
            double sales = row[1] instanceof Number ? ((Number) row[1]).doubleValue() : 0d;
            long count = row[2] instanceof Number ? ((Number) row[2]).longValue() : 0L;
            double profit = profitByDate.getOrDefault(date.toString(), 0d);
            double returns = returnsByDate.getOrDefault(date.toString(), 0d);
            return new DashboardSummaryResponse.TrendPoint(date.toString(), sales, count, profit, returns);
        }).collect(Collectors.toList()));

        // Payment breakdown
        response.setPaymentBreakdown(payF.join().stream().map(row -> {
            String label = row[0] != null ? row[0].toString() : "Cash";
            double value = row[1] instanceof Number ? ((Number) row[1]).doubleValue() : 0d;
            return new DashboardSummaryResponse.ChartEntry(label, value);
        }).collect(Collectors.toList()));

        // Top departments
        response.setTopDepartments(deptF.join().stream().map(row -> {
            String label = row[0] != null ? row[0].toString() : "Uncategorized";
            double value = row[1] instanceof Number ? ((Number) row[1]).doubleValue() : 0d;
            return new DashboardSummaryResponse.ChartEntry(label, value);
        }).collect(Collectors.toList()));

        // Top products
        response.setTopProducts(topProductsF.join().stream().map(row -> {
            String code = row[0] != null ? row[0].toString() : "";
            String name = row[1] != null ? row[1].toString() : code;
            String dept = row[2] != null ? row[2].toString() : "Uncategorized";
            long qty = row[3] instanceof Number ? ((Number) row[3]).longValue() : 0L;
            double rev = row[4] instanceof Number ? ((Number) row[4]).doubleValue() : 0d;
            Long productId = row[5] instanceof Number ? ((Number) row[5]).longValue() : null;
            return new DashboardSummaryResponse.TopProduct(productId, code, name, dept, qty, rev);
        }).collect(Collectors.toList()));

        // Sales metrics (now includes profit and returns totals)
        double totalRevenue = revenueF.join() != null ? revenueF.join() : 0d;
        double outstanding = outstandingF.join() != null ? outstandingF.join() : 0d;
        double totalProfit = totalProfitF.join() != null ? totalProfitF.join() : 0d;
        double totalReturns = totalReturnsF.join() != null ? totalReturnsF.join() : 0d;
        response.setSalesMetrics(new DashboardSummaryResponse.SalesMetrics(
                totalRevenue, invCountF.join(), outstanding, customerF.join(), totalProfit, totalReturns));

        DateTimeFormatter isoDateTime = DateTimeFormatter.ISO_LOCAL_DATE_TIME;
        // Recent transactions
        response.setRecentTransactions(recentF.join().stream().map(inv -> {
            String createdAtStr = null;
            if (inv.getCreatedAt() != null) {
                createdAtStr = inv.getCreatedAt().format(isoDateTime);
            }
            return new DashboardSummaryResponse.RecentTransaction(
                    inv.getId().toString(),
                    inv.getInvoiceNumber(),
                    inv.getCustomerName(),
                    inv.getInvoiceTotal() != null ? inv.getInvoiceTotal().doubleValue() : 0d,
                    inv.getStatus() != null ? inv.getStatus().toString() : "DRAFT",
                    inv.getInvoiceDate() != null ? inv.getInvoiceDate().format(fmt) : null,
                    createdAtStr
            );
        }).collect(Collectors.toList()));

        // Purchase metrics
        double grnTotal = grnValueF.join() != null ? grnValueF.join().doubleValue() : 0d;
        response.setPurchaseMetrics(new DashboardSummaryResponse.PurchaseMetrics(
                totalLposF.join(), pendingLposF.join(), grnCountF.join(), grnTotal, vendorCountF.join()));

        // HR metrics
        response.setHrMetrics(new DashboardSummaryResponse.HrMetrics(totalEmpF.join(), activeEmpF.join()));

        // Inventory metrics — derive low-stock and slow-moving from the single combined stock query
        long totalProducts = totalProdF.join();
        List<Object[]> productStock = productStockF.join();
        LocalDate slowMovingThreshold = today.minusDays(30);

        long outOfStockCount = 0L;
        long lowStockCount = 0L;
        double stockCost = 0d;
        List<DashboardSummaryResponse.LowStockProduct> allLowStock = new ArrayList<>();
        List<DashboardSummaryResponse.LowStockProduct> allSlowMoving = new ArrayList<>();

        for (Object[] row : productStock) {
            double onHand = row[3] instanceof Number ? ((Number) row[3]).doubleValue() : 0d;
            double val    = row[5] instanceof Number ? ((Number) row[5]).doubleValue() : 0d;
            stockCost += val;

            long pid    = row[0] instanceof Number ? ((Number) row[0]).longValue() : 0L;
            String sku  = row[1] != null ? row[1].toString() : "";
            String pname = row[2] != null ? row[2].toString() : sku;
            String lastSoldStr = row[4] != null ? row[4].toString() : null;

            if (onHand <= 0) {
                outOfStockCount++;
            } else {
                if (onHand < 10) {
                    lowStockCount++;
                    allLowStock.add(new DashboardSummaryResponse.LowStockProduct(pid, sku, pname, onHand, lastSoldStr));
                }
                // Slow-moving: in stock but not sold in the last 30 days (or never sold)
                LocalDate lastSoldDate = null;
                if (lastSoldStr != null) {
                    try { lastSoldDate = LocalDate.parse(lastSoldStr.substring(0, 10)); } catch (Exception ignored) {}
                }
                if (lastSoldDate == null || lastSoldDate.isBefore(slowMovingThreshold)) {
                    allSlowMoving.add(new DashboardSummaryResponse.LowStockProduct(pid, sku, pname, onHand, lastSoldStr));
                }
            }
        }

        allLowStock.sort(Comparator.comparingDouble(DashboardSummaryResponse.LowStockProduct::getOnHand));
        List<DashboardSummaryResponse.LowStockProduct> lowStockProds = allLowStock.stream().limit(10).collect(Collectors.toList());

        // Slow-moving: oldest last-sold first (null = never sold → most stagnant)
        allSlowMoving.sort(Comparator.comparing(p -> p.getLastSold() == null ? "" : p.getLastSold()));
        List<DashboardSummaryResponse.LowStockProduct> slowMovingProds = allSlowMoving.stream().limit(10).collect(Collectors.toList());

        response.setInventoryMetrics(new DashboardSummaryResponse.InventoryMetrics(
                totalProducts, totalProducts, lowStockCount, outOfStockCount, stockCost, lowStockProds, slowMovingProds));

        // Hourly sales (always today, regardless of selected time range)
        response.setHourlySales(hourlySalesF.join().stream().map(row -> {
            int hour  = row[0] instanceof Number ? ((Number) row[0]).intValue() : 0;
            double s  = row[1] instanceof Number ? ((Number) row[1]).doubleValue() : 0d;
            long cnt  = row[2] instanceof Number ? ((Number) row[2]).longValue() : 0L;
            return new DashboardSummaryResponse.HourlySalesPoint(hour, s, cnt);
        }).collect(Collectors.toList()));

        // Branch performance
        response.setBranchPerformance(branchPerfF.join().stream().map(row -> {
            String branch = row[0] != null ? row[0].toString() : "Head Office";
            double s      = row[1] instanceof Number ? ((Number) row[1]).doubleValue() : 0d;
            return new DashboardSummaryResponse.BranchPerformancePoint(branch, s);
        }).collect(Collectors.toList()));

        // Accounting snapshot
        double cashInflow   = totalRevenue;
        double expTotal     = expenseTotalF.join() != null ? expenseTotalF.join().doubleValue() : 0d;
        double cashOutflow  = grnTotal + expTotal;
        double vatSales     = vatOnSalesF.join() != null ? vatOnSalesF.join() : 0d;
        double vatPurchases = expenseTaxF.join() != null ? expenseTaxF.join().doubleValue() : 0d;
        List<Object[]> topCats = expenseCatF.join();
        String majorHead = topCats != null && !topCats.isEmpty() && topCats.get(0)[0] != null
                ? topCats.get(0)[0].toString() : "";
        response.setAccountingSnapshot(new DashboardSummaryResponse.AccountingSnapshot(
                cashInflow, cashOutflow, cashInflow - cashOutflow,
                expTotal, majorHead,
                vatSales, vatPurchases, vatSales - vatPurchases,
                outstanding, 0d));

        // Store in cache before returning
        SUMMARY_CACHE.put(cacheKey, new CacheEntry(response, System.currentTimeMillis()));
        return response;
    }

    private LocalDate[] resolveRange(String timeRange) {
        LocalDate today = LocalDate.now();
        return switch (timeRange == null ? "All Time" : timeRange) {
            case "Today"      -> new LocalDate[]{ today, today.plusDays(1) };
            case "Yesterday"  -> new LocalDate[]{ today.minusDays(1), today };
            case "This Week"  -> new LocalDate[]{ today.with(java.time.DayOfWeek.MONDAY), today.plusDays(1) };
            case "This Month" -> new LocalDate[]{ today.withDayOfMonth(1), today.plusDays(1) };
            case "This Year"  -> new LocalDate[]{ today.withDayOfYear(1), today.plusDays(1) };
            default           -> new LocalDate[]{ LocalDate.of(2000, 1, 1), today.plusDays(1) };
        };
    }
}
