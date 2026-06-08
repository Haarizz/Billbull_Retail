package com.billbull.backend.dashboard;

import com.billbull.backend.hr.employees.EmployeeRepository;
import com.billbull.backend.inventory.product.ProductRepository;
import com.billbull.backend.purchase.grn.GrnRepository;
import com.billbull.backend.purchase.lpo.LpoRepository;
import com.billbull.backend.purchase.lpo.LpoStatus;
import com.billbull.backend.purchase.stockmovement.StockMovementRepository;
import com.billbull.backend.sales.customerledger.CustomerRepository;
import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;
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

    public DashboardService(SalesInvoiceRepository invoiceRepo,
                             LpoRepository lpoRepo,
                             GrnRepository grnRepo,
                             EmployeeRepository employeeRepo,
                             ProductRepository productRepo,
                             StockMovementRepository stockMovementRepo,
                             CustomerRepository customerRepo) {
        this.invoiceRepo = invoiceRepo;
        this.lpoRepo = lpoRepo;
        this.grnRepo = grnRepo;
        this.employeeRepo = employeeRepo;
        this.productRepo = productRepo;
        this.stockMovementRepo = stockMovementRepo;
        this.customerRepo = customerRepo;
    }

    public void invalidateCache() {
        SUMMARY_CACHE.clear();
    }

    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public DashboardSummaryResponse getSummary(String timeRange) {
        String cacheKey = timeRange == null ? "All Time" : timeRange;

        // Serve from cache if still fresh
        CacheEntry cached = SUMMARY_CACHE.get(cacheKey);
        if (cached != null && System.currentTimeMillis() - cached.ts() < CACHE_TTL_MS) {
            return cached.data();
        }

        LocalDate[] range = resolveRange(timeRange);
        LocalDate startDate = range[0];
        LocalDate endDate = range[1];

        // Run all independent queries in parallel.
        // productStockF replaces the previous 4 separate stock-movement full scans:
        //   sumGlobalInventoryValue + countLowStockActiveProducts +
        //   countOutOfStockActiveProducts + findLowStockProductsForDashboard
        CompletableFuture<List<Object[]>> trendF       = CompletableFuture.supplyAsync(() -> invoiceRepo.findSalesTrend(startDate, endDate), QUERY_POOL);
        CompletableFuture<List<Object[]>> payF         = CompletableFuture.supplyAsync(() -> invoiceRepo.findPaymentBreakdown(startDate, endDate), QUERY_POOL);
        CompletableFuture<List<Object[]>> deptF        = CompletableFuture.supplyAsync(() -> invoiceRepo.findTopDepartments(startDate, endDate), QUERY_POOL);
        CompletableFuture<Double>         revenueF     = CompletableFuture.supplyAsync(() -> invoiceRepo.sumRevenueBetween(startDate, endDate), QUERY_POOL);
        CompletableFuture<Long>           invCountF    = CompletableFuture.supplyAsync(() -> invoiceRepo.countBetween(startDate, endDate), QUERY_POOL);
        CompletableFuture<Double>         outstandingF = CompletableFuture.supplyAsync(() -> invoiceRepo.sumOutstandingBalance(), QUERY_POOL);
        CompletableFuture<List<SalesInvoice>> recentF  = CompletableFuture.supplyAsync(() -> invoiceRepo.findRecentForDashboard(PageRequest.of(0, 10)), QUERY_POOL);
        CompletableFuture<Long>           customerF    = CompletableFuture.supplyAsync(() -> customerRepo.count(), QUERY_POOL);
        CompletableFuture<List<Object[]>> topProductsF = CompletableFuture.supplyAsync(() -> invoiceRepo.findTopProductsBetween(startDate, endDate), QUERY_POOL);
        CompletableFuture<Long>           totalLposF   = CompletableFuture.supplyAsync(() -> lpoRepo.count(), QUERY_POOL);
        CompletableFuture<Long>           pendingLposF = CompletableFuture.supplyAsync(() ->
                lpoRepo.countByStatus(LpoStatus.PENDING_APPROVAL) + lpoRepo.countByStatus(LpoStatus.APPROVED), QUERY_POOL);
        CompletableFuture<Long>           grnCountF    = CompletableFuture.supplyAsync(() -> grnRepo.countBetween(startDate, endDate), QUERY_POOL);
        CompletableFuture<BigDecimal>     grnValueF    = CompletableFuture.supplyAsync(() -> grnRepo.sumGrandTotalBetween(startDate, endDate), QUERY_POOL);
        CompletableFuture<Long>           totalEmpF    = CompletableFuture.supplyAsync(() -> employeeRepo.count(), QUERY_POOL);
        CompletableFuture<Long>           activeEmpF   = CompletableFuture.supplyAsync(() -> employeeRepo.countByStatus("ACTIVE"), QUERY_POOL);
        CompletableFuture<Long>           totalProdF   = CompletableFuture.supplyAsync(() -> productRepo.countAllActive(), QUERY_POOL);
        CompletableFuture<List<Object[]>> productStockF = CompletableFuture.supplyAsync(() -> stockMovementRepo.findActiveProductStockSummary(), QUERY_POOL);

        CompletableFuture.allOf(trendF, payF, deptF, revenueF, invCountF, outstandingF, recentF,
                customerF, topProductsF, totalLposF, pendingLposF, grnCountF, grnValueF,
                totalEmpF, activeEmpF, totalProdF, productStockF).join();

        DashboardSummaryResponse response = new DashboardSummaryResponse();
        DateTimeFormatter fmt = DateTimeFormatter.ISO_LOCAL_DATE;

        // Sales trend
        response.setSalesTrend(trendF.join().stream().map(row -> {
            LocalDate date = (LocalDate) row[0];
            double sales = row[1] instanceof Number ? ((Number) row[1]).doubleValue() : 0d;
            long count = row[2] instanceof Number ? ((Number) row[2]).longValue() : 0L;
            return new DashboardSummaryResponse.TrendPoint(date.toString(), sales, count);
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
            return new DashboardSummaryResponse.TopProduct(code, name, dept, qty, rev);
        }).collect(Collectors.toList()));

        // Sales metrics
        double totalRevenue = revenueF.join() != null ? revenueF.join() : 0d;
        double outstanding = outstandingF.join() != null ? outstandingF.join() : 0d;
        response.setSalesMetrics(new DashboardSummaryResponse.SalesMetrics(
                totalRevenue, invCountF.join(), outstanding, customerF.join()));

        // Recent transactions
        response.setRecentTransactions(recentF.join().stream().map(inv -> new DashboardSummaryResponse.RecentTransaction(
                inv.getId().toString(),
                inv.getInvoiceNumber(),
                inv.getCustomerName(),
                inv.getInvoiceTotal() != null ? inv.getInvoiceTotal() : 0d,
                inv.getStatus() != null ? inv.getStatus().toString() : "DRAFT",
                inv.getInvoiceDate() != null ? inv.getInvoiceDate().format(fmt) : null
        )).collect(Collectors.toList()));

        // Purchase metrics
        double grnTotal = grnValueF.join() != null ? grnValueF.join().doubleValue() : 0d;
        response.setPurchaseMetrics(new DashboardSummaryResponse.PurchaseMetrics(
                totalLposF.join(), pendingLposF.join(), grnCountF.join(), grnTotal));

        // HR metrics
        response.setHrMetrics(new DashboardSummaryResponse.HrMetrics(totalEmpF.join(), activeEmpF.join()));

        // Inventory metrics — derive all four values from the single combined query result
        long totalProducts = totalProdF.join();
        List<Object[]> productStock = productStockF.join();

        long outOfStockCount = 0L;
        long lowStockCount = 0L;
        double stockCost = 0d;
        List<DashboardSummaryResponse.LowStockProduct> allLowStock = new ArrayList<>();

        for (Object[] row : productStock) {
            double onHand = row[3] instanceof Number ? ((Number) row[3]).doubleValue() : 0d;
            double val    = row[5] instanceof Number ? ((Number) row[5]).doubleValue() : 0d;
            stockCost += val;
            if (onHand <= 0) {
                outOfStockCount++;
            } else if (onHand < 10) {
                lowStockCount++;
                long pid       = row[0] instanceof Number ? ((Number) row[0]).longValue() : 0L;
                String sku     = row[1] != null ? row[1].toString() : "";
                String pname   = row[2] != null ? row[2].toString() : sku;
                String lastSold = row[4] != null ? row[4].toString() : null;
                allLowStock.add(new DashboardSummaryResponse.LowStockProduct(pid, sku, pname, onHand, lastSold));
            }
        }

        // Sort lowest-stock-first, keep top 10
        allLowStock.sort(Comparator.comparingDouble(DashboardSummaryResponse.LowStockProduct::getOnHand));
        List<DashboardSummaryResponse.LowStockProduct> lowStockProds = allLowStock.stream()
                .limit(10).collect(Collectors.toList());

        response.setInventoryMetrics(new DashboardSummaryResponse.InventoryMetrics(
                totalProducts, totalProducts, lowStockCount, outOfStockCount, stockCost, lowStockProds));

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
