package com.billbull.backend.sales.analytics;

import java.util.List;

public class SalesAnalyticsResponse {

    private KpiMetrics kpi;
    private PipelineCounts pipeline;
    private List<TrendPoint> salesTrend;
    private List<ChartPoint> paymentBreakdown;
    private List<ChartPoint> branchSales;
    private List<TopCustomer> topCustomers;
    private List<AgingBucket> agingBuckets;
    private ReturnMetrics returnMetrics;
    private CustomerMetrics customerMetrics;

    public KpiMetrics getKpi() { return kpi; }
    public void setKpi(KpiMetrics kpi) { this.kpi = kpi; }

    public PipelineCounts getPipeline() { return pipeline; }
    public void setPipeline(PipelineCounts pipeline) { this.pipeline = pipeline; }

    public List<TrendPoint> getSalesTrend() { return salesTrend; }
    public void setSalesTrend(List<TrendPoint> salesTrend) { this.salesTrend = salesTrend; }

    public List<ChartPoint> getPaymentBreakdown() { return paymentBreakdown; }
    public void setPaymentBreakdown(List<ChartPoint> paymentBreakdown) { this.paymentBreakdown = paymentBreakdown; }

    public List<ChartPoint> getBranchSales() { return branchSales; }
    public void setBranchSales(List<ChartPoint> branchSales) { this.branchSales = branchSales; }

    public List<TopCustomer> getTopCustomers() { return topCustomers; }
    public void setTopCustomers(List<TopCustomer> topCustomers) { this.topCustomers = topCustomers; }

    public List<AgingBucket> getAgingBuckets() { return agingBuckets; }
    public void setAgingBuckets(List<AgingBucket> agingBuckets) { this.agingBuckets = agingBuckets; }

    public ReturnMetrics getReturnMetrics() { return returnMetrics; }
    public void setReturnMetrics(ReturnMetrics returnMetrics) { this.returnMetrics = returnMetrics; }

    public CustomerMetrics getCustomerMetrics() { return customerMetrics; }
    public void setCustomerMetrics(CustomerMetrics customerMetrics) { this.customerMetrics = customerMetrics; }

    // ── nested types ──────────────────────────────────────────────────────────

    public static class KpiMetrics {
        private double totalSales;
        private double totalReceivables;
        private long pendingQuotations;
        private long openSalesOrders;
        private long pendingProforma;
        private long pendingDeliveryNotes;
        private long overdueInvoices;
        private double salesReturnsValue;
        private double creditNotesValue;
        private long invoiceCount;
        private double avgInvoiceValue;

        public double getTotalSales() { return totalSales; }
        public void setTotalSales(double v) { totalSales = v; }
        public double getTotalReceivables() { return totalReceivables; }
        public void setTotalReceivables(double v) { totalReceivables = v; }
        public long getPendingQuotations() { return pendingQuotations; }
        public void setPendingQuotations(long v) { pendingQuotations = v; }
        public long getOpenSalesOrders() { return openSalesOrders; }
        public void setOpenSalesOrders(long v) { openSalesOrders = v; }
        public long getPendingProforma() { return pendingProforma; }
        public void setPendingProforma(long v) { pendingProforma = v; }
        public long getPendingDeliveryNotes() { return pendingDeliveryNotes; }
        public void setPendingDeliveryNotes(long v) { pendingDeliveryNotes = v; }
        public long getOverdueInvoices() { return overdueInvoices; }
        public void setOverdueInvoices(long v) { overdueInvoices = v; }
        public double getSalesReturnsValue() { return salesReturnsValue; }
        public void setSalesReturnsValue(double v) { salesReturnsValue = v; }
        public double getCreditNotesValue() { return creditNotesValue; }
        public void setCreditNotesValue(double v) { creditNotesValue = v; }
        public long getInvoiceCount() { return invoiceCount; }
        public void setInvoiceCount(long v) { invoiceCount = v; }
        public double getAvgInvoiceValue() { return avgInvoiceValue; }
        public void setAvgInvoiceValue(double v) { avgInvoiceValue = v; }
    }

    public static class PipelineCounts {
        private long quotations;
        private double quotationsValue;
        private long salesOrders;
        private double salesOrdersValue;
        private long proformaInvoices;
        private double proformaValue;
        private long deliveryNotes;
        private double deliveryNotesValue;
        private long invoices;
        private double invoicesValue;
        private long receipts;
        private double receiptsValue;

        public long getQuotations() { return quotations; }
        public void setQuotations(long v) { quotations = v; }
        public double getQuotationsValue() { return quotationsValue; }
        public void setQuotationsValue(double v) { quotationsValue = v; }
        public long getSalesOrders() { return salesOrders; }
        public void setSalesOrders(long v) { salesOrders = v; }
        public double getSalesOrdersValue() { return salesOrdersValue; }
        public void setSalesOrdersValue(double v) { salesOrdersValue = v; }
        public long getProformaInvoices() { return proformaInvoices; }
        public void setProformaInvoices(long v) { proformaInvoices = v; }
        public double getProformaValue() { return proformaValue; }
        public void setProformaValue(double v) { proformaValue = v; }
        public long getDeliveryNotes() { return deliveryNotes; }
        public void setDeliveryNotes(long v) { deliveryNotes = v; }
        public double getDeliveryNotesValue() { return deliveryNotesValue; }
        public void setDeliveryNotesValue(double v) { deliveryNotesValue = v; }
        public long getInvoices() { return invoices; }
        public void setInvoices(long v) { invoices = v; }
        public double getInvoicesValue() { return invoicesValue; }
        public void setInvoicesValue(double v) { invoicesValue = v; }
        public long getReceipts() { return receipts; }
        public void setReceipts(long v) { receipts = v; }
        public double getReceiptsValue() { return receiptsValue; }
        public void setReceiptsValue(double v) { receiptsValue = v; }
    }

    public static class TrendPoint {
        private String month;
        private double sales;
        private double pos;
        private double returns;
        private long count;

        public TrendPoint(String month, double sales, double pos, double returns, long count) {
            this.month = month;
            this.sales = sales;
            this.pos = pos;
            this.returns = returns;
            this.count = count;
        }

        public String getMonth() { return month; }
        public double getSales() { return sales; }
        public double getPos() { return pos; }
        public double getReturns() { return returns; }
        public long getCount() { return count; }
    }

    public static class ChartPoint {
        private String name;
        private double value;

        public ChartPoint(String name, double value) {
            this.name = name;
            this.value = value;
        }

        public String getName() { return name; }
        public double getValue() { return value; }
    }

    public static class TopCustomer {
        private String name;
        private String code;
        private long invoices;
        private double sales;
        private double outstanding;

        public TopCustomer(String name, String code, long invoices, double sales, double outstanding) {
            this.name = name;
            this.code = code;
            this.invoices = invoices;
            this.sales = sales;
            this.outstanding = outstanding;
        }

        public String getName() { return name; }
        public String getCode() { return code; }
        public long getInvoices() { return invoices; }
        public double getSales() { return sales; }
        public double getOutstanding() { return outstanding; }
    }

    public static class AgingBucket {
        private String range;
        private double amount;
        private long count;
        private double pct;

        public AgingBucket(String range, double amount, long count, double pct) {
            this.range = range;
            this.amount = amount;
            this.count = count;
            this.pct = pct;
        }

        public String getRange() { return range; }
        public double getAmount() { return amount; }
        public long getCount() { return count; }
        public double getPct() { return pct; }
    }

    public static class ReturnMetrics {
        private double salesReturnsValue;
        private long returnCount;
        private double returnPct;

        public double getSalesReturnsValue() { return salesReturnsValue; }
        public void setSalesReturnsValue(double v) { salesReturnsValue = v; }
        public long getReturnCount() { return returnCount; }
        public void setReturnCount(long v) { returnCount = v; }
        public double getReturnPct() { return returnPct; }
        public void setReturnPct(double v) { returnPct = v; }
    }

    public static class CustomerMetrics {
        private long totalCustomers;
        private long activeCustomers;

        public long getTotalCustomers() { return totalCustomers; }
        public void setTotalCustomers(long v) { totalCustomers = v; }
        public long getActiveCustomers() { return activeCustomers; }
        public void setActiveCustomers(long v) { activeCustomers = v; }
    }
}
