package com.billbull.backend.sales.pricing;

import java.math.BigDecimal;

/**
 * A sales-document line the shared resolver prices and stamps on save — invoice, quotation, sales
 * order and pro-forma lines alike (see {@link PricingResolutionService#applyToLines}).
 *
 * <p>The stamp fields record how the charged {@code price} came about. They are always written by
 * the server; whatever a client sends in them is overwritten.
 */
public interface PriceStampedLine {

    String getItemCode();
    String getUnit();
    BigDecimal getPrice();
    void setPrice(BigDecimal price);

    /** The paid quantity in the line's selling unit (FOC excluded), or null. */
    BigDecimal pricingQuantity();

    /** A voided line is neither priced nor counted towards a quantity tier. */
    default boolean pricingVoided() { return false; }

    Long getPriceLevelId();
    void setPriceLevelId(Long id);
    String getPriceLevelName();
    void setPriceLevelName(String name);
    String getPriceSource();
    void setPriceSource(String source);
    BigDecimal getResolvedUnitPrice();
    void setResolvedUnitPrice(BigDecimal price);
    Boolean getPriceOverridden();
    void setPriceOverridden(Boolean overridden);
    Long getCustomerPriceId();
    void setCustomerPriceId(Long id);
    Long getQuantityTierId();
    void setQuantityTierId(Long id);
    BigDecimal getTierMinQuantity();
    void setTierMinQuantity(BigDecimal minQuantity);
    BigDecimal getTierEligibleQuantity();
    void setTierEligibleQuantity(BigDecimal quantity);
}
