package com.billbull.backend.financials.reports;

import java.util.List;
import java.math.BigDecimal;

/**
 * Profit & Loss Statement DTO.
 * Structure: Revenue - Expenses = Net Profit/Loss
 */
public class ProfitLossDTO {
    private List<ReportLineDTO> revenueItems;
    private BigDecimal totalRevenue;

    private List<ReportLineDTO> cogsItems;
    private BigDecimal totalCogs;

    private BigDecimal grossProfit;

    private List<ReportLineDTO> operatingExpenseItems;
    private BigDecimal totalOperatingExpenses;

    private List<ReportLineDTO> otherIncomeItems;
    private BigDecimal totalOtherIncome;

    private BigDecimal netProfit;

    private List<ReportLineDTO> expenseItems; // Keep for backward compatibility
    private BigDecimal totalExpenses; // Keep for backward compatibility

    private String startDate;
    private String endDate;

    public ProfitLossDTO() {
    }

    public List<ReportLineDTO> getRevenueItems() {
        return revenueItems;
    }

    public void setRevenueItems(List<ReportLineDTO> revenueItems) {
        this.revenueItems = revenueItems;
    }

    public BigDecimal getTotalRevenue() {
        return totalRevenue;
    }

    public void setTotalRevenue(BigDecimal totalRevenue) {
        this.totalRevenue = totalRevenue;
    }

    public List<ReportLineDTO> getExpenseItems() {
        return expenseItems;
    }

    public void setExpenseItems(List<ReportLineDTO> expenseItems) {
        this.expenseItems = expenseItems;
    }

    public BigDecimal getTotalExpenses() {
        return totalExpenses;
    }

    public void setTotalExpenses(BigDecimal totalExpenses) {
        this.totalExpenses = totalExpenses;
    }

    public List<ReportLineDTO> getCogsItems() {
        return cogsItems;
    }

    public void setCogsItems(List<ReportLineDTO> cogsItems) {
        this.cogsItems = cogsItems;
    }

    public BigDecimal getTotalCogs() {
        return totalCogs;
    }

    public void setTotalCogs(BigDecimal totalCogs) {
        this.totalCogs = totalCogs;
    }

    public BigDecimal getGrossProfit() {
        return grossProfit;
    }

    public void setGrossProfit(BigDecimal grossProfit) {
        this.grossProfit = grossProfit;
    }

    public List<ReportLineDTO> getOperatingExpenseItems() {
        return operatingExpenseItems;
    }

    public void setOperatingExpenseItems(List<ReportLineDTO> operatingExpenseItems) {
        this.operatingExpenseItems = operatingExpenseItems;
    }

    public BigDecimal getTotalOperatingExpenses() {
        return totalOperatingExpenses;
    }

    public void setTotalOperatingExpenses(BigDecimal totalOperatingExpenses) {
        this.totalOperatingExpenses = totalOperatingExpenses;
    }

    public List<ReportLineDTO> getOtherIncomeItems() {
        return otherIncomeItems;
    }

    public void setOtherIncomeItems(List<ReportLineDTO> otherIncomeItems) {
        this.otherIncomeItems = otherIncomeItems;
    }

    public BigDecimal getTotalOtherIncome() {
        return totalOtherIncome;
    }

    public void setTotalOtherIncome(BigDecimal totalOtherIncome) {
        this.totalOtherIncome = totalOtherIncome;
    }

    public BigDecimal getNetProfit() {
        return netProfit;
    }

    public void setNetProfit(BigDecimal netProfit) {
        this.netProfit = netProfit;
    }

    public String getStartDate() {
        return startDate;
    }

    public void setStartDate(String startDate) {
        this.startDate = startDate;
    }

    public String getEndDate() {
        return endDate;
    }

    public void setEndDate(String endDate) {
        this.endDate = endDate;
    }
}
