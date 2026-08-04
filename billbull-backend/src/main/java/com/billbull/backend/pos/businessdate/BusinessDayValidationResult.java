package com.billbull.backend.pos.businessdate;

import java.time.LocalDate;
import java.util.Optional;

/**
 * Immutable result of {@link BusinessDayValidationService#validate}. Machine-
 * readable only — no user-facing message. Never persisted; exists only for the
 * duration of one validation call and whatever the caller does with it
 * (currently: shadow metrics/logging only — see Stage 3B.2A).
 */
public record BusinessDayValidationResult(
        LocalDate candidateBusinessDay,
        Optional<LocalDate> previousUnclosedBusinessDay,
        BusinessDayValidationVerdict verdict,
        BusinessDayBlockingReason blockingReason) {
}
