package com.billbull.backend.exception;

import java.util.Map;

/**
 * Thrown when a Day Close session range (auto-resolved or supervisor-adjusted)
 * excludes one or more otherwise-eligible sessions for the business date and the
 * caller has not explicitly acknowledged the exclusion. Carries the excluded
 * session list so the frontend can render the warning and let the supervisor
 * confirm before resubmitting with {@code acknowledgeExclusions=true}.
 */
public class SessionRangeExclusionException extends RuntimeException {

    private final Map<String, Object> details;

    public SessionRangeExclusionException(String message, Map<String, Object> details) {
        super(message);
        this.details = details;
    }

    public Map<String, Object> getDetails() {
        return details;
    }
}
