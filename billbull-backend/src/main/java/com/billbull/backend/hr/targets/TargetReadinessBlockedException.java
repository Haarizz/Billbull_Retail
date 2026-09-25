package com.billbull.backend.hr.targets;

/**
 * Thrown when POS checkout is refused because this month's salesperson target configuration is
 * incomplete.
 *
 * <p>Carries the whole {@link TargetReadinessResponse} rather than flattening it into a message
 * string, so the POS can render the "Salesperson Setup Required" dialog with the actual list of
 * misconfigured employees. Stuffing that list into a sentence is how a refusal becomes unactionable
 * — the cashier has to be told WHO to go and configure.
 *
 * <p>Deliberately not a {@code ResponseStatusException}: the caller
 * ({@code PosCheckoutController.checkout}) turns it into a 409 with a structured body, mirroring
 * how {@code BusinessDayClosedException} is surfaced as a 423 with its own typed payload.
 */
public class TargetReadinessBlockedException extends RuntimeException {

    private final transient TargetReadinessResponse readiness;

    public TargetReadinessBlockedException(TargetReadinessResponse readiness) {
        super("Salesperson target configuration is incomplete for "
                + (readiness != null ? readiness.getMonth() : "the current month") + ".");
        this.readiness = readiness;
    }

    public TargetReadinessResponse getReadiness() {
        return readiness;
    }
}
