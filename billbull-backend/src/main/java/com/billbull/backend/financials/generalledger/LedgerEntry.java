package com.billbull.backend.financials.generalledger;

import com.billbull.backend.settings.branch.Branch;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;

@Entity
@Table(name = "ledger_entries", indexes = {
    @Index(name = "idx_ledger_entry_branch", columnList = "branch_id")
})
public class LedgerEntry {
    @Id
    private String id;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "branch_id")
    private Branch branch;

    private LocalDate transactionDate;
    private String voucherNo; // Matching reporting requirements
    private String journalId; // Link to JournalEntry
    private String type; // "Pa", "Re", "Debit", "Credit"

    private String accountCode;
    private String accountName;
    private String description;

    private BigDecimal debitAmount;
    private BigDecimal creditAmount;

    // Snapshot of account balance after this transaction
    private BigDecimal runningBalance;
    private String balanceType; // "Dr" or "Cr"

    private String costCenter;
    private String cfBucket;

    @Column(name = "is_reconciled", nullable = false, columnDefinition = "boolean default false")
    private Boolean reconciled = false;

    @Column(name = "reconciliation_date")
    private LocalDate reconciliationDate;

    public LedgerEntry() {
    }

    // --- GETTERS & SETTERS ---
    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public Branch getBranch() { return branch; }
    public void setBranch(Branch branch) { this.branch = branch; }

    public LocalDate getTransactionDate() {
        return transactionDate;
    }

    public void setTransactionDate(LocalDate transactionDate) {
        this.transactionDate = transactionDate;
    }

    public String getVoucherNo() {
        return voucherNo;
    }

    public void setVoucherNo(String voucherNo) {
        this.voucherNo = voucherNo;
    }

    public String getJournalId() {
        return journalId;
    }

    public void setJournalId(String journalId) {
        this.journalId = journalId;
    }

    public String getType() {
        return type;
    }

    public void setType(String type) {
        this.type = type;
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

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public BigDecimal getDebitAmount() {
        return debitAmount;
    }

    public void setDebitAmount(BigDecimal debitAmount) {
        this.debitAmount = debitAmount;
    }

    public BigDecimal getCreditAmount() {
        return creditAmount;
    }

    public void setCreditAmount(BigDecimal creditAmount) {
        this.creditAmount = creditAmount;
    }

    public BigDecimal getRunningBalance() {
        return runningBalance;
    }

    public void setRunningBalance(BigDecimal runningBalance) {
        this.runningBalance = runningBalance;
    }

    public String getBalanceType() {
        return balanceType;
    }

    public void setBalanceType(String balanceType) {
        this.balanceType = balanceType;
    }

    public String getCostCenter() {
        return costCenter;
    }

    public void setCostCenter(String costCenter) {
        this.costCenter = costCenter;
    }

    public String getCfBucket() {
        return cfBucket;
    }

    public void setCfBucket(String cfBucket) {
        this.cfBucket = cfBucket;
    }

    public Boolean isReconciled() {
        return reconciled;
    }

    public void setReconciled(Boolean reconciled) {
        this.reconciled = reconciled;
    }

    public LocalDate getReconciliationDate() {
        return reconciliationDate;
    }

    public void setReconciliationDate(LocalDate reconciliationDate) {
        this.reconciliationDate = reconciliationDate;
    }
}
