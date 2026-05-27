package com.billbull.backend.sales.settings;

public enum SalesDocumentType {
    CUSTOMER("Customer Code", "CUST"),
    QUOTATION("Quotation", "QTN"),
    SALES_ORDER("Sales Order", "SO"),
    PROFORMA_INVOICE("Proforma Invoice", "PI"),
    SALES_INVOICE("Sales Invoice", "INV"),
    DELIVERY_NOTE("Delivery/Picking Note", "DN"),
    SALES_RETURN("Sales Return", "SR"),
    SALES_PAYMENT("Sales Payment", "PAY");

    private final String label;
    private final String defaultPrefix;

    SalesDocumentType(String label, String defaultPrefix) {
        this.label = label;
        this.defaultPrefix = defaultPrefix;
    }

    public String getLabel() {
        return label;
    }

    public String getDefaultPrefix() {
        return defaultPrefix;
    }
}
