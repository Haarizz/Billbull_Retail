package com.billbull.backend.financials.bankreconciliation;

import com.billbull.backend.common.BaseEntity;
import com.billbull.backend.settings.branch.Branch;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/**
 * Bank statement import header (PDF §15 Bank Reconciliation).
 * One record per bank statement period per branch.
 */
@Entity
@Table(name = "bank_statements")
public class BankStatement extends BaseEntity {

    public enum ReconciliationStatus { OPEN, IN_PROGRESS, RECONCILED }

    @Column(nullable = false)
    private String bankAccountCode; // GL account code (e.g. 1102)

    @Column(nullable = false)
    private String bankAccountName;

    @Column(nullable = false)
    private LocalDate statementFromDate;

    @Column(nullable = false)
    private LocalDate statementToDate;

    @Column(nullable = false, precision = 15, scale = 2)
    private BigDecimal openingBalance;

    @Column(nullable = false, precision = 15, scale = 2)
    private BigDecimal closingBalance;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ReconciliationStatus status = ReconciliationStatus.OPEN;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "branch_id")
    private Branch branch;

    @OneToMany(mappedBy = "bankStatement", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<BankStatementLine> lines;

    // ── getters / setters ──────────────────────────────────────────────────

    public String getBankAccountCode() { return bankAccountCode; }
    public void setBankAccountCode(String bankAccountCode) { this.bankAccountCode = bankAccountCode; }

    public String getBankAccountName() { return bankAccountName; }
    public void setBankAccountName(String bankAccountName) { this.bankAccountName = bankAccountName; }

    public LocalDate getStatementFromDate() { return statementFromDate; }
    public void setStatementFromDate(LocalDate statementFromDate) { this.statementFromDate = statementFromDate; }

    public LocalDate getStatementToDate() { return statementToDate; }
    public void setStatementToDate(LocalDate statementToDate) { this.statementToDate = statementToDate; }

    public BigDecimal getOpeningBalance() { return openingBalance; }
    public void setOpeningBalance(BigDecimal openingBalance) { this.openingBalance = openingBalance; }

    public BigDecimal getClosingBalance() { return closingBalance; }
    public void setClosingBalance(BigDecimal closingBalance) { this.closingBalance = closingBalance; }

    public ReconciliationStatus getStatus() { return status; }
    public void setStatus(ReconciliationStatus status) { this.status = status; }

    public Branch getBranch() { return branch; }
    public void setBranch(Branch branch) { this.branch = branch; }

    public List<BankStatementLine> getLines() { return lines; }
    public void setLines(List<BankStatementLine> lines) { this.lines = lines; }
}
