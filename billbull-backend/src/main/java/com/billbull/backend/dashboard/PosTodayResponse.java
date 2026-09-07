package com.billbull.backend.dashboard;

/**
 * Live snapshot of today's point-of-sale activity for the dashboard POS card.
 *
 * <p>Distinct from {@link DashboardSummaryResponse#getRecentTransactions()}, which is just the
 * last ten sales invoices of any date and channel — this counts only POS-originated invoices
 * (those carrying a POS checkout key) booked on the business date, cancelled bills excluded.
 */
public class PosTodayResponse {

    private String businessDate;
    private long billCount;
    private double grossSales;
    /** Gross POS sales less returns booked on the same date. */
    private double netSales;
    private double avgBill;
    /** ISO-8601 local date-time of the most recent bill, or null when nothing has been sold yet. */
    private String lastBillAt;
    private long returnCount;
    private double returnTotal;

    public PosTodayResponse() {}

    public PosTodayResponse(String businessDate, long billCount, double grossSales, double netSales,
                            double avgBill, String lastBillAt, long returnCount, double returnTotal) {
        this.businessDate = businessDate;
        this.billCount = billCount;
        this.grossSales = grossSales;
        this.netSales = netSales;
        this.avgBill = avgBill;
        this.lastBillAt = lastBillAt;
        this.returnCount = returnCount;
        this.returnTotal = returnTotal;
    }

    public String getBusinessDate() { return businessDate; }
    public void setBusinessDate(String businessDate) { this.businessDate = businessDate; }

    public long getBillCount() { return billCount; }
    public void setBillCount(long billCount) { this.billCount = billCount; }

    public double getGrossSales() { return grossSales; }
    public void setGrossSales(double grossSales) { this.grossSales = grossSales; }

    public double getNetSales() { return netSales; }
    public void setNetSales(double netSales) { this.netSales = netSales; }

    public double getAvgBill() { return avgBill; }
    public void setAvgBill(double avgBill) { this.avgBill = avgBill; }

    public String getLastBillAt() { return lastBillAt; }
    public void setLastBillAt(String lastBillAt) { this.lastBillAt = lastBillAt; }

    public long getReturnCount() { return returnCount; }
    public void setReturnCount(long returnCount) { this.returnCount = returnCount; }

    public double getReturnTotal() { return returnTotal; }
    public void setReturnTotal(double returnTotal) { this.returnTotal = returnTotal; }
}
