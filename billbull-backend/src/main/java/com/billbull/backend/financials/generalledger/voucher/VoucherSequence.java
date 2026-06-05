package com.billbull.backend.financials.generalledger.voucher;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

/**
 * Per-branch, per-transaction-type, per-fiscal-year voucher counter.
 *
 * One row owns the running {@code lastNumber} for a {@code (transactionType,
 * branchCode, fiscalYear)} triple. Increments are serialized with a pessimistic
 * row lock in {@link VoucherSequenceService} so concurrent postings against the
 * same triple never collide. See PDF §1 (voucher numbering).
 */
@Entity
@Table(name = "voucher_sequences", uniqueConstraints = @UniqueConstraint(
        name = "uk_voucher_sequence_triple",
        columnNames = { "transaction_type", "branch_code", "fiscal_year" }))
public class VoucherSequence {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "transaction_type", nullable = false, length = 10)
    private String transactionType;

    @Column(name = "branch_code", nullable = false, length = 20)
    private String branchCode;

    @Column(name = "fiscal_year", nullable = false)
    private int fiscalYear;

    @Column(name = "last_number", nullable = false)
    private long lastNumber;

    public VoucherSequence() {
    }

    public VoucherSequence(String transactionType, String branchCode, int fiscalYear, long lastNumber) {
        this.transactionType = transactionType;
        this.branchCode = branchCode;
        this.fiscalYear = fiscalYear;
        this.lastNumber = lastNumber;
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getTransactionType() { return transactionType; }
    public void setTransactionType(String transactionType) { this.transactionType = transactionType; }

    public String getBranchCode() { return branchCode; }
    public void setBranchCode(String branchCode) { this.branchCode = branchCode; }

    public int getFiscalYear() { return fiscalYear; }
    public void setFiscalYear(int fiscalYear) { this.fiscalYear = fiscalYear; }

    public long getLastNumber() { return lastNumber; }
    public void setLastNumber(long lastNumber) { this.lastNumber = lastNumber; }
}
