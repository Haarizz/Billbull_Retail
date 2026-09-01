package com.billbull.backend.sales.reports;

/**
 * One entry in the Sales Reports "Customer / Item" filter typeahead.
 *
 * <p>{@code type} tells the frontend which structured parameter to send back when the
 * entry is picked ({@code customerCode} or {@code itemCode}), so a chosen suggestion
 * filters on an exact code instead of a free-text match.
 */
public class SalesReportFilterSuggestion {

    public enum Type { CUSTOMER, ITEM }

    private final Type type;
    private final String code;
    private final String name;
    private final String subtitle;

    public SalesReportFilterSuggestion(Type type, String code, String name, String subtitle) {
        this.type = type;
        this.code = code;
        this.name = name;
        this.subtitle = subtitle;
    }

    public Type getType() { return type; }

    public String getCode() { return code; }

    public String getName() { return name; }

    /** Secondary line shown under the name (mobile for a customer, SKU/category for an item). */
    public String getSubtitle() { return subtitle; }

    /** Stable key for React list rendering and de-duplication. */
    public String getId() { return type + ":" + code; }
}
