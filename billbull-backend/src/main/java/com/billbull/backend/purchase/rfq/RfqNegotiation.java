package com.billbull.backend.purchase.rfq;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

import com.billbull.backend.common.BaseEntity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

/** A "better price" request sent to a vendor for one offer, and the vendor's reply. */
@Entity
@Table(name = "purchase_rfq_negotiations")
@Getter
@Setter
public class RfqNegotiation extends BaseEntity {

    @Column(name = "rfq_id", nullable = false)
    private Long rfqId;

    @Column(name = "rfq_item_id", nullable = false)
    private Long rfqItemId;

    @Column(name = "vendor_id", nullable = false)
    private Long vendorId;

    @Column(name = "offer_id", nullable = false)
    private Long offerId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private RfqNegotiationStatus status = RfqNegotiationStatus.REQUESTED;

    @Column(name = "target_price", precision = 19, scale = 4)
    private BigDecimal targetPrice;

    @Column(name = "target_qty")
    private Integer targetQty;

    @Column(columnDefinition = "TEXT")
    private String message;

    private LocalDate deadline;

    @Column(name = "requested_at")
    private LocalDateTime requestedAt;

    @Column(name = "responded_at")
    private LocalDateTime respondedAt;

    @Column(name = "response_message", columnDefinition = "TEXT")
    private String responseMessage;

    @Column(name = "previous_price", precision = 19, scale = 4)
    private BigDecimal previousPrice;

    @Column(name = "revised_price", precision = 19, scale = 4)
    private BigDecimal revisedPrice;

    @Column(name = "history_json", columnDefinition = "TEXT")
    private String historyJson;
}
