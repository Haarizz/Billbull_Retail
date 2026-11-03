package com.billbull.backend.inventory.barcode;

import java.util.Locale;

import com.billbull.backend.sales.pricing.FixedPriceField;

/**
 * Which selling price a barcode label shows, as stored in a template's {@code fields} JSON under
 * {@code _priceSource}:
 * <ul>
 *   <li>{@code DEFAULT} — the effective selling price (the system default level: a packing's own
 *       price, else the branch price, else the all-branches price). Also what a template without
 *       a stored source uses, so existing templates keep printing the retail price.</li>
 *   <li>{@code LEVEL:<id>} — a named price level (VIP, Dealer, any level users create).</li>
 *   <li>{@code FIELD:<WHOLESALE|ONLINE|MIN|MAX>} — one fixed pricing-master field.</li>
 *   <li>{@code CUSTOMER} — the negotiated price of a customer chosen for the print run.</li>
 * </ul>
 */
public record LabelPriceSource(Kind kind, Long priceLevelId, FixedPriceField field) {

    public static final String TEMPLATE_FIELD = "_priceSource";

    public enum Kind { DEFAULT, LEVEL, FIELD, CUSTOMER }

    public static final LabelPriceSource DEFAULT = new LabelPriceSource(Kind.DEFAULT, null, null);

    /** Parses a stored key; blank means {@link #DEFAULT}. Throws IllegalArgumentException when malformed. */
    public static LabelPriceSource parse(String raw) {
        if (raw == null || raw.isBlank()) return DEFAULT;
        String value = raw.trim();
        String upper = value.toUpperCase(Locale.ROOT);
        if (upper.equals("DEFAULT") || upper.equals("RETAIL")) return DEFAULT;
        if (upper.equals("CUSTOMER")) return new LabelPriceSource(Kind.CUSTOMER, null, null);
        if (upper.startsWith("LEVEL:")) {
            try {
                long id = Long.parseLong(value.substring("LEVEL:".length()).trim());
                if (id <= 0) throw new NumberFormatException();
                return new LabelPriceSource(Kind.LEVEL, id, null);
            } catch (NumberFormatException ex) {
                throw new IllegalArgumentException("Unknown label price source '" + raw + "'.");
            }
        }
        if (upper.startsWith("FIELD:")) {
            try {
                return new LabelPriceSource(Kind.FIELD, null,
                        FixedPriceField.valueOf(upper.substring("FIELD:".length()).trim()));
            } catch (IllegalArgumentException ex) {
                throw new IllegalArgumentException("Unknown label price source '" + raw + "'.");
            }
        }
        throw new IllegalArgumentException("Unknown label price source '" + raw + "'.");
    }

    public String key() {
        return switch (kind) {
            case DEFAULT -> "DEFAULT";
            case CUSTOMER -> "CUSTOMER";
            case LEVEL -> "LEVEL:" + priceLevelId;
            case FIELD -> "FIELD:" + field.name();
        };
    }

    /** Price levels have quantity tiers; fixed fields and negotiated prices do not. */
    public boolean supportsQuantityTiers() {
        return kind == Kind.DEFAULT || kind == Kind.LEVEL;
    }
}
