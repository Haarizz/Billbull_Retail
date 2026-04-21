package com.billbull.backend.purchase.grn;

import java.math.BigDecimal;

public record GrnItemResponse(
        Long id,
        Long productId,
        String code,
        String name,
        String barcode,
        String image,
        String uom,
        Integer lpoQty,
        Integer received,
        Integer accepted,
        Integer rejected,
        BigDecimal unitCost,
        BigDecimal netCost,
        BigDecimal total,
        boolean batch,
        Integer focQty,
        String focUnit,
        String remarks,
        BigDecimal purchaseTax) {
}
