package com.billbull.backend.sales.invoice;

import java.util.List;

public record PriceHistoryResponse(
        List<PriceHistoryDTO> customerPrices,
        List<PriceHistoryDTO> recentSales) {
}
