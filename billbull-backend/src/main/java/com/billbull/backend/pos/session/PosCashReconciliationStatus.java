package com.billbull.backend.pos.session;

/**
 * How a drawer stands against its Expected Cash.
 *
 * <p>Purely descriptive. It carries no tolerance, no threshold and no approval meaning — those
 * belong to the variance workflow, which is a later phase. A caller that needs to gate on a
 * threshold still reads {@code PosSettings.cashVarianceThreshold} itself.
 */
public enum PosCashReconciliationStatus {

    /**
     * No physical count exists yet, so no variance can be stated. Distinct from a counted-zero
     * drawer: a mid-shift session and an empty till are not the same fact, and collapsing them
     * is how "0" starts meaning "unknown".
     */
    NOT_COUNTED,

    /** Counted equals expected. The normal outcome. */
    BALANCED,

    /** More cash in the drawer than expected. */
    OVER,

    /** Less cash in the drawer than expected. */
    SHORT
}
