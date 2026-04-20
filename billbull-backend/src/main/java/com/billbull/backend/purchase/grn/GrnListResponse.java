package com.billbull.backend.purchase.grn;

import java.math.BigDecimal;
import java.time.LocalDate;

public record GrnListResponse(
        Long id,
        String idDisplay,
        LocalDate date,
        String vendor,
        String docRef,
        String warehouse,
        Integer packages,
        BigDecimal value,
        String qcStatus,
        String invStatus,
        boolean posted,
        String status,
        Long referenceId,
        String sourceType,
        Long branchId,
        String branchName,
        String branchCode) {
}
