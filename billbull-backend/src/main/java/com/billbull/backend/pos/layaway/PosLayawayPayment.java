package com.billbull.backend.pos.layaway;

import com.billbull.backend.common.BaseEntity;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * One instalment row for a layaway order. Each time a customer pays against
 * an ACTIVE layaway, a PosLayawayPayment row is inserted rather than updating
 * the parent record's single depositAmount field. §3.4 of the POS gap analysis.
 */
@Entity
@Table(name = "pos_layaway_payments", indexes = {
    @Index(name = "idx_layaway_payment_layaway", columnList = "layaway_id"),
    @Index(name = "idx_layaway_payment_date",    columnList = "payment_date")
})
public class PosLayawayPayment extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "layaway_id", nullable = false)
    private PosLayaway layaway;

    @Column(name = "payment_date", nullable = false)
    private LocalDate paymentDate;

    /** Cash, Card, Transfer, etc. */
    @Column(name = "payment_mode", length = 50)
    private String paymentMode;

    @Column(name = "amount", nullable = false, precision = 18, scale = 2)
    private BigDecimal amount;

    /** Settled journal entry ID for audit trail (nullable — populated asynchronously). */
    @Column(name = "journal_id")
    private Long journalId;

    @Column(name = "reference_number", length = 100)
    private String referenceNumber;

    @Column(name = "notes", length = 500)
    private String notes;

    public PosLayaway getLayaway() { return layaway; }
    public void setLayaway(PosLayaway layaway) { this.layaway = layaway; }

    public LocalDate getPaymentDate() { return paymentDate; }
    public void setPaymentDate(LocalDate paymentDate) { this.paymentDate = paymentDate; }

    public String getPaymentMode() { return paymentMode; }
    public void setPaymentMode(String paymentMode) { this.paymentMode = paymentMode; }

    public BigDecimal getAmount() { return amount; }
    public void setAmount(BigDecimal amount) { this.amount = amount; }

    public Long getJournalId() { return journalId; }
    public void setJournalId(Long journalId) { this.journalId = journalId; }

    public String getReferenceNumber() { return referenceNumber; }
    public void setReferenceNumber(String referenceNumber) { this.referenceNumber = referenceNumber; }

    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }
}
