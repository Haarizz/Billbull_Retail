package com.billbull.backend.dashboard;

import java.util.List;

public class DashboardSummaryResponse {

    private SalesMetrics salesMetrics;
    private List<TrendPoint> salesTrend;
    private List<ChartEntry> paymentBreakdown;
    private List<ChartEntry> topDepartments;
    private List<RecentTransaction> recentTransactions;
    private PurchaseMetrics purchaseMetrics;
    private HrMetrics hrMetrics;
    private InventoryMetrics inventoryMetrics;

    public static class SalesMetrics {
        private double totalRevenue;
        private long invoiceCount;
        private double outstanding;

        public SalesMetrics(double totalRevenue, long invoiceCount, double outstanding) {
            this.totalRevenue = totalRevenue;
            this.invoiceCount = invoiceCount;
            this.outstanding = outstanding;
        }

        public double getTotalRevenue() { return totalRevenue; }
        public long getInvoiceCount() { return invoiceCount; }
        public double getOutstanding() { return outstanding; }
    }

    public static class TrendPoint {
        private String date;
        private double sales;
        private long count;

        public TrendPoint(String date, double sales, long count) {
            this.date = date;
            this.sales = sales;
            this.count = count;
        }

        public String getDate() { return date; }
        public double getSales() { return sales; }
        public long getCount() { return count; }
    }

    public static class ChartEntry {
        private String label;
        private double value;

        public ChartEntry(String label, double value) {
            this.label = label;
            this.value = value;
        }

        public String getLabel() { return label; }
        public double getValue() { return value; }
    }

    public static class RecentTransaction {
        private String id;
        private String invoiceNumber;
        private String customerName;
        private double amount;
        private String status;
        private String date;

        public RecentTransaction(String id, String invoiceNumber, String customerName,
                                  double amount, String status, String date) {
            this.id = id;
            this.invoiceNumber = invoiceNumber;
            this.customerName = customerName;
            this.amount = amount;
            this.status = status;
            this.date = date;
        }

        public String getId() { return id; }
        public String getInvoiceNumber() { return invoiceNumber; }
        public String getCustomerName() { return customerName; }
        public double getAmount() { return amount; }
        public String getStatus() { return status; }
        public String getDate() { return date; }
    }

    public static class PurchaseMetrics {
        private long totalLpos;
        private long pendingLpos;

        public PurchaseMetrics(long totalLpos, long pendingLpos) {
            this.totalLpos = totalLpos;
            this.pendingLpos = pendingLpos;
        }

        public long getTotalLpos() { return totalLpos; }
        public long getPendingLpos() { return pendingLpos; }
    }

    public static class HrMetrics {
        private long totalEmployees;
        private long activeEmployees;

        public HrMetrics(long totalEmployees, long activeEmployees) {
            this.totalEmployees = totalEmployees;
            this.activeEmployees = activeEmployees;
        }

        public long getTotalEmployees() { return totalEmployees; }
        public long getActiveEmployees() { return activeEmployees; }
    }

    public static class InventoryMetrics {
        private long totalProducts;
        private long lowStockCount;

        public InventoryMetrics(long totalProducts, long lowStockCount) {
            this.totalProducts = totalProducts;
            this.lowStockCount = lowStockCount;
        }

        public long getTotalProducts() { return totalProducts; }
        public long getLowStockCount() { return lowStockCount; }
    }

    /* ===== GETTERS & SETTERS ===== */

    public SalesMetrics getSalesMetrics() { return salesMetrics; }
    public void setSalesMetrics(SalesMetrics salesMetrics) { this.salesMetrics = salesMetrics; }

    public List<TrendPoint> getSalesTrend() { return salesTrend; }
    public void setSalesTrend(List<TrendPoint> salesTrend) { this.salesTrend = salesTrend; }

    public List<ChartEntry> getPaymentBreakdown() { return paymentBreakdown; }
    public void setPaymentBreakdown(List<ChartEntry> paymentBreakdown) { this.paymentBreakdown = paymentBreakdown; }

    public List<ChartEntry> getTopDepartments() { return topDepartments; }
    public void setTopDepartments(List<ChartEntry> topDepartments) { this.topDepartments = topDepartments; }

    public List<RecentTransaction> getRecentTransactions() { return recentTransactions; }
    public void setRecentTransactions(List<RecentTransaction> recentTransactions) { this.recentTransactions = recentTransactions; }

    public PurchaseMetrics getPurchaseMetrics() { return purchaseMetrics; }
    public void setPurchaseMetrics(PurchaseMetrics purchaseMetrics) { this.purchaseMetrics = purchaseMetrics; }

    public HrMetrics getHrMetrics() { return hrMetrics; }
    public void setHrMetrics(HrMetrics hrMetrics) { this.hrMetrics = hrMetrics; }

    public InventoryMetrics getInventoryMetrics() { return inventoryMetrics; }
    public void setInventoryMetrics(InventoryMetrics inventoryMetrics) { this.inventoryMetrics = inventoryMetrics; }
}
