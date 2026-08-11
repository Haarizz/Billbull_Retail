package com.billbull.backend.pos.businessdate;

/**
 * Thrown when an operation is refused because the branch's Business Day has closed
 * and it is waiting for the next configured start time.
 *
 * <p>Carries the structured {@link BusinessDayClosedResponse} so controllers can
 * return it verbatim — same pattern as {@code PosSessionDiscoveryBlockedException}.
 * A dedicated exception type (rather than a {@code ResponseStatusException} with a
 * prefixed message) because this condition is not an error the operator caused: the
 * POS renders it as a scheduled-closure screen with a countdown to the next start,
 * which needs real timestamps rather than prose to parse.
 */
public class BusinessDayClosedException extends RuntimeException {

    private final BusinessDayClosedResponse response;

    public BusinessDayClosedException(BusinessDayClosedResponse response) {
        super(response.getMessage());
        this.response = response;
    }

    public static BusinessDayClosedException of(BusinessDayState state) {
        return new BusinessDayClosedException(BusinessDayClosedResponse.from(state));
    }

    public BusinessDayClosedResponse getResponse() {
        return response;
    }
}
