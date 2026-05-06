package com.billbull.backend.financials.reports;

import java.math.BigDecimal;
import java.util.List;

/**
 * Expense Analysis DTO.
 * Groups expenses by category and cost center.
 */
public class ExpenseAnalysisDTO {
    private List<ExpenseGroupDTO> byCategory;
    private List<ExpenseGroupDTO> byCostCenter;
    private List<ExpenseDetailDTO> detailLines;
    private BigDecimal totalExpenses;
    private String startDate;
    private String endDate;

    public ExpenseAnalysisDTO() {
    }

    public List<ExpenseGroupDTO> getByCategory() {
        return byCategory;
    }

    public void setByCategory(List<ExpenseGroupDTO> byCategory) {
        this.byCategory = byCategory;
    }

    public List<ExpenseGroupDTO> getByCostCenter() {
        return byCostCenter;
    }

    public void setByCostCenter(List<ExpenseGroupDTO> byCostCenter) {
        this.byCostCenter = byCostCenter;
    }

    public List<ExpenseDetailDTO> getDetailLines() {
        return detailLines;
    }

    public void setDetailLines(List<ExpenseDetailDTO> detailLines) {
        this.detailLines = detailLines;
    }

    public BigDecimal getTotalExpenses() {
        return totalExpenses;
    }

    public void setTotalExpenses(BigDecimal totalExpenses) {
        this.totalExpenses = totalExpenses;
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
