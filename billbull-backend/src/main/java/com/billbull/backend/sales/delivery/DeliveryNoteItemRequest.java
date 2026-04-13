package com.billbull.backend.sales.delivery;

public class DeliveryNoteItemRequest {
    public String itemCode;
    public String description;
    public String unit;

    public Integer orderedQty;
    public Integer prevDeliveredQty;
    public Integer currentQty;
    public Integer boxes;
    public Integer foc;
    public String image;
    public Long binId;
    public Long salesOrderItemId;
}
