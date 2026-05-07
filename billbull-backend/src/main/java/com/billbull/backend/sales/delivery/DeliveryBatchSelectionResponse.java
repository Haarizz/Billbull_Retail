package com.billbull.backend.sales.delivery;

import java.time.LocalDate;

import com.billbull.backend.inventory.batch.BatchAllocationMethod;
import com.billbull.backend.inventory.batch.BatchAllocationStatus;

public class DeliveryBatchSelectionResponse {
    public Long allocationId;
    public Long batchMasterId;
    public String batchNumber;
    public LocalDate expiryDate;
    public LocalDate manufacturingDate;
    public LocalDate entryDate;
    public Integer qtyUnitNo;
    public Integer quantity;
    public BatchAllocationMethod allocationMethod;
    public BatchAllocationStatus status;
}
