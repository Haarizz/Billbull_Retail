package com.billbull.backend.sales.returns;

import java.time.LocalDate;

public class ReturnableBatchResponse {
    public Long allocationId;
    public Long batchMasterId;
    public String batchNumber;
    public Long binId;
    public String binCode;
    public LocalDate expiryDate;
    public Integer originalQty;
    public Integer alreadyReturnedQty;
    public Integer returnableQty;
    public Long sourceLineId;
    public String itemCode;
    public String itemName;
    public String unit;
}
