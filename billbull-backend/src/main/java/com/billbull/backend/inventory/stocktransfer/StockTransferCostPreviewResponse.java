package com.billbull.backend.inventory.stocktransfer;

import java.math.BigDecimal;
import java.util.List;

public class StockTransferCostPreviewResponse {
    public Long warehouseId;
    public List<StockTransferCostItemResponse> items;

    public static class StockTransferCostItemResponse {
        public Long productId;
        public BigDecimal unitCost;
        public String costSource;
        public boolean costAvailable;
    }
}
