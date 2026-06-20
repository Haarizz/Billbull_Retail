package com.billbull.backend.purchase.settings;

public enum PurchaseDocumentType {
    LPO("Local Purchase Order", "LPO"),
    GRN("Goods Receipt Note", "GRN"),
    PURCHASE_INVOICE("Purchase Invoice", "PINV"),
    PAYMENT_VOUCHER("Payment Voucher", "PV");

    private final String label;
    private final String defaultPrefix;

    PurchaseDocumentType(String label, String defaultPrefix) {
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
