package com.billbull.backend.purchase.rfq;

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

/** A requested product line on an RFQ. Linked to the product master so it can become an LPO line. */
@Entity
@Table(name = "purchase_rfq_items")
@Getter
@Setter
public class RfqItem extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "rfq_id", nullable = false)
    private Rfq rfq;

    @Column(name = "line_no")
    private Integer lineNo;

    @Column(name = "product_id", nullable = false)
    private Long productId;

    @Column(name = "item_code", length = 120)
    private String itemCode;

    @Column(name = "item_name", nullable = false)
    private String itemName;

    @Column(columnDefinition = "TEXT")
    private String description;

    private String category;
    private String brand;
    private String model;

    @Column(length = 40)
    private String unit;

    @Column(name = "qty_needed", nullable = false)
    private Integer qtyNeeded;

    @Column(name = "qty_ordered", nullable = false)
    private Integer qtyOrdered = 0;

    @Column(name = "min_spec", columnDefinition = "TEXT")
    private String minSpec;

    @Column(name = "alt_brand_allowed", nullable = false)
    private boolean altBrandAllowed = true;

    @Column(name = "partial_allowed", nullable = false)
    private boolean partialAllowed = true;

    @Column(name = "expected_delivery")
    private LocalDate expectedDelivery;

    @Column(name = "warranty_required", length = 120)
    private String warrantyRequired;

    /** The offer staff picked for this item in the quotation workspace (null = not awarded yet). */
    @Column(name = "awarded_offer_id")
    private Long awardedOfferId;

    public int remainingQty() {
        int needed = qtyNeeded == null ? 0 : qtyNeeded;
        int ordered = qtyOrdered == null ? 0 : qtyOrdered;
        return Math.max(0, needed - ordered);
    }
}
