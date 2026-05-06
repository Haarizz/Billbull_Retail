package com.billbull.backend.inventory.stocktake;

public class StockTakeUnitScanResolveRequest {
    private String action;
    private Long productId;

    public String getAction() { return action; }
    public void setAction(String action) { this.action = action; }

    public Long getProductId() { return productId; }
    public void setProductId(Long productId) { this.productId = productId; }
}
