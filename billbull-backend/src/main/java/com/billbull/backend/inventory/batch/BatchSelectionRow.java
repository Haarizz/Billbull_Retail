package com.billbull.backend.inventory.batch;

import java.time.LocalDate;

public class BatchSelectionRow {
    public Long batchMasterId;
    public String batchNumber;
    public LocalDate expiryDate;
    public LocalDate manufacturingDate;
    public LocalDate entryDate;
    public Integer qtyUnitNo;
    public Integer availableUnits;
    public Integer selectedQuantity;
    public Long daysRemaining;
    public ExpiryWarningLevel warningLevel;
    public String blockedReason;
}
