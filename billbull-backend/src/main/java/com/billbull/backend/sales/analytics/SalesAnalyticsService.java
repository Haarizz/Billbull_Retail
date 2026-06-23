package com.billbull.backend.sales.analytics;

import com.billbull.backend.sales.delivery.DeliveryNoteRepository;
import com.billbull.backend.sales.delivery.DeliveryNoteStatus;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;
import com.billbull.backend.sales.payment.PaymentRepository;
import com.billbull.backend.sales.proforma.ProformaRepository;
import com.billbull.backend.sales.proforma.ProformaStatus;
import com.billbull.backend.sales.quotation.QuotationRepository;
import com.billbull.backend.sales.quotation.QuotationStatus;
import com.billbull.backend.sales.returns.SalesReturnRepository;
import com.billbull.backend.sales.salesorder.SalesOrderRepository;
import com.billbull.backend.sales.salesorder.SalesOrderStatus;
import com.billbull.backend.sales.customerledger.CustomerRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.stream.Collectors;

@Service
@Transactional(readOnly = true)
public class SalesAnalyticsService {

    private static final ExecutorService POOL = Executors.newFixedThreadPool(12);

    private final SalesInvoiceRepository invoiceRepo;
    private final SalesOrderRepository soRepo;
    private final QuotationRepository quotationRepo;
    private final ProformaRepository proformaRepo;
    private final DeliveryNoteRepository dnRepo;
    private final SalesReturnRepository returnRepo;
    private final PaymentRepository paymentRepo;
    private final CustomerRepository customerRepo;

    public SalesAnalyticsService(SalesInvoiceRepository invoiceRepo,
                                  SalesOrderRepository soRepo,
                                  QuotationRepository quotationRepo,
                                  ProformaRepository proformaRepo,
                                  DeliveryNoteRepository dnRepo,
                                  SalesReturnRepository returnRepo,
                                  PaymentRepository paymentRepo,
                                  CustomerRepository customerRepo) {
        this.invoiceRepo = invoiceRepo;
        this.soRepo = soRepo;
        this.quotationRepo = quotationRepo;
        this.proformaRepo = proformaRepo;
        this.dnRepo = dnRepo;
        this.returnRepo = returnRepo;
        this.paymentRepo = paymentRepo;
        this.customerRepo = customerRepo;
    }

    public SalesAnalyticsResponse getAnalytics(LocalDate from, LocalDate to, Long branchId) {
        if (from == null) from = LocalDate.now().withDayOfMonth(1);
        if (to == null) to = LocalDate.now();
        final LocalDate dateFrom = from;
        final LocalDate dateTo = to;
        final LocalDate today = LocalDate.now();

        // ── parallel queries ──────────────────────────────────────────────────
        var revenueF    = CompletableFuture.supplyAsync(() -> orZero(invoiceRepo.sumRevenueBetween(dateFrom, dateTo, branchId)), POOL);
        var invCountF   = CompletableFuture.supplyAsync(() -> invoiceRepo.countBetween(dateFrom, dateTo, branchId), POOL);
        var outstandingF= CompletableFuture.supplyAsync(() -> orZero(invoiceRepo.sumOutstandingBalance()), POOL);
        var trendF      = CompletableFuture.supplyAsync(() -> invoiceRepo.findSalesTrend(dateFrom, dateTo, branchId), POOL);
        var payF        = CompletableFuture.supplyAsync(() -> invoiceRepo.findPaymentBreakdown(dateFrom, dateTo, branchId), POOL);
        var branchF     = CompletableFuture.supplyAsync(() -> invoiceRepo.findBranchPerformanceBetween(dateFrom, dateTo, branchId), POOL);
        var topCustF    = CompletableFuture.supplyAsync(() -> invoiceRepo.sumInvoiceTotalByCustomerCode(), POOL);
        var topCustOutF = CompletableFuture.supplyAsync(() -> invoiceRepo.sumOutstandingBalanceByCustomerCode(), POOL);
        var returnsF    = CompletableFuture.supplyAsync(() -> orZero(returnRepo.getTotalReturnsBetweenDates(dateFrom, dateTo)), POOL);
        var returnCntF  = CompletableFuture.supplyAsync(() -> returnRepo.findByReturnDateBetween(dateFrom, dateTo).size(), POOL);
        var quotCountF  = CompletableFuture.supplyAsync(() -> quotationRepo.countByStatus(QuotationStatus.PENDING_APPROVAL) + quotationRepo.countByStatus(QuotationStatus.APPROVED), POOL);
        var quotTotalF  = CompletableFuture.supplyAsync(() ->
                quotationRepo.countByStatus(QuotationStatus.PENDING_APPROVAL)
                + quotationRepo.countByStatus(QuotationStatus.APPROVED), POOL);
        var soOpenF     = CompletableFuture.supplyAsync(() -> soRepo.countByStatusIn(List.of(SalesOrderStatus.CONFIRMED, SalesOrderStatus.PARTIALLY_PAID, SalesOrderStatus.PARTIALLY_DELIVERED)), POOL);
        var soValueF    = CompletableFuture.supplyAsync(() -> orZero(soRepo.sumOrderTotalBetween(dateFrom, dateTo)), POOL);
        var piOpenF     = CompletableFuture.supplyAsync(() ->
                proformaRepo.countByStatus(ProformaStatus.DRAFT)
                + proformaRepo.countByStatus(ProformaStatus.ISSUED), POOL);
        var dnOpenF     = CompletableFuture.supplyAsync(() -> dnRepo.countByStatusIn(List.of(DeliveryNoteStatus.DRAFT, DeliveryNoteStatus.DISPATCHED)), POOL);
        var overdueF    = CompletableFuture.supplyAsync(() -> invoiceRepo.countOverdueInvoices(today.minusDays(30)), POOL);
        var customerCntF= CompletableFuture.supplyAsync(() -> customerRepo.count(), POOL);
        var receivedF   = CompletableFuture.supplyAsync(() -> orZero(paymentRepo.getTotalReceivedBetweenDates(dateFrom, dateTo)), POOL);

        CompletableFuture.allOf(revenueF, invCountF, outstandingF, trendF, payF, branchF,
                topCustF, topCustOutF, returnsF, returnCntF, quotCountF, quotTotalF,
                soOpenF, soValueF, piOpenF, dnOpenF, overdueF, customerCntF, receivedF).join();

        double revenue   = revenueF.join();
        long   invCount  = invCountF.join();
        double returns   = returnsF.join();
        long   retCount  = returnCntF.join();
        long   overdueCount = overdueF.join();

        // ── KPI ──────────────────────────────────────────────────────────────
        SalesAnalyticsResponse.KpiMetrics kpi = new SalesAnalyticsResponse.KpiMetrics();
        kpi.setTotalSales(revenue);
        kpi.setTotalReceivables(outstandingF.join());
        kpi.setPendingQuotations(quotCountF.join());
        kpi.setOpenSalesOrders(soOpenF.join());
        kpi.setPendingProforma(piOpenF.join());
        kpi.setPendingDeliveryNotes(dnOpenF.join());
        kpi.setOverdueInvoices(overdueCount);
        kpi.setSalesReturnsValue(returns);
        kpi.setCreditNotesValue(0); // credit notes use SalesReturn — same value
        kpi.setInvoiceCount(invCount);
        kpi.setAvgInvoiceValue(invCount > 0 ? revenue / invCount : 0);

        // ── Pipeline ─────────────────────────────────────────────────────────
        SalesAnalyticsResponse.PipelineCounts pipeline = new SalesAnalyticsResponse.PipelineCounts();
        pipeline.setQuotations(quotTotalF.join());
        pipeline.setQuotationsValue(0);
        pipeline.setSalesOrders(soOpenF.join());
        pipeline.setSalesOrdersValue(soValueF.join());
        pipeline.setProformaInvoices(piOpenF.join());
        pipeline.setProformaValue(0);
        pipeline.setDeliveryNotes(dnOpenF.join());
        pipeline.setDeliveryNotesValue(0);
        pipeline.setInvoices(invCount);
        pipeline.setInvoicesValue(revenue);
        pipeline.setReceipts((long)(receivedF.join() > 0 ? Math.min(invCount, (long)(receivedF.join() / Math.max(revenue / invCount, 1))) : 0));
        pipeline.setReceiptsValue(receivedF.join());

        // ── Sales trend (monthly buckets) ─────────────────────────────────────
        List<Object[]> rawTrend = trendF.join();
        List<SalesAnalyticsResponse.TrendPoint> trend = buildMonthlyTrend(rawTrend, dateFrom, dateTo);

        // ── Payment breakdown ─────────────────────────────────────────────────
        double totalForPct = revenue > 0 ? revenue : 1;
        List<SalesAnalyticsResponse.ChartPoint> payBreakdown = payF.join().stream()
                .map(r -> new SalesAnalyticsResponse.ChartPoint(
                        r[0] == null ? "Cash" : r[0].toString(),
                        r[1] == null ? 0 : ((Number) r[1]).doubleValue()))
                .collect(Collectors.toList());

        // ── Branch sales ──────────────────────────────────────────────────────
        List<SalesAnalyticsResponse.ChartPoint> branchSales = branchF.join().stream()
                .map(r -> new SalesAnalyticsResponse.ChartPoint(
                        r[0] == null ? "Head Office" : r[0].toString(),
                        r[1] == null ? 0 : ((Number) r[1]).doubleValue()))
                .collect(Collectors.toList());

        // ── Top customers ─────────────────────────────────────────────────────
        Map<String, Double> salesByCode = new HashMap<>();
        topCustF.join().forEach(r -> salesByCode.put(
                r[0] == null ? "" : r[0].toString(),
                r[1] == null ? 0 : ((Number) r[1]).doubleValue()));

        Map<String, Double> outByCode = new HashMap<>();
        topCustOutF.join().forEach(r -> outByCode.put(
                r[0] == null ? "" : r[0].toString(),
                r[1] == null ? 0 : ((Number) r[1]).doubleValue()));

        List<SalesAnalyticsResponse.TopCustomer> topCustomers = salesByCode.entrySet().stream()
                .filter(e -> !e.getKey().isEmpty())
                .sorted(Map.Entry.<String, Double>comparingByValue().reversed())
                .limit(10)
                .map(e -> {
                    String code = e.getKey();
                    return new SalesAnalyticsResponse.TopCustomer(
                            code, code, 0, e.getValue(),
                            outByCode.getOrDefault(code, 0.0));
                })
                .collect(Collectors.toList());

        // ── Customer metrics ──────────────────────────────────────────────────
        SalesAnalyticsResponse.CustomerMetrics custMetrics = new SalesAnalyticsResponse.CustomerMetrics();
        custMetrics.setTotalCustomers(customerCntF.join());
        custMetrics.setActiveCustomers(salesByCode.size());

        // ── Aging buckets (from overdue invoices) ─────────────────────────────
        List<SalesAnalyticsResponse.AgingBucket> aging = buildAgingBuckets(invoiceRepo.findAgingBucketsRaw(today));

        // ── Return metrics ────────────────────────────────────────────────────
        SalesAnalyticsResponse.ReturnMetrics returnMetrics = new SalesAnalyticsResponse.ReturnMetrics();
        returnMetrics.setSalesReturnsValue(returns);
        returnMetrics.setReturnCount(retCount);
        returnMetrics.setReturnPct(revenue > 0 ? (returns / revenue) * 100 : 0);

        // ── Assemble ──────────────────────────────────────────────────────────
        SalesAnalyticsResponse resp = new SalesAnalyticsResponse();
        resp.setKpi(kpi);
        resp.setPipeline(pipeline);
        resp.setSalesTrend(trend);
        resp.setPaymentBreakdown(payBreakdown);
        resp.setBranchSales(branchSales);
        resp.setTopCustomers(topCustomers);
        resp.setAgingBuckets(aging);
        resp.setReturnMetrics(returnMetrics);
        resp.setCustomerMetrics(custMetrics);
        return resp;
    }

    private double orZero(Double v) {
        return v == null ? 0.0 : v;
    }

    private List<SalesAnalyticsResponse.AgingBucket> buildAgingBuckets(List<Object[]> raw) {
        double total = raw.stream()
                .mapToDouble(r -> r[1] == null ? 0 : ((Number) r[1]).doubleValue())
                .sum();
        if (total <= 0) total = 1;
        final double grandTotal = total;
        return raw.stream()
                .map(r -> {
                    String range = r[0] == null ? "Unknown" : r[0].toString();
                    double amount = r[1] == null ? 0 : ((Number) r[1]).doubleValue();
                    long count = r[2] == null ? 0 : ((Number) r[2]).longValue();
                    double pct = Math.round(amount / grandTotal * 100 * 10) / 10.0;
                    return new SalesAnalyticsResponse.AgingBucket(range, amount, count, pct);
                })
                .collect(Collectors.toList());
    }

    private List<SalesAnalyticsResponse.TrendPoint> buildMonthlyTrend(List<Object[]> rawDailyTrend,
                                                                        LocalDate from, LocalDate to) {
        // Aggregate daily rows from DB into monthly buckets
        Map<String, Double> salesByMonth = new LinkedHashMap<>();
        Map<String, Long> countByMonth = new LinkedHashMap<>();

        DateTimeFormatter monthFmt = DateTimeFormatter.ofPattern("MMM yyyy");

        // Pre-populate months in range
        LocalDate cursor = from.withDayOfMonth(1);
        while (!cursor.isAfter(to)) {
            String key = cursor.format(monthFmt);
            salesByMonth.putIfAbsent(key, 0.0);
            countByMonth.putIfAbsent(key, 0L);
            cursor = cursor.plusMonths(1);
        }

        for (Object[] row : rawDailyTrend) {
            if (row[0] == null) continue;
            LocalDate date = (LocalDate) row[0];
            double sales = row[1] == null ? 0 : ((Number) row[1]).doubleValue();
            long cnt = row[2] == null ? 0 : ((Number) row[2]).longValue();
            String key = date.format(monthFmt);
            salesByMonth.merge(key, sales, Double::sum);
            countByMonth.merge(key, cnt, Long::sum);
        }

        return salesByMonth.entrySet().stream()
                .map(e -> new SalesAnalyticsResponse.TrendPoint(
                        e.getKey(), e.getValue(), 0, 0, countByMonth.getOrDefault(e.getKey(), 0L)))
                .collect(Collectors.toList());
    }
}
