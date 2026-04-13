package com.billbull.backend.financials.reports;

import java.math.BigDecimal;
import java.util.List;

/**
 * Cash Flow Statement DTO.
 * Sections: Operating, Investing, Financing.
 */
public class CashFlowDTO {
    private List<ReportLineDTO> operatingActivities;
    private BigDecimal totalOperating;

    private List<ReportLineDTO> investingActivities;
    private BigDecimal totalInvesting;

    private List<ReportLineDTO> financingActivities;
    private BigDecimal totalFinancing;

    private BigDecimal netCashFlow;
    private String startDate;
    private String endDate;

    public CashFlowDTO() {
    }

    public List<ReportLineDTO> getOperatingActivities() {
        return operatingActivities;
    }

    public void setOperatingActivities(List<ReportLineDTO> operatingActivities) {
        this.operatingActivities = operatingActivities;
    }

    public BigDecimal getTotalOperating() {
        return totalOperating;
    }

    public void setTotalOperating(BigDecimal totalOperating) {
        this.totalOperating = totalOperating;
    }

    public List<ReportLineDTO> getInvestingActivities() {
        return investingActivities;
    }

    public void setInvestingActivities(List<ReportLineDTO> investingActivities) {
        this.investingActivities = investingActivities;
    }

    public BigDecimal getTotalInvesting() {
        return totalInvesting;
    }

    public void setTotalInvesting(BigDecimal totalInvesting) {
        this.totalInvesting = totalInvesting;
    }

    public List<ReportLineDTO> getFinancingActivities() {
        return financingActivities;
    }

    public void setFinancingActivities(List<ReportLineDTO> financingActivities) {
        this.financingActivities = financingActivities;
    }

    public BigDecimal getTotalFinancing() {
        return totalFinancing;
    }

    public void setTotalFinancing(BigDecimal totalFinancing) {
        this.totalFinancing = totalFinancing;
    }

    public BigDecimal getNetCashFlow() {
        return netCashFlow;
    }

    public void setNetCashFlow(BigDecimal netCashFlow) {
        this.netCashFlow = netCashFlow;
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
