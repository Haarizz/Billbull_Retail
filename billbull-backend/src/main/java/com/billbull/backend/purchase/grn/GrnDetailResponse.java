package com.billbull.backend.purchase.grn;

import java.math.BigDecimal;
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
        BigDecimal subtotal,
        BigDecimal taxAmount,
        BigDecimal grandTotal,
        Integer packageCount,
        String receivedBy,
        String checkedBy,
        List<GrnItemResponse> items,
        Long branchId,
        String branchName,
        String branchCode) {
}
