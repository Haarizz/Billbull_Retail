package com.billbull.backend.inventory.batch;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;

public final class BatchNumberGenerator {

    private static final DateTimeFormatter DDMMYY = DateTimeFormatter.ofPattern("ddMMyy");

    private BatchNumberGenerator() {}

    public static String generate(StockIdentifier identifier, LocalDate date,
                                  String warehouseCode, String documentCode,
                                  String itemCode, int sequenceNo) {
        if (identifier == null) throw new IllegalArgumentException("Stock identifier is required");
        if (date == null) date = LocalDate.now();
        if (sequenceNo < 1) throw new IllegalArgumentException("Sequence number must start at 1");

        return String.join("-",
                identifier.getCode(),
                date.format(DDMMYY),
                safe(warehouseCode),
                safe(documentCode),
                safe(itemCode),
                String.valueOf(sequenceNo));
    }

    private static String safe(String s) {
        if (s == null) return "NA";
        String trimmed = s.trim();
        if (trimmed.isEmpty()) return "NA";
        return trimmed.replace("-", "").replace(" ", "");
    }
}
