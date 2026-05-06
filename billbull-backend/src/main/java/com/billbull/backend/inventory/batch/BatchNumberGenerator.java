package com.billbull.backend.inventory.batch;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.OptionalInt;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Builds and parses the per-unit batch number string used by stock-taking.
 *
 * Format: {ID}-{ddMMyy}-L{NN}-{itemCode}-{unitIndex}
 *   ID         StockIdentifier code (e.g. "ST" or "OS")
 *   ddMMyy     date of generation
 *   L{NN}      per-item lot counter, zero-padded to 2 digits (L01, L02, ...)
 *   itemCode   product code
 *   unitIndex  1-based index of this individual unit within the lot
 *
 * Each lot of N counted units yields N batch_number rows that share the lot prefix
 * "{ID}-{ddMMyy}-L{NN}-{itemCode}" and differ only in the trailing unit index.
 */
public final class BatchNumberGenerator {

    private static final DateTimeFormatter DDMMYY = DateTimeFormatter.ofPattern("ddMMyy");

    // Anchored: prefix-{lotIndex}-{itemCode}-{unitIndex}. itemCode may not contain '-'
    // (sanitized by safe()), so this is unambiguous.
    private static final Pattern UNIT_PATTERN =
            Pattern.compile("^(?<prefix>[A-Z]+-\\d{6}-L(?<lot>\\d{2,})-[^-]+)-(?<unit>\\d+)$");

    private BatchNumberGenerator() {}

    public static String generate(StockIdentifier identifier, LocalDate date,
                                  int lotIndex, String itemCode, int unitIndex) {
        return lotPrefix(identifier, date, lotIndex, itemCode) + "-" + unitIndex;
    }

    public static String lotPrefix(StockIdentifier identifier, LocalDate date,
                                   int lotIndex, String itemCode) {
        if (identifier == null) throw new IllegalArgumentException("Stock identifier is required");
        if (date == null) date = LocalDate.now();
        if (lotIndex < 1) throw new IllegalArgumentException("Lot index must start at 1");

        return String.join("-",
                identifier.getCode(),
                date.format(DDMMYY),
                String.format("L%02d", lotIndex),
                safe(itemCode));
    }

    /** Returns the lot prefix (without the trailing unit index) for a new-format batch number,
     *  or null if the input does not match the new format. */
    public static String stripUnitIndex(String batchNumber) {
        if (batchNumber == null) return null;
        Matcher m = UNIT_PATTERN.matcher(batchNumber.trim());
        return m.matches() ? m.group("prefix") : null;
    }

    /** Returns the lot index (the NN in L{NN}) for a new-format batch number, empty otherwise. */
    public static OptionalInt parseLotIndex(String batchNumber) {
        if (batchNumber == null) return OptionalInt.empty();
        Matcher m = UNIT_PATTERN.matcher(batchNumber.trim());
        return m.matches() ? OptionalInt.of(Integer.parseInt(m.group("lot"))) : OptionalInt.empty();
    }

    /** Returns the unit index (trailing number) for a new-format batch number, empty otherwise. */
    public static OptionalInt parseUnitIndex(String batchNumber) {
        if (batchNumber == null) return OptionalInt.empty();
        Matcher m = UNIT_PATTERN.matcher(batchNumber.trim());
        return m.matches() ? OptionalInt.of(Integer.parseInt(m.group("unit"))) : OptionalInt.empty();
    }

    static String safe(String s) {
        if (s == null) return "NA";
        String trimmed = s.trim();
        if (trimmed.isEmpty()) return "NA";
        return trimmed.replace("-", "").replace(" ", "");
    }
}
