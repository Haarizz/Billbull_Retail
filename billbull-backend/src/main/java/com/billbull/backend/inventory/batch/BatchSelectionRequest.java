package com.billbull.backend.inventory.batch;

import java.util.ArrayList;
import java.util.List;

public class BatchSelectionRequest {
    public BatchAllocationMethod mode;
    public String locationCode;
    public Long binId;
    public Integer requiredQuantity;
    public List<Long> batchMasterIds = new ArrayList<>();
}
