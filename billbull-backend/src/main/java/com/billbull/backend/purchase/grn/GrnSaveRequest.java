package com.billbull.backend.purchase.grn;

import java.time.LocalDate;
import java.util.List;

public record GrnSaveRequest(
        LocalDate date,
        String vendor,
        String lpo,
        Long warehouseId,
        Long zoneId,
        Long locatorId,
        Long binId,
        Long branchId,
        String branchName,
        String branchCode,
        String grnType,
        Integer packages,
        List<GrnItemRequest> items) {
}
