package com.billbull.backend.sales.pricing;

import java.math.BigDecimal;
import java.time.LocalDate;

import com.billbull.backend.common.BaseEntity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Index;
import jakarta.persistence.Table;

/**
 * A negotiated selling price (per base unit) for one customer and product (Pricing Phase 2, V128).
 *
 * <p>{@code branchId == null} applies in every branch; a row with a branch id applies in that
 * branch only and wins over the all-branches row there. The price applies from
 * {@code effectiveFrom} to {@code effectiveTo} inclusive ({@code null} = open-ended) while
 * {@code enabled}. {@code isActive = false} is the soft delete.
 *
 * <p>It is a selling-price rule, not a discount: when it applies, the line is charged this price
 * instead of the price-level or default price, with packing conversions and tax handled exactly
 * as for those prices.
 */
@Entity
@Table(name = "customer_product_prices", indexes = {
        @Index(name = "idx_customer_product_prices_customer", columnList = "customer_id"),
        @Index(name = "idx_customer_product_prices_product", columnList = "product_id"),
        @Index(name = "idx_customer_product_prices_branch", columnList = "branch_id")
})
public class CustomerProductPrice extends BaseEntity {

    @Column(name = "customer_id", nullable = false)
    private Long customerId;

    @Column(name = "product_id", nullable = false)
    private Long productId;

    @Column(name = "branch_id")
    private Long branchId;

    @Column(nullable = false, precision = 15, scale = 2)
    private BigDecimal price;

    @Column(name = "effective_from", nullable = false)
    private LocalDate effectiveFrom;

    @Column(name = "effective_to")
    private LocalDate effectiveTo;

    @Column(nullable = false)
    private boolean enabled = true;

    @Column(length = 500)
    private String notes;

    /** Usable on {@code date}: not removed, enabled, and within its validity period. */
    public boolean appliesOn(LocalDate date) {
        if (!isActive() || !enabled || price == null || price.signum() <= 0 || date == null) return false;
        if (effectiveFrom != null && date.isBefore(effectiveFrom)) return false;
        return effectiveTo == null || !date.isAfter(effectiveTo);
    }

    public Long getCustomerId() { return customerId; }
    public void setCustomerId(Long customerId) { this.customerId = customerId; }
    public Long getProductId() { return productId; }
    public void setProductId(Long productId) { this.productId = productId; }
    public Long getBranchId() { return branchId; }
    public void setBranchId(Long branchId) { this.branchId = branchId; }
    public BigDecimal getPrice() { return price; }
    public void setPrice(BigDecimal price) { this.price = price; }
    public LocalDate getEffectiveFrom() { return effectiveFrom; }
    public void setEffectiveFrom(LocalDate effectiveFrom) { this.effectiveFrom = effectiveFrom; }
    public LocalDate getEffectiveTo() { return effectiveTo; }
    public void setEffectiveTo(LocalDate effectiveTo) { this.effectiveTo = effectiveTo; }
    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }
}
