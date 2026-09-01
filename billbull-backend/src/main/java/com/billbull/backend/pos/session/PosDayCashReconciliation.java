package com.billbull.backend.pos.session;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * A day's drawer reconciliation, aggregated from the frozen per-session snapshots.
 *
 * <p>Not a second cash model: every figure here is a sum over values the reconciliation service
 * already produced and the close already froze. There is no formula in this class beyond
 * addition and a subtraction that is the definition of variance.
 *
 * <h3>A partly-counted day states no day variance</h3>
 * {@link #cashVariance()} is {@code null} unless every session was counted. Subtracting the
 * expected cash of <em>all</em> drawers from the counted cash of <em>some</em> would report the
 * uncounted tills as an enormous shortage — a number that looks like a finding and is really an
 * artifact of the arithmetic. {@link #countedSessionsVariance()} gives the honest, actionable
 * figure for the drawers that were actually verified, and {@link #uncountedSessionCount()} keeps
 * the gap visible rather than folded away.
 */
public final class PosDayCashReconciliation {

    private final BigDecimal expectedCash;
    private final BigDecimal countedCash;
    private final BigDecimal countedSessionsExpectedCash;
    private final int sessionCount;
    private final int countedSessionCount;
    private final int uncountedSessionCount;
    private final int sessionsWithVariance;
    private final PosCashReconciliationStatus status;

    PosDayCashReconciliation(BigDecimal expectedCash,
                             BigDecimal countedCash,
                             BigDecimal countedSessionsExpectedCash,
                             int sessionCount,
                             int countedSessionCount,
                             int uncountedSessionCount,
                             int sessionsWithVariance,
                             PosCashReconciliationStatus status) {
        this.expectedCash = expectedCash;
        this.countedCash = countedCash;
        this.countedSessionsExpectedCash = countedSessionsExpectedCash;
        this.sessionCount = sessionCount;
        this.countedSessionCount = countedSessionCount;
        this.uncountedSessionCount = uncountedSessionCount;
        this.sessionsWithVariance = sessionsWithVariance;
        this.status = status;
    }

    /** Σ frozen {@code session.expectedCash} over every session in the day. */
    public BigDecimal expectedCash() { return expectedCash; }

    /** Σ frozen counted cash over the counted sessions only, or {@code null} when none were. */
    public BigDecimal countedCash() { return countedCash; }

    /** Σ expected cash of the counted sessions — the comparable half of {@link #countedCash()}. */
    public BigDecimal countedSessionsExpectedCash() { return countedSessionsExpectedCash; }

    public int sessionCount() { return sessionCount; }
    public int countedSessionCount() { return countedSessionCount; }
    public int uncountedSessionCount() { return uncountedSessionCount; }

    /** How many counted sessions did not balance. */
    public int sessionsWithVariance() { return sessionsWithVariance; }

    public PosCashReconciliationStatus status() { return status; }

    public boolean isFullyCounted() { return sessionCount > 0 && uncountedSessionCount == 0; }

    /**
     * The day's variance, or {@code null} unless every session was counted — see the class note
     * on why a partly-counted day states none.
     */
    public BigDecimal cashVariance() {
        if (!isFullyCounted() || countedCash == null) return null;
        return countedCash.subtract(expectedCash);
    }

    /** Variance across the drawers that were actually counted, whatever the rest did. */
    public BigDecimal countedSessionsVariance() {
        if (countedCash == null) return null;
        return countedCash.subtract(countedSessionsExpectedCash);
    }

    public Map<String, Object> toMap() {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("expectedCash", expectedCash);
        map.put("countedCash", countedCash);
        map.put("cashVariance", cashVariance());
        map.put("countedSessionsExpectedCash", countedSessionsExpectedCash);
        map.put("countedSessionsVariance", countedSessionsVariance());
        map.put("reconciliationStatus", status);
        map.put("sessionCount", sessionCount);
        map.put("countedSessionCount", countedSessionCount);
        map.put("uncountedSessionCount", uncountedSessionCount);
        map.put("sessionsWithVariance", sessionsWithVariance);
        map.put("fullyCounted", isFullyCounted());
        return map;
    }
}
