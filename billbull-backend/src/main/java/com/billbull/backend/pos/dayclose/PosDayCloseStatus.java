package com.billbull.backend.pos.dayclose;

/**
 * Lifecycle of a Day Close record.
 *
 * <p>Deliberately linear and terminal. There is no REOPENED member: the Business Day engine
 * states that once a day is closed there is no supervisor path that reopens it
 * ({@code BusinessDayWindowService}), and post-finalization changes go through the existing
 * {@code CorrectionRequest} workflow, which preserves the original record instead of editing it.
 *
 * <p>Carries no approval meaning. Variance approval is a separate concern with its own actors
 * and its own audit, and belongs to the phase that implements it.
 */
public enum PosDayCloseStatus {

    /** The snapshot has been produced. */
    GENERATED,

    /** A human has looked at it. */
    REVIEWED,

    /** Closed out. Terminal. */
    FINALIZED
}
