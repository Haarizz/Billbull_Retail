package com.billbull.backend.financials.statement;

import java.math.BigDecimal;
import java.util.List;

public class StatementResponse {

    private String accountCode;
    private String accountName;
    private BigDecimal openingBalance;
    private BigDecimal closingBalance;
    private BigDecimal totalDebit;
    private BigDecimal totalCredit;
    private List<StatementEntryDTO> entries;

    public StatementResponse() {
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

    public BigDecimal getOpeningBalance() {
        return openingBalance;
    }

    public void setOpeningBalance(BigDecimal openingBalance) {
        this.openingBalance = openingBalance;
    }

    public BigDecimal getClosingBalance() {
        return closingBalance;
    }

    public void setClosingBalance(BigDecimal closingBalance) {
        this.closingBalance = closingBalance;
    }

    public BigDecimal getTotalDebit() {
        return totalDebit;
    }

    public void setTotalDebit(BigDecimal totalDebit) {
        this.totalDebit = totalDebit;
    }

    public BigDecimal getTotalCredit() {
        return totalCredit;
    }

    public void setTotalCredit(BigDecimal totalCredit) {
        this.totalCredit = totalCredit;
    }

    public List<StatementEntryDTO> getEntries() {
        return entries;
    }

    public void setEntries(List<StatementEntryDTO> entries) {
        this.entries = entries;
    }
}
