package com.billbull.backend.inventory.stocktransfer;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public class StockTransferRequest {
    public String transferNo;
    public String referenceDoc;
    public LocalDate transferDate;
    public String reason;
    public String requestedBy;
    public String remarks;
    public Long fromWarehouseId;
    public Long fromZoneId;
    public Long fromLocatorId;
    public Long fromBinId;

    public Long toWarehouseId;
    public Long toZoneId;
    public Long toLocatorId;
    public Long toBinId;
    public String transportMode;
    public String vehicleNo;
    public String driverName;
    public LocalDate dispatchDate;
    public LocalDate arrivalDate;
    public BigDecimal transportCharge;
    public BigDecimal additionalCharges;
    public List<StockTransferItemRequest> items;

    public static class StockTransferItemRequest {
        public Long productId;
        public String batchNumber;
        public Integer quantity;
        public String uom;
    }
}
