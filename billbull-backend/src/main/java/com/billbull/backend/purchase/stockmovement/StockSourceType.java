package com.billbull.backend.purchase.stockmovement;

public enum StockSourceType {
    LPO,
    GRN,
    DIRECT_PURCHASE, DELIVERY_NOTE, STOCK_TRANSFER_IN, STOCK_TRANSFER_OUT, SALES_INVOICE, SALES_RETURN, CANCELLED,
    STOCK_TAKE,        // Aggregated movement keyed by stock_take_items.id
    STOCK_TAKE_BATCH,  // Legacy per-batch stock take entries
    STOCK_TAKE_ADJUSTMENT // Per stock identity stock-take variance: product + bin + batch + expiry
}
