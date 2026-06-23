package com.billbull.backend.purchase.grn;

import java.math.BigDecimal;
import java.util.List;

import com.billbull.backend.purchase.serial.PurchaseSerialDraft;

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
        BigDecimal discountPercent,
        BigDecimal taxAmt,
        boolean serialEnabled,
        List<PurchaseSerialDraft> serials,
        boolean batch,
        Integer focQty,
        String focUnit,
        String remarks,
        BigDecimal purchaseTax,
        String detailedDesc) {
}
