package com.billbull.backend.inventory.warehouse;

public class WarehouseResolutionItem {
    private Long productId;
    private int baseRequestedQuantity;

    public WarehouseResolutionItem(Long productId, int baseRequestedQuantity) {
        this.productId = productId;
        this.baseRequestedQuantity = baseRequestedQuantity;
    }

    public Long getProductId() {
        return productId;
    }

    public int getBaseRequestedQuantity() {
        return baseRequestedQuantity;
    }
}
