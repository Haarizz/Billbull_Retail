package com.billbull.backend.purchase.rfq;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

import com.billbull.backend.common.BaseEntity;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

/** A vendor invited to an RFQ, together with that vendor's quotation header. */
@Entity
@Table(name = "purchase_rfq_vendors")
@Getter
@Setter
public class RfqVendor extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "rfq_id", nullable = false)
    private Rfq rfq;

    @Column(name = "vendor_id", nullable = false)
    private Long vendorId;

    @Column(name = "vendor_name")
    private String vendorName;

    @Column(name = "vendor_code", length = 120)
    private String vendorCode;

    private String email;

    @Column(length = 80)
    private String phone;

    @Enumerated(EnumType.STRING)
    @Column(name = "response_status", nullable = false, length = 30)
    private RfqVendorResponseStatus responseStatus = RfqVendorResponseStatus.PENDING;

    @Column(name = "submitted_at")
    private LocalDateTime submittedAt;

    @Column(name = "payment_terms", length = 120)
    private String paymentTerms;

    @Column(name = "delivery_terms", length = 120)
    private String deliveryTerms;

    private LocalDate validity;

    @Column(nullable = false)
    private Integer version = 0;

    // ── Vendor portal ────────────────────────────────────────────────────────

    /** Random secret in this vendor's invitation link; a one-time code to the vendor's email is still required. */
    @Column(name = "portal_token", length = 64, unique = true)
    private String portalToken;

    /** SHA-256 of the current one-time code (never the code itself). */
    @Column(name = "otp_hash", length = 64)
    private String otpHash;

    @Column(name = "otp_expires_at")
    private LocalDateTime otpExpiresAt;

    @Column(name = "otp_attempts", nullable = false)
    private Integer otpAttempts = 0;

    @Column(name = "otp_sent_at")
    private LocalDateTime otpSentAt;

    @Column(name = "otp_window_start")
    private LocalDateTime otpWindowStart;

    @Column(name = "otp_send_count", nullable = false)
    private Integer otpSendCount = 0;

    @Column(name = "portal_last_access_at")
    private LocalDateTime portalLastAccessAt;

    @OneToMany(mappedBy = "rfqVendor", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("id ASC")
    private List<RfqOffer> offers = new ArrayList<>();
}
