package com.billbull.backend.sales.advance;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * Records one application of a customer advance receipt against a sales invoice.
 * Multiple partial applications against the same advance are allowed (appliedAmount
 * must not exceed the advance's open balance across all rows for that advanceReceiptId).
 */
@Entity
@Table(
    name = "advance_applications",
    indexes = {
        @Index(name = "idx_adv_app_receipt",  columnList = "advance_receipt_id"),
        @Index(name = "idx_adv_app_invoice",  columnList = "invoice_number")
    }
)
public class AdvanceApplication {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "advance_receipt_id", nullable = false)
    private Long advanceReceiptId; // FK → ReceiptVoucher.id

    @Column(name = "invoice_number", nullable = false)
    private String invoiceNumber;

    @Column(nullable = false, precision = 15, scale = 2)
    private BigDecimal appliedAmount;

    @Column(nullable = false)
    private LocalDate appliedDate;

    /** "APPLIED" | "REFUNDED" */
    @Column(nullable = false)
    private String status = "APPLIED";

    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
    }

    public AdvanceApplication() {}

    public Long getId() { return id; }

    public Long getAdvanceReceiptId() { return advanceReceiptId; }
    public void setAdvanceReceiptId(Long advanceReceiptId) { this.advanceReceiptId = advanceReceiptId; }

    public String getInvoiceNumber() { return invoiceNumber; }
    public void setInvoiceNumber(String invoiceNumber) { this.invoiceNumber = invoiceNumber; }

    public BigDecimal getAppliedAmount() { return appliedAmount; }
    public void setAppliedAmount(BigDecimal appliedAmount) { this.appliedAmount = appliedAmount; }

    public LocalDate getAppliedDate() { return appliedDate; }
    public void setAppliedDate(LocalDate appliedDate) { this.appliedDate = appliedDate; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public LocalDateTime getCreatedAt() { return createdAt; }
}
