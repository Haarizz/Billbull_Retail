package com.billbull.backend.sales.delivery;

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
    public Double price;
    public Double disc;
    public Double tax;
    public Double cost;
}
