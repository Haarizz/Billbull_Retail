package com.billbull.backend.financials.reports;

import java.math.BigDecimal;

/**
 * Ledger-backed expense detail row for expense analysis tables.
 */
public class ExpenseDetailDTO {
    private String transactionDate;
    private String voucherNo;
    private String accountCode;
    private String accountName;
    private String costCenter;
    private BigDecimal amount;

    public ExpenseDetailDTO() {
    }

    public ExpenseDetailDTO(
            String transactionDate,
            String voucherNo,
            String accountCode,
            String accountName,
            String costCenter,
            BigDecimal amount) {
        this.transactionDate = transactionDate;
        this.voucherNo = voucherNo;
        this.accountCode = accountCode;
        this.accountName = accountName;
        this.costCenter = costCenter;
        this.amount = amount;
    }

    public String getTransactionDate() {
        return transactionDate;
    }

    public void setTransactionDate(String transactionDate) {
        this.transactionDate = transactionDate;
    }

    public String getVoucherNo() {
        return voucherNo;
    }

    public void setVoucherNo(String voucherNo) {
        this.voucherNo = voucherNo;
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

    public String getCostCenter() {
        return costCenter;
    }

    public void setCostCenter(String costCenter) {
        this.costCenter = costCenter;
    }

    public BigDecimal getAmount() {
        return amount;
    }

    public void setAmount(BigDecimal amount) {
        this.amount = amount;
    }
}
