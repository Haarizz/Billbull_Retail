package com.billbull.backend.inventory.batch;

public enum StockIdentifier {
    OS("OS"),
    ST("ST"),
    PU("PU"),
    SR("SR"),
    PR("PR"),
    ADJ("ADJ"),
    TR("TR");

    private final String code;

    StockIdentifier(String code) {
        this.code = code;
    }

    public String getCode() {
        return code;
    }
}
