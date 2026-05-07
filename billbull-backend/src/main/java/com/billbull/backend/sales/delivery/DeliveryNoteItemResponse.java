package com.billbull.backend.sales.delivery;

import java.util.ArrayList;
import java.util.List;

public class DeliveryNoteItemResponse {

    public Long id;
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
    public String binCode;
    public Boolean batchControlled;
    public Boolean fefoEnabled;
    public Integer minExpiryDaysForSale;
    public Integer baseRequiredQuantity;
    public Integer batchSelectedQuantity;
    public String batchSelectionMode;
    public List<DeliveryBatchSelectionResponse> batchSelections = new ArrayList<>();
}
