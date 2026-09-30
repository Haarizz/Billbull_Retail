package com.billbull.backend.financials.generalledger;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * One recent ledger line for the global search details panel.
 *
 * <p>Deliberately narrower than {@link LedgerEntry}: only the fields the compact
 * "recent transactions" list renders, all already stored on the entry (including
 * {@code runningBalance} — the panel never computes one).
 */
public class LedgerAccountTransactionResponse {

    private String id;
    private LocalDate transactionDate;
    private String voucherNo;
    private String description;
    private BigDecimal debitAmount;
    private BigDecimal creditAmount;
    private BigDecimal runningBalance;
    private String balanceType;
    private String branchName;

    public LedgerAccountTransactionResponse() {}

    public static LedgerAccountTransactionResponse from(LedgerEntry entry) {
        LedgerAccountTransactionResponse dto = new LedgerAccountTransactionResponse();
        dto.id = entry.getId();
        dto.transactionDate = entry.getTransactionDate();
        dto.voucherNo = entry.getVoucherNo();
        dto.description = entry.getDescription();
        dto.debitAmount = entry.getDebitAmount();
        dto.creditAmount = entry.getCreditAmount();
        dto.runningBalance = entry.getRunningBalance();
        dto.balanceType = entry.getBalanceType();
        dto.branchName = entry.getBranch() != null ? entry.getBranch().getName() : null;
        return dto;
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public LocalDate getTransactionDate() { return transactionDate; }
    public void setTransactionDate(LocalDate transactionDate) { this.transactionDate = transactionDate; }

    public String getVoucherNo() { return voucherNo; }
    public void setVoucherNo(String voucherNo) { this.voucherNo = voucherNo; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public BigDecimal getDebitAmount() { return debitAmount; }
    public void setDebitAmount(BigDecimal debitAmount) { this.debitAmount = debitAmount; }

    public BigDecimal getCreditAmount() { return creditAmount; }
    public void setCreditAmount(BigDecimal creditAmount) { this.creditAmount = creditAmount; }

    public BigDecimal getRunningBalance() { return runningBalance; }
    public void setRunningBalance(BigDecimal runningBalance) { this.runningBalance = runningBalance; }

    public String getBalanceType() { return balanceType; }
    public void setBalanceType(String balanceType) { this.balanceType = balanceType; }

    public String getBranchName() { return branchName; }
    public void setBranchName(String branchName) { this.branchName = branchName; }
}
