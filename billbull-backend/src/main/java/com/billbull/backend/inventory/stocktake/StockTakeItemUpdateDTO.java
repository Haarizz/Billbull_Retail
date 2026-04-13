package com.billbull.backend.inventory.stocktake;

public class StockTakeItemUpdateDTO {
    private String sku;
    private Integer countedQty;

    public String getSku() { return sku; }
    public void setSku(String sku) { this.sku = sku; }
    public Integer getCountedQty() { return countedQty; }
    public void setCountedQty(Integer countedQty) { this.countedQty = countedQty; }
}
