package com.billbull.backend.financials.reconciliation;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public class ReconciliationRequest {
    private String bankAccountId;
    private LocalDate statementDate;
    private BigDecimal statementBalance;
    private List<Long> journalLineIds;

    // Getters and Setters
    public String getBankAccountId() {
        return bankAccountId;
    }

    public void setBankAccountId(String bankAccountId) {
        this.bankAccountId = bankAccountId;
    }

    public LocalDate getStatementDate() {
        return statementDate;
    }

    public void setStatementDate(LocalDate statementDate) {
        this.statementDate = statementDate;
    }

    public BigDecimal getStatementBalance() {
        return statementBalance;
    }

    public void setStatementBalance(BigDecimal statementBalance) {
        this.statementBalance = statementBalance;
    }

    public List<Long> getJournalLineIds() {
        return journalLineIds;
    }

    public void setJournalLineIds(List<Long> journalLineIds) {
        this.journalLineIds = journalLineIds;
    }
}
