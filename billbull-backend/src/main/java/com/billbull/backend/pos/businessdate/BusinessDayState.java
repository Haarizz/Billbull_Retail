package com.billbull.backend.pos.businessdate;

import java.time.LocalDateTime;

/**
 * The complete, authoritative answer to "what is this branch's Business Day doing
 * right now" — the resolved {@link BusinessDayWindow} and whether window enforcement
 * is switched on for the branch.
 *
 * <p>Produced only by {@link BusinessDayWindowService}. Every consumer — session
 * opening, checkout, the Day Status endpoint, the UI — reads its decision from
 * {@link #blocksNormalOperation()} rather than re-testing the phase itself, so the
 * enforcement rule exists in exactly one place.
 *
 * @param window             the window in force.
 * @param enforcementEnabled whether reaching closure actually blocks for this branch.
 * @param now                the moment this state was resolved at, in the Business
 *                           Day timezone — carried so callers rendering countdowns
 *                           use the same clock reading the phase was decided from.
 */
public record BusinessDayState(
        BusinessDayWindow window,
        boolean enforcementEnabled,
        LocalDateTime now) {

    public BusinessDayPhase phase() {
        return window.phase();
    }

    /**
     * Whether normal POS operation (opening a session, selling) must be refused
     * right now. True only when the branch has window enforcement on <i>and</i> the
     * Business Day has actually closed — never during {@code ACTIVE} or
     * {@code EXTENSION}, and never for an unconfigured window.
     */
    public boolean blocksNormalOperation() {
        return enforcementEnabled && !window.allowsNormalOperation();
    }

    /** Whether the Scheduled End Time has passed but the Business Day is still open —
     *  the state the POS surfaces as a visible "forced closure approaching" warning. */
    public boolean isInExtension() {
        return window.phase() == BusinessDayPhase.EXTENSION;
    }
}
