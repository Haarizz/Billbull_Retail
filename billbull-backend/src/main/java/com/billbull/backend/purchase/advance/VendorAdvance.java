package com.billbull.backend.purchase.advance;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * Tracks a cash advance paid to a vendor before the purchase invoice arrives.
 * GL posting: Dr Vendor Advances Paid (1105) / Cr Bank (1102).
 * Later applied against the PI: Dr AP (2101) / Cr Vendor Advances Paid (1105).
 */
@Entity
@Table(
    name = "vendor_advances",
    indexes = {
        @Index(name = "idx_vendor_adv_vendor", columnList = "vendor_id"),
        @Index(name = "idx_vendor_adv_lpo",    columnList = "lpo_id")
    }
)
public class VendorAdvance {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "vendor_id", nullable = false)
    private Long vendorId;

    private String vendorName;

    /** LPO reference — mandatory per PDF §10. */
    @Column(name = "lpo_id")
    private Long lpoId;

    private String lpoReference;

    @Column(nullable = false, precision = 15, scale = 2)
    private BigDecimal amount;

    @Column(nullable = false)
    private LocalDate paidDate;

    /** OPEN | APPLIED | REFUNDED */
    @Column(nullable = false)
    private String status = "OPEN";

    private String paymentMode; // Bank / Cash

    private String remarks;

    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() { createdAt = LocalDateTime.now(); }

    public VendorAdvance() {}

    public Long getId() { return id; }

    public Long getVendorId() { return vendorId; }
    public void setVendorId(Long vendorId) { this.vendorId = vendorId; }

    public String getVendorName() { return vendorName; }
    public void setVendorName(String vendorName) { this.vendorName = vendorName; }

    public Long getLpoId() { return lpoId; }
    public void setLpoId(Long lpoId) { this.lpoId = lpoId; }

    public String getLpoReference() { return lpoReference; }
    public void setLpoReference(String lpoReference) { this.lpoReference = lpoReference; }

    public BigDecimal getAmount() { return amount; }
    public void setAmount(BigDecimal amount) { this.amount = amount; }

    public LocalDate getPaidDate() { return paidDate; }
    public void setPaidDate(LocalDate paidDate) { this.paidDate = paidDate; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getPaymentMode() { return paymentMode; }
    public void setPaymentMode(String paymentMode) { this.paymentMode = paymentMode; }

    public String getRemarks() { return remarks; }
    public void setRemarks(String remarks) { this.remarks = remarks; }

    public LocalDateTime getCreatedAt() { return createdAt; }
}
