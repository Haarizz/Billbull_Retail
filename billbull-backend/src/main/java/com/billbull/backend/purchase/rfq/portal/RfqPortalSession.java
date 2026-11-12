package com.billbull.backend.purchase.rfq.portal;

import java.time.LocalDateTime;

import com.billbull.backend.common.BaseEntity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

/** A vendor-portal session issued after a correct one-time code. Only the token's SHA-256 is stored. */
@Entity
@Table(name = "purchase_rfq_portal_sessions")
@Getter
@Setter
public class RfqPortalSession extends BaseEntity {

    @Column(name = "rfq_vendor_id", nullable = false)
    private Long rfqVendorId;

    @Column(name = "token_hash", nullable = false, unique = true, length = 64)
    private String tokenHash;

    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;

    @Column(name = "client_ip", length = 64)
    private String clientIp;
}
