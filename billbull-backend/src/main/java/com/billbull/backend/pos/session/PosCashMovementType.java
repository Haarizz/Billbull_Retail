package com.billbull.backend.pos.session;

/**
 * Values match the raw String literals ("DROP_IN"/"DROP_OUT") the movement_type column has
 * always stored, so switching the entity field from String to this enum (@Enumerated(STRING))
 * is a lossless, backward-compatible change for existing rows.
 */
public enum PosCashMovementType {
    DROP_IN,
    DROP_OUT
}
