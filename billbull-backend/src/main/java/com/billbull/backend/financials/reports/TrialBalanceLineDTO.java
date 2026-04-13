package com.billbull.backend.financials.reports;

import java.math.BigDecimal;

/**
 * Represents a single account line in the Trial Balance.
 */
public class TrialBalanceLineDTO {
    private String accountCode;
    private String accountName;
    private String accountGroup;
    private BigDecimal debitBalance;
    private BigDecimal creditBalance;

    public TrialBalanceLineDTO() {
    }

    public TrialBalanceLineDTO(String accountCode, String accountName, String accountGroup,
            BigDecimal debitBalance, BigDecimal creditBalance) {
        this.accountCode = accountCode;
        this.accountName = accountName;
        this.accountGroup = accountGroup;
        this.debitBalance = debitBalance;
        this.creditBalance = creditBalance;
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

    public String getAccountGroup() {
        return accountGroup;
    }

    public void setAccountGroup(String accountGroup) {
        this.accountGroup = accountGroup;
    }

    public BigDecimal getDebitBalance() {
        return debitBalance;
    }

    public void setDebitBalance(BigDecimal debitBalance) {
        this.debitBalance = debitBalance;
    }

    public BigDecimal getCreditBalance() {
        return creditBalance;
    }

    public void setCreditBalance(BigDecimal creditBalance) {
        this.creditBalance = creditBalance;
    }
}
