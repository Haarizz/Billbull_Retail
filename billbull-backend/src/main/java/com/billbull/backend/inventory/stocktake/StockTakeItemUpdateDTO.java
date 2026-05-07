package com.billbull.backend.inventory.stocktake;

public class StockTakeItemUpdateDTO {
    private Long itemId;     // preferred — unambiguous when the same product appears in multiple bins
    private String sku;
    private Long binId;      // disambiguator when only sku is supplied
    private Integer countedQty;

    public Long getItemId() { return itemId; }
    public void setItemId(Long itemId) { this.itemId = itemId; }
    public String getSku() { return sku; }
    public void setSku(String sku) { this.sku = sku; }
    public Long getBinId() { return binId; }
    public void setBinId(Long binId) { this.binId = binId; }
    public Integer getCountedQty() { return countedQty; }
    public void setCountedQty(Integer countedQty) { this.countedQty = countedQty; }
}
