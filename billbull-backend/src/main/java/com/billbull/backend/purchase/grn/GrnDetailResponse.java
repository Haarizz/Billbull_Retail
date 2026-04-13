package com.billbull.backend.purchase.grn;

import java.time.LocalDate;
import java.util.List;

public record GrnDetailResponse(
        Long id,
        String grnNo,
        LocalDate date,
        String vendor,
        String docRef,
        String status,
        String qcStatus,
        boolean posted,
        Long warehouseId,
        String warehouseName,
        Long zoneId,
        String zoneName,
        Long locatorId,
        String locatorName,
        Long binId,
        String binName,
        List<GrnItemResponse> items) {
}
