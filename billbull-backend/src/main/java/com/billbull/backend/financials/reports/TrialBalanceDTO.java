package com.billbull.backend.financials.reports;

import java.math.BigDecimal;
import java.util.List;

/**
 * Trial Balance response DTO.
 * Lists all accounts with their debit/credit balances.
 * Rule: Total Debit must equal Total Credit.
 */
public class TrialBalanceDTO {
    private List<TrialBalanceLineDTO> lines;
    private BigDecimal totalDebit;
    private BigDecimal totalCredit;
    private boolean balanced;
    private String asOfDate;

    public TrialBalanceDTO() {
    }

    public List<TrialBalanceLineDTO> getLines() {
        return lines;
    }

    public void setLines(List<TrialBalanceLineDTO> lines) {
        this.lines = lines;
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
