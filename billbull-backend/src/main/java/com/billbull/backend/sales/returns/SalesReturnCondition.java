package com.billbull.backend.sales.returns;

/**
 * Physical condition of a returned unit, captured per return line (§12).
 *
 * <p>This is the structured replacement for the legacy free-text
 * {@link SalesReturnItem#getItemStatus()} ("Good" / "Damaged"), which the inventory and
 * COGS paths in {@link SalesReturnService} still branch on. Rather than rewrite that
 * proven logic, the service keeps {@code itemStatus} in sync from this enum via
 * {@link #toLegacyItemStatus()} — GOOD restocks and reverses COGS, everything else is
 * treated as scrap (no stock movement, COGS stays on the books).
 */
public enum SalesReturnCondition {

    /** Resaleable. Returns to saleable stock and reverses COGS. */
    GOOD,

    /** Physically damaged. Scrapped — no restock, COGS retained. */
    DAMAGED,

    /** Packaging opened but product intact. Non-saleable by default. */
    OPENED,

    /** Functionally faulty. Scrapped — typically routed to supplier claim. */
    DEFECTIVE,

    /** Past expiry date. Scrapped. */
    EXPIRED;

    /** Legacy {@code itemStatus} string the existing restock/COGS logic branches on. */
    public String toLegacyItemStatus() {
        return this == GOOD ? "Good" : "Damaged";
    }

    /** True when this condition returns the unit to saleable stock. */
    public boolean isRestockable() {
        return this == GOOD;
    }

    /**
     * Maps a legacy {@code itemStatus} string onto this enum, for reading rows written
     * before the per-line condition column existed. Unknown/blank values fall back to
     * DAMAGED so historic scrap lines are never silently promoted to saleable.
     */
    public static SalesReturnCondition fromLegacyItemStatus(String itemStatus) {
        if (itemStatus == null || itemStatus.isBlank()) return null;
        return "Good".equalsIgnoreCase(itemStatus.trim()) ? GOOD : DAMAGED;
    }
}
