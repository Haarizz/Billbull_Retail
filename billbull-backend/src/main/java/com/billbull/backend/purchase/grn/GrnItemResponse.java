package com.billbull.backend.purchase.grn;

import java.math.BigDecimal;

public record GrnItemResponse(
        Long id,
        Long productId, // Added productId for bin mapping
        String code,
        String name,
        String uom,
        Integer lpoQty,
        Integer received,
        Integer accepted,
        Integer rejected,
        BigDecimal unitCost,
        BigDecimal netCost,
        BigDecimal total,
        boolean batch,
        Integer focQty) {
}
