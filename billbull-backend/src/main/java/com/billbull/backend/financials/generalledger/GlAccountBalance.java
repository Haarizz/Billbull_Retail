package com.billbull.backend.financials.generalledger;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * Pre-aggregated GL account balances per (account, fiscal_period, branch) (PDF §20 / Phase 8.1).
 *
 * Updated atomically inside PostingEngineService.persist() alongside each journal posting.
 * Reports read from this table for performance; journal_lines are only scanned for drill-down.
 *
 * A nightly GlBalanceRebuildJob verifies this table matches the sum of journal_lines and
 * alerts on drift. A one-shot rebuild can be triggered via POST /api/admin/gl-balance/rebuild.
 */
@Entity
@Table(
    name = "gl_account_balances",
    uniqueConstraints = {
        @UniqueConstraint(
            name = "uk_gl_balance_account_period_branch",
            columnNames = {"account_code", "fiscal_period_id", "branch_id"})
    },
    indexes = {
        @Index(name = "idx_gl_bal_account",  columnList = "account_code"),
        @Index(name = "idx_gl_bal_period",   columnList = "fiscal_period_id"),
        @Index(name = "idx_gl_bal_branch",   columnList = "branch_id")
    }
)
public class GlAccountBalance {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "account_code", nullable = false, length = 20)
    private String accountCode;

    /** Null for entries outside any defined period (rolling window). */
    @Column(name = "fiscal_period_id")
    private Long fiscalPeriodId;

    @Column(name = "branch_id")
    private Long branchId;

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal debitTotal = BigDecimal.ZERO;

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal creditTotal = BigDecimal.ZERO;

    /** debitTotal - creditTotal. Positive = debit balance; negative = credit balance. */
    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal closingBalance = BigDecimal.ZERO;

    @Column(nullable = false)
    private LocalDateTime lastUpdated;

    @PrePersist
    @PreUpdate
    protected void onUpdate() { lastUpdated = LocalDateTime.now(); }

    public GlAccountBalance() {}

    public Long getId() { return id; }

    public String getAccountCode() { return accountCode; }
    public void setAccountCode(String accountCode) { this.accountCode = accountCode; }

    public Long getFiscalPeriodId() { return fiscalPeriodId; }
    public void setFiscalPeriodId(Long fiscalPeriodId) { this.fiscalPeriodId = fiscalPeriodId; }

    public Long getBranchId() { return branchId; }
    public void setBranchId(Long branchId) { this.branchId = branchId; }

    public BigDecimal getDebitTotal() { return debitTotal; }
    public void setDebitTotal(BigDecimal debitTotal) { this.debitTotal = debitTotal; }

    public BigDecimal getCreditTotal() { return creditTotal; }
    public void setCreditTotal(BigDecimal creditTotal) { this.creditTotal = creditTotal; }

    public BigDecimal getClosingBalance() { return closingBalance; }
    public void setClosingBalance(BigDecimal closingBalance) { this.closingBalance = closingBalance; }

    public LocalDateTime getLastUpdated() { return lastUpdated; }
}
