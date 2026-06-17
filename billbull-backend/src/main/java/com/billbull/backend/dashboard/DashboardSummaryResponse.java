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
    private AccountingSnapshot accountingSnapshot;
    private List<HourlySalesPoint> hourlySales;
    private List<BranchPerformancePoint> branchPerformance;

    public static class SalesMetrics {
        private double totalRevenue;
        private long invoiceCount;
        private double outstanding;
        private long customerCount;
        private double totalProfit;
        private double totalReturns;

        public SalesMetrics(double totalRevenue, long invoiceCount, double outstanding, long customerCount,
                            double totalProfit, double totalReturns) {
            this.totalRevenue = totalRevenue;
            this.invoiceCount = invoiceCount;
            this.outstanding = outstanding;
            this.customerCount = customerCount;
            this.totalProfit = totalProfit;
            this.totalReturns = totalReturns;
        }

        public double getTotalRevenue() { return totalRevenue; }
        public long getInvoiceCount() { return invoiceCount; }
        public double getOutstanding() { return outstanding; }
        public long getCustomerCount() { return customerCount; }
        public double getTotalProfit() { return totalProfit; }
        public double getTotalReturns() { return totalReturns; }
    }

    public static class TrendPoint {
        private String date;
        private double sales;
        private long count;
        private double profit;
        private double returns;

        public TrendPoint(String date, double sales, long count, double profit, double returns) {
            this.date = date;
            this.sales = sales;
            this.count = count;
            this.profit = profit;
            this.returns = returns;
        }

        public String getDate() { return date; }
        public double getSales() { return sales; }
        public long getCount() { return count; }
        public double getProfit() { return profit; }
        public double getReturns() { return returns; }
    }

    public static class HourlySalesPoint {
        private int hour;
        private double sales;
        private long count;

        public HourlySalesPoint(int hour, double sales, long count) {
            this.hour = hour;
            this.sales = sales;
            this.count = count;
        }

        public int getHour() { return hour; }
        public double getSales() { return sales; }
        public long getCount() { return count; }
    }

    public static class BranchPerformancePoint {
        private String branch;
        private double sales;

        public BranchPerformancePoint(String branch, double sales) {
            this.branch = branch;
            this.sales = sales;
        }

        public String getBranch() { return branch; }
        public double getSales() { return sales; }
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
        private String createdAt;

        public RecentTransaction(String id, String invoiceNumber, String customerName,
                                  double amount, String status, String date, String createdAt) {
            this.id = id;
            this.invoiceNumber = invoiceNumber;
            this.customerName = customerName;
            this.amount = amount;
            this.status = status;
            this.date = date;
            this.createdAt = createdAt;
        }

        public String getId() { return id; }
        public String getInvoiceNumber() { return invoiceNumber; }
        public String getCustomerName() { return customerName; }
        public double getAmount() { return amount; }
        public String getStatus() { return status; }
        public String getDate() { return date; }
        public String getCreatedAt() { return createdAt; }
    }

    public static class TopProduct {
        private Long id;
        private String code;
        private String name;
        private String department;
        private long qtySold;
        private double revenue;

        public TopProduct(Long id, String code, String name, String department, long qtySold, double revenue) {
            this.id = id;
            this.code = code;
            this.name = name;
            this.department = department;
            this.qtySold = qtySold;
            this.revenue = revenue;
        }

        public Long getId() { return id; }
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
        private long suppliersCount;

        public PurchaseMetrics(long totalLpos, long pendingLpos, long grnCount, double totalPurchaseValue, long suppliersCount) {
            this.totalLpos = totalLpos;
            this.pendingLpos = pendingLpos;
            this.grnCount = grnCount;
            this.totalPurchaseValue = totalPurchaseValue;
            this.suppliersCount = suppliersCount;
        }

        public long getTotalLpos() { return totalLpos; }
        public long getPendingLpos() { return pendingLpos; }
        public long getGrnCount() { return grnCount; }
        public double getTotalPurchaseValue() { return totalPurchaseValue; }
        public long getSuppliersCount() { return suppliersCount; }
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
        private List<LowStockProduct> slowMovingProducts;

        public InventoryMetrics(long totalProducts, long activeProducts, long lowStockCount,
                                long outOfStockCount, double stockValueCost,
                                List<LowStockProduct> lowStockProducts,
                                List<LowStockProduct> slowMovingProducts) {
            this.totalProducts = totalProducts;
            this.activeProducts = activeProducts;
            this.lowStockCount = lowStockCount;
            this.outOfStockCount = outOfStockCount;
            this.stockValueCost = stockValueCost;
            this.lowStockProducts = lowStockProducts;
            this.slowMovingProducts = slowMovingProducts;
        }

        public long getTotalProducts() { return totalProducts; }
        public long getActiveProducts() { return activeProducts; }
        public long getLowStockCount() { return lowStockCount; }
        public long getOutOfStockCount() { return outOfStockCount; }
        public double getStockValueCost() { return stockValueCost; }
        public List<LowStockProduct> getLowStockProducts() { return lowStockProducts; }
        public List<LowStockProduct> getSlowMovingProducts() { return slowMovingProducts; }
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

    public AccountingSnapshot getAccountingSnapshot() { return accountingSnapshot; }
    public void setAccountingSnapshot(AccountingSnapshot accountingSnapshot) { this.accountingSnapshot = accountingSnapshot; }

    public List<HourlySalesPoint> getHourlySales() { return hourlySales; }
    public void setHourlySales(List<HourlySalesPoint> hourlySales) { this.hourlySales = hourlySales; }

    public List<BranchPerformancePoint> getBranchPerformance() { return branchPerformance; }
    public void setBranchPerformance(List<BranchPerformancePoint> branchPerformance) { this.branchPerformance = branchPerformance; }

    public static class AccountingSnapshot {
        private double cashInflow;
        private double cashOutflow;
        private double netCashFlow;
        private double totalExpenses;
        private String majorExpenseHead;
        private double vatOnSales;
        private double vatOnPurchases;
        private double vatPayable;
        private double customerReceivables;
        private double supplierPayables;

        public AccountingSnapshot(double cashInflow, double cashOutflow, double netCashFlow,
                                   double totalExpenses, String majorExpenseHead,
                                   double vatOnSales, double vatOnPurchases, double vatPayable,
                                   double customerReceivables, double supplierPayables) {
            this.cashInflow = cashInflow;
            this.cashOutflow = cashOutflow;
            this.netCashFlow = netCashFlow;
            this.totalExpenses = totalExpenses;
            this.majorExpenseHead = majorExpenseHead;
            this.vatOnSales = vatOnSales;
            this.vatOnPurchases = vatOnPurchases;
            this.vatPayable = vatPayable;
            this.customerReceivables = customerReceivables;
            this.supplierPayables = supplierPayables;
        }

        public double getCashInflow() { return cashInflow; }
        public double getCashOutflow() { return cashOutflow; }
        public double getNetCashFlow() { return netCashFlow; }
        public double getTotalExpenses() { return totalExpenses; }
        public String getMajorExpenseHead() { return majorExpenseHead; }
        public double getVatOnSales() { return vatOnSales; }
        public double getVatOnPurchases() { return vatOnPurchases; }
        public double getVatPayable() { return vatPayable; }
        public double getCustomerReceivables() { return customerReceivables; }
        public double getSupplierPayables() { return supplierPayables; }
    }
}
