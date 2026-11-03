package com.billbull.backend.inventory.product;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Selling-unit → base-unit conversion by item code, loaded once for a report run.
 *
 * <p>Converts the way stock deduction does ({@code DeliveryNoteService.resolveBaseQty}): a unit
 * with a packing row multiplies by its conversion and rounds half-up to whole base units; a unit
 * with no packing row (the base unit itself, or an unknown one) leaves the quantity as it is.
 * When one code belongs to several products with different packings, the first row read wins.
 */
public final class PackingConversions {

    private static final PackingConversions NONE = new PackingConversions(Map.of());

    private final Map<String, BigDecimal> byCodeAndUnit;

    private PackingConversions(Map<String, BigDecimal> byCodeAndUnit) {
        this.byCodeAndUnit = byCodeAndUnit;
    }

    /** No conversions known: every quantity is taken as already in base units. */
    public static PackingConversions none() {
        return NONE;
    }

    /** From {@code [productCode, unitName, conversion]} rows, as the packing repository returns them. */
    public static PackingConversions of(List<Object[]> rows) {
        if (rows == null || rows.isEmpty()) return NONE;
        Map<String, BigDecimal> map = new HashMap<>();
        for (Object[] row : rows) {
            if (row == null || row.length < 3 || row[0] == null || row[1] == null || row[2] == null) continue;
            BigDecimal conversion = row[2] instanceof BigDecimal b ? b : new BigDecimal(row[2].toString());
            if (conversion.signum() <= 0) continue;
            map.putIfAbsent(key(row[0].toString(), row[1].toString()), conversion);
        }
        return new PackingConversions(map);
    }

    /** {@code qty} of {@code unit} for item {@code code}, in base units. */
    public int baseQty(String code, String unit, int qty) {
        if (qty <= 0 || code == null || unit == null || unit.isBlank()) return qty;
        BigDecimal conversion = byCodeAndUnit.get(key(code, unit));
        if (conversion == null) return qty;
        return BigDecimal.valueOf(qty).multiply(conversion).setScale(0, RoundingMode.HALF_UP).intValue();
    }

    private static String key(String code, String unit) {
        return code.trim().toUpperCase(Locale.ROOT) + "|" + unit.trim().toLowerCase(Locale.ROOT);
    }
}
