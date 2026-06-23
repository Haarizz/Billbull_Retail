package com.billbull.backend.purchase.grn;

import java.math.BigDecimal;
import java.util.List;

import com.billbull.backend.purchase.serial.PurchaseSerialDraft;

public record GrnItemRequest(
                Long productId,
                String code,
                String name,
                String barcode,
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
                BigDecimal purchaseTax,
                boolean batch,
                Integer focQty,
                String focUnit,
                String remarks,
                List<PurchaseSerialDraft> serials) {
}
