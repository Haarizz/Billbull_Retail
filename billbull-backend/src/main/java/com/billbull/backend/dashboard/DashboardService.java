package com.billbull.backend.dashboard;

import com.billbull.backend.hr.employees.EmployeeRepository;
import com.billbull.backend.inventory.product.ProductRepository;
import com.billbull.backend.purchase.lpo.LpoRepository;
import com.billbull.backend.purchase.lpo.LpoStatus;
import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.stream.Collectors;

@Service
@Transactional(readOnly = true)
public class DashboardService {

    private final SalesInvoiceRepository invoiceRepo;
    private final LpoRepository lpoRepo;
    private final EmployeeRepository employeeRepo;
    private final ProductRepository productRepo;

    public DashboardService(SalesInvoiceRepository invoiceRepo,
                             LpoRepository lpoRepo,
                             EmployeeRepository employeeRepo,
                             ProductRepository productRepo) {
        this.invoiceRepo = invoiceRepo;
        this.lpoRepo = lpoRepo;
        this.employeeRepo = employeeRepo;
        this.productRepo = productRepo;
    }

    public DashboardSummaryResponse getSummary(String timeRange) {
        LocalDate[] range = resolveRange(timeRange);
        LocalDate startDate = range[0];
        LocalDate endDate = range[1];

        DashboardSummaryResponse response = new DashboardSummaryResponse();

        // Sales trend
        List<Object[]> trendRows = invoiceRepo.findSalesTrend(startDate, endDate);
        response.setSalesTrend(trendRows.stream().map(row -> {
            LocalDate date = (LocalDate) row[0];
            double sales = row[1] instanceof Number ? ((Number) row[1]).doubleValue() : 0d;
            long count = row[2] instanceof Number ? ((Number) row[2]).longValue() : 0L;
            return new DashboardSummaryResponse.TrendPoint(date.toString(), sales, count);
        }).collect(Collectors.toList()));

        // Payment breakdown
        List<Object[]> payRows = invoiceRepo.findPaymentBreakdown(startDate, endDate);
        response.setPaymentBreakdown(payRows.stream().map(row -> {
            String label = row[0] != null ? row[0].toString() : "Cash";
            double value = row[1] instanceof Number ? ((Number) row[1]).doubleValue() : 0d;
            return new DashboardSummaryResponse.ChartEntry(label, value);
        }).collect(Collectors.toList()));

        // Top departments
        List<Object[]> deptRows = invoiceRepo.findTopDepartments(startDate, endDate);
        response.setTopDepartments(deptRows.stream().map(row -> {
            String label = row[0] != null ? row[0].toString() : "Uncategorized";
            double value = row[1] instanceof Number ? ((Number) row[1]).doubleValue() : 0d;
            return new DashboardSummaryResponse.ChartEntry(label, value);
        }).collect(Collectors.toList()));

        // Sales totals
        Double totalRevenueVal = invoiceRepo.sumRevenueBetween(startDate, endDate);
        long invoiceCount = invoiceRepo.countBetween(startDate, endDate);
        Double outstandingVal = invoiceRepo.sumOutstandingBalance();
        double totalRevenue = totalRevenueVal != null ? totalRevenueVal : 0d;
        double outstanding = outstandingVal != null ? outstandingVal : 0d;
        response.setSalesMetrics(new DashboardSummaryResponse.SalesMetrics(totalRevenue, invoiceCount, outstanding));

        // Recent transactions (last 10, no date filter)
        List<SalesInvoice> recent = invoiceRepo.findRecentForDashboard(PageRequest.of(0, 10));
        DateTimeFormatter fmt = DateTimeFormatter.ISO_LOCAL_DATE;
        response.setRecentTransactions(recent.stream().map(inv -> new DashboardSummaryResponse.RecentTransaction(
                inv.getId().toString(),
                inv.getInvoiceNumber(),
                inv.getCustomerName(),
                inv.getInvoiceTotal() != null ? inv.getInvoiceTotal() : 0d,
                inv.getStatus() != null ? inv.getStatus().toString() : "DRAFT",
                inv.getInvoiceDate() != null ? inv.getInvoiceDate().format(fmt) : null
        )).collect(Collectors.toList()));

        // Purchase metrics
        long totalLpos = lpoRepo.count();
        long pendingLpos = lpoRepo.findByStatus(LpoStatus.PENDING_APPROVAL).size()
                + lpoRepo.findByStatus(LpoStatus.APPROVED).size();
        response.setPurchaseMetrics(new DashboardSummaryResponse.PurchaseMetrics(totalLpos, pendingLpos));

        // HR metrics
        long totalEmployees = employeeRepo.count();
        long activeEmployees = employeeRepo.findByStatus("ACTIVE").size();
        response.setHrMetrics(new DashboardSummaryResponse.HrMetrics(totalEmployees, activeEmployees));

        // Inventory metrics
        long totalProducts = productRepo.countAllActive();
        response.setInventoryMetrics(new DashboardSummaryResponse.InventoryMetrics(totalProducts, 0));

        return response;
    }

    private LocalDate[] resolveRange(String timeRange) {
        LocalDate today = LocalDate.now();
        return switch (timeRange == null ? "All Time" : timeRange) {
            case "Today" -> new LocalDate[]{ today, today.plusDays(1) };
            case "Yesterday" -> new LocalDate[]{ today.minusDays(1), today };
            case "This Week" -> new LocalDate[]{ today.with(java.time.DayOfWeek.MONDAY), today.plusDays(1) };
            case "This Month" -> new LocalDate[]{ today.withDayOfMonth(1), today.plusDays(1) };
            default -> new LocalDate[]{ null, null };
        };
    }
}
