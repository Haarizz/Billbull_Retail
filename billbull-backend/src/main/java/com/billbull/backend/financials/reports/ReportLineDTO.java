package com.billbull.backend.financials.reports;

import java.math.BigDecimal;

/**
 * Generic report line item used across multiple financial reports.
 */
public class ReportLineDTO {
    private String accountCode;
    private String accountName;
    private String category; // sub-group or classification
    private BigDecimal amount;

    public ReportLineDTO() {
    }

    public ReportLineDTO(String accountCode, String accountName, String category, BigDecimal amount) {
        this.accountCode = accountCode;
        this.accountName = accountName;
        this.category = category;
        this.amount = amount;
    }

    public String getAccountCode() {
        return accountCode;
    }

    public void setAccountCode(String accountCode) {
        this.accountCode = accountCode;
    }

    public String getAccountName() {
        return accountName;
    }

    public void setAccountName(String accountName) {
        this.accountName = accountName;
    }

    public String getCategory() {
        return category;
    }

    public void setCategory(String category) {
        this.category = category;
    }

    public BigDecimal getAmount() {
        return amount;
    }

    public void setAmount(BigDecimal amount) {
        this.amount = amount;
    }
}
