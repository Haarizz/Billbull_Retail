package com.billbull.backend.sales.invoice;

import java.math.BigDecimal;
import java.time.LocalDate;

public record PriceHistoryDTO(
        LocalDate date,
        String invoiceNo,
        String customerName,
        BigDecimal rate) {
}
