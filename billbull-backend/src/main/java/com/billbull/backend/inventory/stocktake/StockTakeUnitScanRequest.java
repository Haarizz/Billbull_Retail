package com.billbull.backend.inventory.stocktake;

public class StockTakeUnitScanRequest {
    private String barcode;
    private Long binId;

    public String getBarcode() { return barcode; }
    public void setBarcode(String barcode) { this.barcode = barcode; }

    public Long getBinId() { return binId; }
    public void setBinId(Long binId) { this.binId = binId; }
}
