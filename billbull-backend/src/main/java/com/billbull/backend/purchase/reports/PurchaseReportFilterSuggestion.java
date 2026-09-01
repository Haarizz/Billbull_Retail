package com.billbull.backend.purchase.reports;

/**
 * One entry in the Vendors &amp; Purchases "Item / SKU Search" typeahead.
 *
 * <p>Picking an entry sends its exact {@code code} back as the {@code itemCode}
 * parameter, so the report filters on that item rather than on a free-text match.
 */
public class PurchaseReportFilterSuggestion {

    private final String code;
    private final String name;
    private final String subtitle;

    public PurchaseReportFilterSuggestion(String code, String name, String subtitle) {
        this.code = code;
        this.name = name;
        this.subtitle = subtitle;
    }

    public String getCode() { return code; }

    public String getName() { return name; }

    /** Secondary line shown under the name — SKU and category. */
    public String getSubtitle() { return subtitle; }

    /** Stable key for React list rendering. */
    public String getId() { return "ITEM:" + code; }
}
