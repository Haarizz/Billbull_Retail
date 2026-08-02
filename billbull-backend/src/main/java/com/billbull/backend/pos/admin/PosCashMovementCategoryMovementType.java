package com.billbull.backend.pos.admin;

/** Which direction(s) of {@link com.billbull.backend.pos.session.PosCashMovement} a category
 *  applies to. Distinct from {@code PosCashMovementType} (DROP_IN/DROP_OUT only, on the
 *  movement itself) because a category can additionally be valid for BOTH directions —
 *  e.g. "Bank Transfer" might apply to both a drop-in and a drop-out. */
public enum PosCashMovementCategoryMovementType {
    DROP_IN,
    DROP_OUT,
    BOTH
}
