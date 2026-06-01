package com.billbull.backend.sales.settings;

/**
 * How the Sales Invoice net total is rounded.
 *
 * NONE    — no rounding; the exact total stands.
 * NEAREST — snap to the nearest multiple of the configured precision.
 * UP      — always round the total up to the next multiple.
 * DOWN    — always round the total down to the previous multiple.
 */
public enum SalesRoundingMode {
    NONE,
    NEAREST,
    UP,
    DOWN
}
