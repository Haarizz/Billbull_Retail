package com.billbull.backend.inventory.stocktransfer;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public class StockTransferResponse {
    public Long id;
    public String transferNo;
    public String referenceDoc;
    public LocalDate transferDate;
    public String reason;
    public String requestedBy;
    public String remarks;
    public Long fromWarehouseId;
    public String fromWarehouseName;
    public Long fromZoneId;
    public String fromZoneName;
    public Long fromLocatorId;
    public String fromLocatorName;
    public Long fromBinId;
    public String fromBinName;

    public Long toWarehouseId;
    public String toWarehouseName;
    public Long toZoneId;
    public String toZoneName;
    public Long toLocatorId;
    public String toLocatorName;
    public Long toBinId;
    public String toBinName;
    public StockTransferStatus status;
    public String transportMode;
    public String vehicleNo;
    public String driverName;
    public LocalDate dispatchDate;
    public LocalDate arrivalDate;
    public BigDecimal transportCharge;
    public BigDecimal additionalCharges;
    public BigDecimal inventoryValue;
    public BigDecimal totalTransferValue;
    public List<StockTransferItemResponse> items;

    public static class StockTransferItemResponse {
        public Long id;
        public Long productId;
        public String productCode;
        public String productName;
        public String batchNumber;
        public Integer quantity;
        public Integer receivedQty;
        public String uom;
        public BigDecimal unitCostAtSend;
        public BigDecimal lineValue;
        public BigDecimal allocatedCharge;
        public BigDecimal receivedLineValue;
    }
}
