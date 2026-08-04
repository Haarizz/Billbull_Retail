package com.billbull.backend.pos.businessdate;

/**
 * Signals that the Business Day Engine could not compute a
 * {@link BusinessDayValidationResult} at all — a dependency failed (repository,
 * settings lookup, or something otherwise unclassified) — as opposed to
 * successfully computing a {@link BusinessDayValidationVerdict#UNEXPECTED_STATE}
 * result, which is a normal, valid Business Rule outcome and never throws.
 *
 * <p>This distinction is deliberate and load-bearing: a Business Rule outcome
 * (including {@code UNEXPECTED_STATE}) is a fact about the branch's data and is
 * intended (per the Stage 3B.2B design, not yet enabled) to <b>fail closed</b> —
 * block the session, since something about the data itself is wrong. An
 * Infrastructure Failure is a fact about the *system*, not the data, and is
 * intended to <b>fail open</b> to the legacy gate's own decision — an outage in
 * the new engine must never become an availability regression for real cashiers.
 * See docs/business-day-architecture.md, "Infrastructure Failure Policy."
 */
public class BusinessDayInfrastructureException extends RuntimeException {

    /** Coarse classification used only for metrics/logging — never for a decision;
     *  nothing branches on this beyond which counter to increment. */
    public enum FailureCategory {
        /** A repository call (session/day-close data via {@code BusinessDayStateService}) failed. */
        REPOSITORY,
        /** The branch's {@code PosSettings} snapshot could not be loaded. */
        SETTINGS,
        /** Any other unclassified failure (e.g. a clock source problem). */
        UNEXPECTED
    }

    private final FailureCategory category;

    public BusinessDayInfrastructureException(FailureCategory category, String message, Throwable cause) {
        super(message, cause);
        this.category = category;
    }

    public FailureCategory getCategory() {
        return category;
    }
}
