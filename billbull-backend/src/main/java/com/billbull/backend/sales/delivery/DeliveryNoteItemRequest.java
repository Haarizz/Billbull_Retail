package com.billbull.backend.sales.delivery;

import java.math.BigDecimal;

public class DeliveryNoteItemRequest {
    public String itemCode;
    public String barcode;
    public String description;
    public String unit;

    public Integer orderedQty;
    public Integer prevDeliveredQty;
    public Integer currentQty;
    public Integer boxes;
    public Integer foc;
    public String focUnit;
    public String remarks;
    public String image;
    public Long binId;
    public Long salesOrderItemId;
    public Long sourceLineId;
    public BigDecimal price;
    public Double disc;   // PERCENTAGE rate
    public Double tax;    // PERCENTAGE rate
    public BigDecimal cost;
}
