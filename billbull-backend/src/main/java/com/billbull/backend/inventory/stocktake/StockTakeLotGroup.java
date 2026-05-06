package com.billbull.backend.inventory.stocktake;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import com.billbull.backend.inventory.batch.BatchNumberGenerator;

/**
 * Read-only view of a logical batch (a "lot") composed of one or more per-unit rows
 * in {@link StockTakeItemBatch}. Used by the frontend BatchEditor so the UI can render
 * one row per lot instead of one row per individual unit.
 *
 * Grouping key: (lotPrefix, expiryDate, seeded). For new-format batch numbers the
 * lotPrefix is everything before the trailing "-{unitIndex}". For legacy batch numbers
 * (no recognizable per-unit suffix) the whole batch_number is used as the lot prefix
 * and the row stands alone.
 */
public class StockTakeLotGroup {

    private final String lotKey;          // grouping key (lotPrefix + expiry + seeded)
    private final String batchNumber;     // lot prefix (what the user sees)
    private final LocalDate expiryDate;
    private final int quantity;           // count of underlying unit rows
    private final boolean seeded;
    private final List<Long> batchIds;    // underlying StockTakeItemBatch row ids
    private final boolean legacy;         // true if the batch number is not in the new per-unit format

    private StockTakeLotGroup(String lotKey, String batchNumber, LocalDate expiryDate,
                              int quantity, boolean seeded, List<Long> batchIds, boolean legacy) {
        this.lotKey = lotKey;
        this.batchNumber = batchNumber;
        this.expiryDate = expiryDate;
        this.quantity = quantity;
        this.seeded = seeded;
        this.batchIds = batchIds;
        this.legacy = legacy;
    }

    public static List<StockTakeLotGroup> from(List<StockTakeItemBatch> batches) {
        if (batches == null || batches.isEmpty()) return List.of();
        Map<String, Accumulator> grouped = new LinkedHashMap<>();
        for (StockTakeItemBatch b : batches) {
            String prefix = BatchNumberGenerator.stripUnitIndex(b.getBatchNumber());
            boolean legacy = prefix == null;
            String displayPrefix = legacy ? b.getBatchNumber() : prefix;
            String key = displayPrefix
                    + "|" + (b.getExpiryDate() == null ? "" : b.getExpiryDate())
                    + "|" + b.isSeeded();
            grouped.computeIfAbsent(key, k -> new Accumulator(displayPrefix, b.getExpiryDate(), b.isSeeded(), legacy))
                   .add(b);
        }
        List<StockTakeLotGroup> out = new ArrayList<>(grouped.size());
        for (Map.Entry<String, Accumulator> e : grouped.entrySet()) {
            Accumulator acc = e.getValue();
            out.add(new StockTakeLotGroup(
                    e.getKey(),
                    acc.batchNumber,
                    acc.expiryDate,
                    acc.totalQty,
                    acc.seeded,
                    acc.ids,
                    acc.legacy));
        }
        return out;
    }

    public String getLotKey() { return lotKey; }
    public String getBatchNumber() { return batchNumber; }
    public LocalDate getExpiryDate() { return expiryDate; }
    public int getQuantity() { return quantity; }
    public boolean isSeeded() { return seeded; }
    public List<Long> getBatchIds() { return batchIds; }
    public boolean isLegacy() { return legacy; }

    private static final class Accumulator {
        final String batchNumber;
        final LocalDate expiryDate;
        final boolean seeded;
        final boolean legacy;
        final List<Long> ids = new ArrayList<>();
        int totalQty;

        Accumulator(String batchNumber, LocalDate expiryDate, boolean seeded, boolean legacy) {
            this.batchNumber = batchNumber;
            this.expiryDate = expiryDate;
            this.seeded = seeded;
            this.legacy = legacy;
        }

        void add(StockTakeItemBatch b) {
            ids.add(b.getId());
            totalQty += b.getQuantity() != null ? b.getQuantity() : 0;
        }

        @Override
        public boolean equals(Object o) {
            if (this == o) return true;
            if (!(o instanceof Accumulator a)) return false;
            return seeded == a.seeded && Objects.equals(batchNumber, a.batchNumber)
                    && Objects.equals(expiryDate, a.expiryDate);
        }

        @Override
        public int hashCode() { return Objects.hash(batchNumber, expiryDate, seeded); }
    }
}
