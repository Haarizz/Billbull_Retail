package com.billbull.backend.sales.voucher;

import com.billbull.backend.common.BaseEntity;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.persistence.*;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * One immutable entry in a voucher's history ledger — the audit trail behind
 * {@link CreditVoucher#getRemainingAmount()}.
 *
 * <p>The running balance on the voucher is a materialised convenience; this ledger is the record.
 * Because every entry carries {@code balanceBefore} and {@code balanceAfter}, the voucher's whole
 * life can be replayed and any discrepancy between the ledger and the materialised balance is
 * immediately visible.
 *
 * <p>Rows are never updated or deleted. A correction is a new {@code ADJUSTED} entry.
 */
@Entity
@Table(name = "credit_voucher_transactions", indexes = {
        @Index(name = "idx_cv_txn_voucher", columnList = "voucher_id"),
        @Index(name = "idx_cv_txn_reference", columnList = "reference_type, reference_number"),
        @Index(name = "idx_cv_txn_session", columnList = "pos_session_id"),
        @Index(name = "idx_cv_txn_business_date", columnList = "business_date")
})
@JsonIgnoreProperties({ "hibernateLazyInitializer", "handler" })
public class CreditVoucherTransaction extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "voucher_id", nullable = false)
    @JsonIgnore
    private CreditVoucher voucher;

    @Enumerated(EnumType.STRING)
    @Column(name = "transaction_type", length = 25, nullable = false)
    private CreditVoucherTransactionType transactionType;

    /** Always positive. The direction is carried by {@link #transactionType}, not by the sign. */
    @Column(name = "amount", precision = 15, scale = 2, nullable = false)
    private BigDecimal amount;

    @Column(name = "balance_before", precision = 15, scale = 2, nullable = false)
    private BigDecimal balanceBefore;

    @Column(name = "balance_after", precision = 15, scale = 2, nullable = false)
    private BigDecimal balanceAfter;

    // ── What this entry relates to ───────────────────────────────────────────

    /** SALES_RETURN for an issue, SALES_INVOICE for a redemption, MANUAL for an adjustment. */
    @Column(name = "reference_type", length = 40)
    private String referenceType;

    /** The return number, invoice number, or other document reference. */
    @Column(name = "reference_number", length = 60)
    private String referenceNumber;

    @Column(name = "reference_id")
    private Long referenceId;

    // ── Where and by whom ────────────────────────────────────────────────────

    @Column(name = "performed_by", length = 150)
    private String performedBy;

    @Column(name = "branch_id")
    private Long branchId;

    @Column(name = "pos_terminal_id", length = 100)
    private String posTerminalId;

    @Column(name = "pos_session_id")
    private Long posSessionId;

    /** POS business/trading date, so voucher activity groups correctly on a Z-report. */
    @Column(name = "business_date")
    private LocalDate businessDate;

    @Column(name = "notes", length = 500)
    private String notes;

    // ── Getters & setters ────────────────────────────────────────────────────

    public CreditVoucher getVoucher() { return voucher; }
    public void setVoucher(CreditVoucher voucher) { this.voucher = voucher; }

    public CreditVoucherTransactionType getTransactionType() { return transactionType; }
    public void setTransactionType(CreditVoucherTransactionType transactionType) { this.transactionType = transactionType; }

    public BigDecimal getAmount() { return amount; }
    public void setAmount(BigDecimal amount) { this.amount = amount; }

    public BigDecimal getBalanceBefore() { return balanceBefore; }
    public void setBalanceBefore(BigDecimal balanceBefore) { this.balanceBefore = balanceBefore; }

    public BigDecimal getBalanceAfter() { return balanceAfter; }
    public void setBalanceAfter(BigDecimal balanceAfter) { this.balanceAfter = balanceAfter; }

    public String getReferenceType() { return referenceType; }
    public void setReferenceType(String referenceType) { this.referenceType = referenceType; }

    public String getReferenceNumber() { return referenceNumber; }
    public void setReferenceNumber(String referenceNumber) { this.referenceNumber = referenceNumber; }

    public Long getReferenceId() { return referenceId; }
    public void setReferenceId(Long referenceId) { this.referenceId = referenceId; }

    public String getPerformedBy() { return performedBy; }
    public void setPerformedBy(String performedBy) { this.performedBy = performedBy; }

    public Long getBranchId() { return branchId; }
    public void setBranchId(Long branchId) { this.branchId = branchId; }

    public String getPosTerminalId() { return posTerminalId; }
    public void setPosTerminalId(String posTerminalId) { this.posTerminalId = posTerminalId; }

    public Long getPosSessionId() { return posSessionId; }
    public void setPosSessionId(Long posSessionId) { this.posSessionId = posSessionId; }

    public LocalDate getBusinessDate() { return businessDate; }
    public void setBusinessDate(LocalDate businessDate) { this.businessDate = businessDate; }

    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }
}
