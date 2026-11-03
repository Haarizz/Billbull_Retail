package com.billbull.backend.inventory.barcode;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/** Request / response types of {@link BarcodeLabelPriceService}. */
public final class LabelPriceModels {

    private LabelPriceModels() {}

    /**
     * A price source a label can use, offered to the template editor and the print queue.
     *
     * @param key                   what is stored in the template ({@link LabelPriceSource#key()})
     * @param kind                  DEFAULT / LEVEL / FIELD / CUSTOMER
     * @param requiresCustomer      the print run must name a customer
     * @param supportsQuantityTiers a pricing quantity can select a quantity tier
     */
    public record SourceOption(String key, String kind, String label, String description, Long priceLevelId,
                               boolean requiresCustomer, boolean supportsQuantityTiers) {}

    /**
     * One label to price. {@code key} is echoed back. {@code barcode} decides the unit: the packing
     * it is registered to is the unit priced. {@code unit} is used only when the barcode is not a
     * registered barcode of the product.
     */
    public record Item(String key, Long productId, String itemCode, String barcode, String unit) {}

    public static class Request {
        /** A {@link LabelPriceSource} key; blank = DEFAULT. */
        private String source;
        /** The branch whose prices to show; null = the caller's current branch. */
        private Long branchId;
        /** Required for the CUSTOMER source, ignored otherwise. */
        private Long customerId;
        /** Optional, in the barcode's own unit; only then can a quantity tier apply. */
        private BigDecimal pricingQuantity;
        /** The day negotiated prices must be valid on; null = the business day. */
        private LocalDate pricingDate;
        private List<Item> items;

        public String getSource() { return source; }
        public void setSource(String source) { this.source = source; }
        public Long getBranchId() { return branchId; }
        public void setBranchId(Long branchId) { this.branchId = branchId; }
        public Long getCustomerId() { return customerId; }
        public void setCustomerId(Long customerId) { this.customerId = customerId; }
        public BigDecimal getPricingQuantity() { return pricingQuantity; }
        public void setPricingQuantity(BigDecimal pricingQuantity) { this.pricingQuantity = pricingQuantity; }
        public LocalDate getPricingDate() { return pricingDate; }
        public void setPricingDate(LocalDate pricingDate) { this.pricingDate = pricingDate; }
        public List<Item> getItems() { return items; }
        public void setItems(List<Item> items) { this.items = items; }
    }

    /**
     * One priced label.
     *
     * @param unit             the unit priced (null = the base unit)
     * @param unitBasis        BARCODE (the barcode's packing), REQUEST (the queue's unit) or BASE
     * @param conversion       base units in one {@code unit}
     * @param price            the label price, or null when {@code available} is false — never a
     *                         substitute from another source, and never cost
     * @param priceSource      the resolver's source (PACKING_PRICE, BRANCH_PRICE, PRICE_LEVEL_BRANCH …)
     * @param sourceLabel      a short human description of where the price came from
     * @param message          why the price is unavailable, or a note about how it was priced
     * @param eligibleQuantity base units the pricing quantity amounts to (null without one)
     */
    public record Result(String key, Long productId, String itemCode, String unit, String unitBasis,
                         BigDecimal conversion, BigDecimal price, boolean available, String priceSource,
                         String sourceLabel, String message, boolean tierApplied, BigDecimal tierMinQuantity,
                         BigDecimal eligibleQuantity) {}

    /**
     * @param sourceError the source itself cannot be used (unknown or inactive level, missing
     *                    customer …) — every item is then unavailable
     * @param notice      a remark that applies to the whole run (e.g. tiers do not apply to a field)
     */
    public record Response(String source, String sourceLabel, Long branchId, String branchName,
                           Long customerId, String customerName, BigDecimal pricingQuantity,
                           LocalDate pricingDate, String sourceError, String notice, List<Result> items) {}
}
