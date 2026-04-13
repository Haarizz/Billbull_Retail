package com.billbull.backend.financials.reports;

import java.math.BigDecimal;
import java.util.List;

/**
 * Balance Sheet DTO.
 * Accounting equation: Assets = Liabilities + Equity
 */
public class BalanceSheetDTO {
    private List<ReportLineDTO> assetItems;
    private BigDecimal totalAssets;

    private List<ReportLineDTO> liabilityItems;
    private BigDecimal totalLiabilities;

    private List<ReportLineDTO> equityItems;
    private BigDecimal totalEquity;

    private boolean balanced; // Assets == Liabilities + Equity
    private String asOfDate;

    public BalanceSheetDTO() {
    }

    public List<ReportLineDTO> getAssetItems() {
        return assetItems;
    }

    public void setAssetItems(List<ReportLineDTO> assetItems) {
        this.assetItems = assetItems;
    }

    public BigDecimal getTotalAssets() {
        return totalAssets;
    }

    public void setTotalAssets(BigDecimal totalAssets) {
        this.totalAssets = totalAssets;
    }

    public List<ReportLineDTO> getLiabilityItems() {
        return liabilityItems;
    }

    public void setLiabilityItems(List<ReportLineDTO> liabilityItems) {
        this.liabilityItems = liabilityItems;
    }

    public BigDecimal getTotalLiabilities() {
        return totalLiabilities;
    }

    public void setTotalLiabilities(BigDecimal totalLiabilities) {
        this.totalLiabilities = totalLiabilities;
    }

    public List<ReportLineDTO> getEquityItems() {
        return equityItems;
    }

    public void setEquityItems(List<ReportLineDTO> equityItems) {
        this.equityItems = equityItems;
    }

    public BigDecimal getTotalEquity() {
        return totalEquity;
    }

    public void setTotalEquity(BigDecimal totalEquity) {
        this.totalEquity = totalEquity;
    }

    public boolean isBalanced() {
        return balanced;
    }

    public void setBalanced(boolean balanced) {
        this.balanced = balanced;
    }

    public String getAsOfDate() {
        return asOfDate;
    }

    public void setAsOfDate(String asOfDate) {
        this.asOfDate = asOfDate;
    }
}
