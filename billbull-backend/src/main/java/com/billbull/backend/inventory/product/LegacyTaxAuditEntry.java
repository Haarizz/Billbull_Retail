package com.billbull.backend.inventory.product;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * One row of the "possibly auto-assigned legacy 5% Sales Tax" audit report (Phase 7 of the
 * tax-architecture cleanup). Read-only — never used to change data automatically. An admin
 * reviews these and decides, per product, whether to clear the Sales Tax so it inherits the
 * Branch Default VAT Rate instead.
 */
public class LegacyTaxAuditEntry {
    private final Long productId;
    private final String productCode;
    private final String productName;
    private final BigDecimal currentSalesTax;
    private final LocalDateTime createdAt;
    private final LocalDateTime updatedAt;
    private final boolean likelyAutoAssigned;
    private final String recommendation;

    public LegacyTaxAuditEntry(Long productId, String productCode, String productName,
                                BigDecimal currentSalesTax, LocalDateTime createdAt, LocalDateTime updatedAt,
                                boolean likelyAutoAssigned, String recommendation) {
        this.productId = productId;
        this.productCode = productCode;
        this.productName = productName;
        this.currentSalesTax = currentSalesTax;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
        this.likelyAutoAssigned = likelyAutoAssigned;
        this.recommendation = recommendation;
    }

    public Long getProductId() { return productId; }
    public String getProductCode() { return productCode; }
    public String getProductName() { return productName; }
    public BigDecimal getCurrentSalesTax() { return currentSalesTax; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public boolean isLikelyAutoAssigned() { return likelyAutoAssigned; }
    public String getRecommendation() { return recommendation; }
}
