package com.billbull.backend.purchase.stockmovement;

public enum StockSourceType {
    LPO,
    GRN,
    DIRECT_PURCHASE, DELIVERY_NOTE, STOCK_TRANSFER_IN, STOCK_TRANSFER_OUT, SALES_INVOICE, CANCELLED,
    STOCK_TAKE,        // Aggregated movement keyed by stock_take_items.id
    STOCK_TAKE_BATCH   // Per-batch movement keyed by stock_take_item_batches.id (separate id namespace)
}
