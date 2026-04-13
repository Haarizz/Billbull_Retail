package com.billbull.backend.sales.invoice;

import java.time.LocalDate;

public record PriceHistoryDTO(
        LocalDate date,
        String invoiceNo,
        String customerName,
        Double rate) {
}
