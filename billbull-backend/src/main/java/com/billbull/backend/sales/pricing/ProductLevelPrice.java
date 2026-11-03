package com.billbull.backend.sales.pricing;

import java.math.BigDecimal;

import com.billbull.backend.common.BaseEntity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Index;
import jakarta.persistence.Table;

/**
 * A product's selling price (per base unit) under one {@link PriceLevel}.
 *
 * <p>{@code branchId == null} is the all-branches price; a row with a branch id overrides it for
 * that branch only. Partial unique indexes (V126) allow one of each per product and level.
 */
@Entity
@Table(name = "product_level_prices", indexes = {
        @Index(name = "idx_product_level_prices_product", columnList = "product_id"),
        @Index(name = "idx_product_level_prices_level", columnList = "price_level_id")
})
public class ProductLevelPrice extends BaseEntity {

    @Column(name = "product_id", nullable = false)
    private Long productId;

    @Column(name = "price_level_id", nullable = false)
    private Long priceLevelId;

    @Column(name = "branch_id")
    private Long branchId;

    @Column(nullable = false, precision = 15, scale = 2)
    private BigDecimal price;

    public Long getProductId() { return productId; }
    public void setProductId(Long productId) { this.productId = productId; }
    public Long getPriceLevelId() { return priceLevelId; }
    public void setPriceLevelId(Long priceLevelId) { this.priceLevelId = priceLevelId; }
    public Long getBranchId() { return branchId; }
    public void setBranchId(Long branchId) { this.branchId = branchId; }
    public BigDecimal getPrice() { return price; }
    public void setPrice(BigDecimal price) { this.price = price; }
}
