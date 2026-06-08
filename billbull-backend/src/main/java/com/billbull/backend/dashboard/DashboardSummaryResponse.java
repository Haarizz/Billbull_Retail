package com.billbull.backend.dashboard;

import java.util.List;

public class DashboardSummaryResponse {

    private SalesMetrics salesMetrics;
    private List<TrendPoint> salesTrend;
    private List<ChartEntry> paymentBreakdown;
    private List<ChartEntry> topDepartments;
    private List<RecentTransaction> recentTransactions;
    private List<TopProduct> topProducts;
    private PurchaseMetrics purchaseMetrics;
    private HrMetrics hrMetrics;
    private InventoryMetrics inventoryMetrics;

    public static class SalesMetrics {
        private double totalRevenue;
        private long invoiceCount;
        private double outstanding;
        private long customerCount;

        public SalesMetrics(double totalRevenue, long invoiceCount, double outstanding, long customerCount) {
            this.totalRevenue = totalRevenue;
            this.invoiceCount = invoiceCount;
            this.outstanding = outstanding;
            this.customerCount = customerCount;
        }

        public double getTotalRevenue() { return totalRevenue; }
        public long getInvoiceCount() { return invoiceCount; }
        public double getOutstanding() { return outstanding; }
        public long getCustomerCount() { return customerCount; }
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

    public static class TopProduct {
        private String code;
        private String name;
        private String department;
        private long qtySold;
        private double revenue;

        public TopProduct(String code, String name, String department, long qtySold, double revenue) {
            this.code = code;
            this.name = name;
            this.department = department;
            this.qtySold = qtySold;
            this.revenue = revenue;
        }

        public String getCode() { return code; }
        public String getName() { return name; }
        public String getDepartment() { return department; }
        public long getQtySold() { return qtySold; }
        public double getRevenue() { return revenue; }
    }

    public static class PurchaseMetrics {
        private long totalLpos;
        private long pendingLpos;
        private long grnCount;
        private double totalPurchaseValue;

        public PurchaseMetrics(long totalLpos, long pendingLpos, long grnCount, double totalPurchaseValue) {
            this.totalLpos = totalLpos;
            this.pendingLpos = pendingLpos;
            this.grnCount = grnCount;
            this.totalPurchaseValue = totalPurchaseValue;
        }

        public long getTotalLpos() { return totalLpos; }
        public long getPendingLpos() { return pendingLpos; }
        public long getGrnCount() { return grnCount; }
        public double getTotalPurchaseValue() { return totalPurchaseValue; }
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

    public static class LowStockProduct {
        private long productId;
        private String sku;
        private String name;
        private double onHand;
        private String lastSold;

        public LowStockProduct(long productId, String sku, String name, double onHand, String lastSold) {
            this.productId = productId;
            this.sku = sku;
            this.name = name;
            this.onHand = onHand;
            this.lastSold = lastSold;
        }

        public long getProductId() { return productId; }
        public String getSku() { return sku; }
        public String getName() { return name; }
        public double getOnHand() { return onHand; }
        public String getLastSold() { return lastSold; }
    }

    public static class InventoryMetrics {
        private long totalProducts;
        private long activeProducts;
        private long lowStockCount;
        private long outOfStockCount;
        private double stockValueCost;
        private List<LowStockProduct> lowStockProducts;

        public InventoryMetrics(long totalProducts, long activeProducts, long lowStockCount,
                                long outOfStockCount, double stockValueCost,
                                List<LowStockProduct> lowStockProducts) {
            this.totalProducts = totalProducts;
            this.activeProducts = activeProducts;
            this.lowStockCount = lowStockCount;
            this.outOfStockCount = outOfStockCount;
            this.stockValueCost = stockValueCost;
            this.lowStockProducts = lowStockProducts;
        }

        public long getTotalProducts() { return totalProducts; }
        public long getActiveProducts() { return activeProducts; }
        public long getLowStockCount() { return lowStockCount; }
        public long getOutOfStockCount() { return outOfStockCount; }
        public double getStockValueCost() { return stockValueCost; }
        public List<LowStockProduct> getLowStockProducts() { return lowStockProducts; }
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

    public List<TopProduct> getTopProducts() { return topProducts; }
    public void setTopProducts(List<TopProduct> topProducts) { this.topProducts = topProducts; }

    public PurchaseMetrics getPurchaseMetrics() { return purchaseMetrics; }
    public void setPurchaseMetrics(PurchaseMetrics purchaseMetrics) { this.purchaseMetrics = purchaseMetrics; }

    public HrMetrics getHrMetrics() { return hrMetrics; }
    public void setHrMetrics(HrMetrics hrMetrics) { this.hrMetrics = hrMetrics; }

    public InventoryMetrics getInventoryMetrics() { return inventoryMetrics; }
    public void setInventoryMetrics(InventoryMetrics inventoryMetrics) { this.inventoryMetrics = inventoryMetrics; }
}
