package com.billbull.backend.pos.businessdate;

/**
 * Machine-readable outcome of {@link BusinessDayValidationService#validate}.
 * Deliberately has no human-readable message attached — that remains
 * {@code PosSessionService}'s (or the existing exception layer's) responsibility.
 */
public enum BusinessDayValidationVerdict {
    ALLOW,
    BLOCK,
    UNEXPECTED_STATE
}
