package com.billbull.backend.inventory.product;

import java.math.BigDecimal;

import com.billbull.backend.common.BaseEntity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Index;
import jakarta.persistence.Table;

/**
 * Append-only trail of every price-level change on a product.
 *
 * <p>{@link ProductPricing} and {@link ProductBranchPricing} are updated in place, so the value a
 * price held before an edit is otherwise unrecoverable — which is why the Price Level / Price
 * Change Audit report used to show the current price in both its Old and New columns. One row is
 * written per price level that actually changed, capturing both sides of the edit. {@code createdAt}
 * / {@code createdBy} (from {@link BaseEntity}, filled by JPA auditing) are the "when" and "who".
 */
@Entity
@Table(name = "product_price_changes", indexes = {
        @Index(name = "idx_product_price_changes_created_at", columnList = "created_at"),
        @Index(name = "idx_product_price_changes_product", columnList = "product_id")
})
public class ProductPriceChange extends BaseEntity {

    @Column(name = "product_id", nullable = false)
    private Long productId;

    /** Null for the product's base price levels; set for a branch-specific override. */
    @Column(name = "branch_id")
    private Long branchId;

    /** Human-readable level name as shown in the report — "Retail", "Cost", "Wholesale", … */
    @Column(name = "price_level", nullable = false, length = 32)
    private String priceLevel;

    /** Null when the level had no value before (first time it was priced). */
    @Column(name = "old_price", precision = 19, scale = 4)
    private BigDecimal oldPrice;

    @Column(name = "new_price", precision = 19, scale = 4)
    private BigDecimal newPrice;

    public ProductPriceChange() {
    }

    public ProductPriceChange(Long productId, Long branchId, String priceLevel,
            BigDecimal oldPrice, BigDecimal newPrice) {
        this.productId = productId;
        this.branchId = branchId;
        this.priceLevel = priceLevel;
        this.oldPrice = oldPrice;
        this.newPrice = newPrice;
    }

    public Long getProductId() {
        return productId;
    }

    public void setProductId(Long productId) {
        this.productId = productId;
    }

    public Long getBranchId() {
        return branchId;
    }

    public void setBranchId(Long branchId) {
        this.branchId = branchId;
    }

    public String getPriceLevel() {
        return priceLevel;
    }

    public void setPriceLevel(String priceLevel) {
        this.priceLevel = priceLevel;
    }

    public BigDecimal getOldPrice() {
        return oldPrice;
    }

    public void setOldPrice(BigDecimal oldPrice) {
        this.oldPrice = oldPrice;
    }

    public BigDecimal getNewPrice() {
        return newPrice;
    }

    public void setNewPrice(BigDecimal newPrice) {
        this.newPrice = newPrice;
    }
}
