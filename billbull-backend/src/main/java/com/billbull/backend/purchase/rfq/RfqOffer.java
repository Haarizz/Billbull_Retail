package com.billbull.backend.purchase.rfq;

import java.math.BigDecimal;
import java.time.LocalDate;

import com.billbull.backend.common.BaseEntity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

/** One vendor's offer for one RFQ item. A vendor may give several (the requested model plus alternatives). */
@Entity
@Table(name = "purchase_rfq_offers")
@Getter
@Setter
public class RfqOffer extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "rfq_vendor_id", nullable = false)
    private RfqVendor rfqVendor;

    @Column(name = "rfq_item_id", nullable = false)
    private Long rfqItemId;

    private String brand;
    private String model;
    private String sku;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Column(name = "unit_price", nullable = false, precision = 19, scale = 4)
    private BigDecimal unitPrice = BigDecimal.ZERO;

    @Column(name = "quoted_qty", nullable = false)
    private Integer quotedQty = 0;

    @Column(name = "available_stock")
    private Integer availableStock;

    /** in-stock | partial | on-order | out-of-stock */
    @Column(length = 20)
    private String availability;

    @Column(name = "dispatch_date")
    private LocalDate dispatchDate;

    @Column(name = "delivery_date")
    private LocalDate deliveryDate;

    @Column(length = 120)
    private String warranty;

    @Column(name = "country_of_origin", length = 120)
    private String countryOfOrigin;

    @Column(name = "tax_percent", precision = 7, scale = 2)
    private BigDecimal taxPercent;

    @Column(name = "discount_percent", precision = 7, scale = 2)
    private BigDecimal discountPercent;

    @Column(name = "shipping_cost", precision = 19, scale = 4)
    private BigDecimal shippingCost;

    @Column(name = "additional_cost", precision = 19, scale = 4)
    private BigDecimal additionalCost;

    @Column(name = "valid_until")
    private LocalDate validUntil;

    @Column(columnDefinition = "TEXT")
    private String notes;

    @Column(nullable = false)
    private boolean alternative = false;

    @Column(name = "alternative_reason", columnDefinition = "TEXT")
    private String alternativeReason;

    @Column(name = "bulk_tiers_json", columnDefinition = "TEXT")
    private String bulkTiersJson;

    @Column(nullable = false)
    private Integer version = 1;
}
