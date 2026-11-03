package com.billbull.backend.sales.pricing;

import java.math.BigDecimal;

import com.billbull.backend.common.BaseEntity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Index;
import jakarta.persistence.Table;

/**
 * A quantity-based unit price (Pricing Phase 3): under one {@link PriceLevel}, once a transaction
 * buys at least {@link #minQuantity} base units of the product, each base unit costs {@link #price}.
 *
 * <p>Thresholds and prices are per <b>base unit</b>, the same convention as {@link ProductLevelPrice}:
 * a line in a multi-unit packing counts its quantity times the packing conversion towards the
 * threshold and is charged the tier price times that conversion. {@code branchId == null} is an
 * all-branches tier; a branch tier with the same threshold wins over it for that branch. Tiers can be
 * attached to the system default level too — there they tier the product's own selling price.
 *
 * <p>{@code isActive = false} is a deactivated tier. Document lines keep their charged price and only
 * a reference id to the tier (no foreign key), so editing or deactivating a tier never changes history.
 */
@Entity
@Table(name = "product_quantity_tiers", indexes = {
        @Index(name = "idx_product_quantity_tiers_product", columnList = "product_id")
})
public class ProductQuantityTier extends BaseEntity {

    @Column(name = "product_id", nullable = false)
    private Long productId;

    @Column(name = "price_level_id", nullable = false)
    private Long priceLevelId;

    @Column(name = "branch_id")
    private Long branchId;

    @Column(name = "min_quantity", nullable = false, precision = 15, scale = 3)
    private BigDecimal minQuantity;

    @Column(nullable = false, precision = 15, scale = 2)
    private BigDecimal price;

    public Long getProductId() { return productId; }
    public void setProductId(Long productId) { this.productId = productId; }
    public Long getPriceLevelId() { return priceLevelId; }
    public void setPriceLevelId(Long priceLevelId) { this.priceLevelId = priceLevelId; }
    public Long getBranchId() { return branchId; }
    public void setBranchId(Long branchId) { this.branchId = branchId; }
    public BigDecimal getMinQuantity() { return minQuantity; }
    public void setMinQuantity(BigDecimal minQuantity) { this.minQuantity = minQuantity; }
    public BigDecimal getPrice() { return price; }
    public void setPrice(BigDecimal price) { this.price = price; }
}
