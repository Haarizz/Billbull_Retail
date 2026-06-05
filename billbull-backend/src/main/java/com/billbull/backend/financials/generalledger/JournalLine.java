package com.billbull.backend.financials.generalledger;

import java.math.BigDecimal;
import java.time.LocalDate;

import com.billbull.backend.settings.branch.Branch;
import com.billbull.backend.settings.outlet.Outlet;
import com.fasterxml.jackson.annotation.JsonIgnore;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

@Entity
@Table(name = "journal_lines", indexes = {
    @Index(name = "idx_journal_line_branch",       columnList = "branch_id"),
    @Index(name = "idx_journal_line_outlet",       columnList = "outlet_id"),
    @Index(name = "idx_journal_line_account_code", columnList = "account_code"),
    @Index(name = "idx_journal_line_entry_id",     columnList = "journal_entry_id"),
    @Index(name = "idx_journal_line_branch_acct",  columnList = "branch_id, account_code")
})
public class JournalLine {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "journal_entry_id", nullable = false)
    @JsonIgnore
    private JournalEntry journalEntry;

    /**
     * Per-line branch dimension (PDF §4). Mandatory target; currently enforced
     * warn-only by {@code DimensionMatrixService} and backfilled from the header
     * branch when not set explicitly.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "branch_id")
    private Branch branch;

    /**
     * Per-line outlet dimension (PDF §4). Mandatory on revenue/COGS accounts once
     * Phase 2 outlet data is fully populated. Enforced warn-only until then.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "outlet_id")
    private Outlet outlet;

    @Column(nullable = false)
    private String account; // Display name (kept for backward compatibility)

    private String accountCode; // COA code linking to Account.code

    private String description;

    @Column(nullable = false, precision = 15, scale = 2)
    private BigDecimal debit = BigDecimal.ZERO;

    @Column(nullable = false, precision = 15, scale = 2)
    private BigDecimal credit = BigDecimal.ZERO;

    private String costCenter;

    // Tax Metadata
    @Column(precision = 15, scale = 2)
    private BigDecimal taxBase;

    @Column(precision = 5, scale = 2)
    private BigDecimal taxRate; // e.g., 5.00, 12.00, 18.00

    @Column(precision = 15, scale = 2)
    private BigDecimal taxAmount;

    private String taxRole; // "OUTPUT_TAX", "INPUT_TAX", "TAXABLE_SALES"
    private String taxCode; // e.g., "VAT5", "EXEMPT"

    @Column(name = "is_reconciled")
    private Boolean reconciled = false;

    @Column(name = "reconciliation_date")
    private LocalDate reconciliationDate;

    @Column(name = "cf_bucket")
    private String cfBucket; // e.g., "OPERATING_INFLOW", "INVESTING_OUTFLOW"

    // ── Currency / FX columns (Phase 2.2, AED-only MVP) ────────────────────────
    // Populated with "AED" / 1.0 by the posting engine; full multi-currency FX
    // lookup is deferred until Phase 2.2 is fully scoped (see plan §E decision 2).
    @Column(length = 3)
    private String currency; // ISO 4217

    @Column(precision = 18, scale = 8)
    private BigDecimal fxRate; // units of base per 1 unit of currency

    @Column(precision = 15, scale = 2)
    private BigDecimal baseDebit; // debit converted to base currency (AED)

    @Column(precision = 15, scale = 2)
    private BigDecimal baseCredit; // credit converted to base currency (AED)

    public JournalLine() {
    }

    // Getters and Setters
    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public JournalEntry getJournalEntry() {
        return journalEntry;
    }

    public void setJournalEntry(JournalEntry journalEntry) {
        this.journalEntry = journalEntry;
    }

    public Branch getBranch() {
        return branch;
    }

    public void setBranch(Branch branch) {
        this.branch = branch;
    }

    public Outlet getOutlet() {
        return outlet;
    }

    public void setOutlet(Outlet outlet) {
        this.outlet = outlet;
    }

    public String getAccount() {
        return account;
    }

    public void setAccount(String account) {
        this.account = account;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public BigDecimal getDebit() {
        return debit;
    }

    public void setDebit(BigDecimal debit) {
        this.debit = debit;
    }

    public BigDecimal getCredit() {
        return credit;
    }

    public void setCredit(BigDecimal credit) {
        this.credit = credit;
    }

    public String getCostCenter() {
        return costCenter;
    }

    public void setCostCenter(String costCenter) {
        this.costCenter = costCenter;
    }

    public String getAccountCode() {
        return accountCode;
    }

    public void setAccountCode(String accountCode) {
        this.accountCode = accountCode;
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

    public BigDecimal getTaxBase() {
        return taxBase;
    }

    public void setTaxBase(BigDecimal taxBase) {
        this.taxBase = taxBase;
    }

    public BigDecimal getTaxRate() {
        return taxRate;
    }

    public void setTaxRate(BigDecimal taxRate) {
        this.taxRate = taxRate;
    }

    public BigDecimal getTaxAmount() {
        return taxAmount;
    }

    public void setTaxAmount(BigDecimal taxAmount) {
        this.taxAmount = taxAmount;
    }

    public String getTaxRole() {
        return taxRole;
    }

    public void setTaxRole(String taxRole) {
        this.taxRole = taxRole;
    }

    public String getTaxCode() {
        return taxCode;
    }

    public void setTaxCode(String taxCode) {
        this.taxCode = taxCode;
    }

    public String getCfBucket() {
        return cfBucket;
    }

    public void setCfBucket(String cfBucket) {
        this.cfBucket = cfBucket;
    }

    public String getCurrency() { return currency; }
    public void setCurrency(String currency) { this.currency = currency; }

    public BigDecimal getFxRate() { return fxRate; }
    public void setFxRate(BigDecimal fxRate) { this.fxRate = fxRate; }

    public BigDecimal getBaseDebit() { return baseDebit; }
    public void setBaseDebit(BigDecimal baseDebit) { this.baseDebit = baseDebit; }

    public BigDecimal getBaseCredit() { return baseCredit; }
    public void setBaseCredit(BigDecimal baseCredit) { this.baseCredit = baseCredit; }
}
