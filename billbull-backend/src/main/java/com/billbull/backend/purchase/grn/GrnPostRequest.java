package com.billbull.backend.purchase.grn;

import java.util.List;

public record GrnPostRequest(
        List<ItemBinMapping> binMappings) {
    public static record ItemBinMapping(
            Long productId,
            String binCode) {
    }
}
