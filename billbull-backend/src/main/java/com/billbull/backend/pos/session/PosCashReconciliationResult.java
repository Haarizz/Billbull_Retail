package com.billbull.backend.pos.session;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * One drawer's reconciliation, as computed by {@link PosCashReconciliationService}.
 *
 * <p>A finished answer, not a calculator. Every figure is supplied by the service; this type
 * performs no business arithmetic of its own, so there is nowhere for a second Expected Cash
 * formula to grow. {@link #variance()} is the sole exception and is deliberately trivial
 * ({@code counted − expected}), which is the definition of variance rather than a calculation
 * over cash sources.
 *
 * <p>{@code countedCash} is nullable and that nullness is load-bearing: {@code null} means no
 * physical count has been taken, {@code 0} means a count was taken and the drawer was empty.
 * {@code variance} and {@code status} follow from it — an uncounted drawer has no variance, and
 * reporting one as {@code 0} would state a reconciliation that never happened.
 */
public final class PosCashReconciliationResult {

    private final Long sessionId;
    private final BigDecimal openingFloat;
    private final BigDecimal cashTenderCollected;
    private final BigDecimal authorizedCashIn;
    private final BigDecimal authorizedCashOut;
    private final BigDecimal expectedCash;
    private final BigDecimal countedCash;
    private final LocalDateTime countedAt;
    private final PosCashReconciliationStatus status;

    PosCashReconciliationResult(Long sessionId,
                                BigDecimal openingFloat,
                                BigDecimal cashTenderCollected,
                                BigDecimal authorizedCashIn,
                                BigDecimal authorizedCashOut,
                                BigDecimal expectedCash,
                                BigDecimal countedCash,
                                LocalDateTime countedAt,
                                PosCashReconciliationStatus status) {
        this.sessionId = sessionId;
        this.openingFloat = openingFloat;
        this.cashTenderCollected = cashTenderCollected;
        this.authorizedCashIn = authorizedCashIn;
        this.authorizedCashOut = authorizedCashOut;
        this.expectedCash = expectedCash;
        this.countedCash = countedCash;
        this.countedAt = countedAt;
        this.status = status;
    }

    public Long sessionId() { return sessionId; }

    /** L1 — {@code pos_sessions.opening_cash}. */
    public BigDecimal openingFloat() { return openingFloat; }

    /** L2 — cash settlement attributable to this collection session. */
    public BigDecimal cashTenderCollected() { return cashTenderCollected; }

    /** L3 — ACTIVE DROP_IN total. */
    public BigDecimal authorizedCashIn() { return authorizedCashIn; }

    /** L3 — ACTIVE DROP_OUT total. */
    public BigDecimal authorizedCashOut() { return authorizedCashOut; }

    /** {@code openingFloat + cashTenderCollected + authorizedCashIn − authorizedCashOut}. */
    public BigDecimal expectedCash() { return expectedCash; }

    /** The physical count, or {@code null} when none has been taken. Never coerced to zero. */
    public BigDecimal countedCash() { return countedCash; }

    /** When the count was taken, or {@code null} when there is none. */
    public LocalDateTime countedAt() { return countedAt; }

    public PosCashReconciliationStatus status() { return status; }

    public boolean isCounted() { return countedCash != null; }

    /** {@code countedCash − expectedCash}, or {@code null} when the drawer has not been counted. */
    public BigDecimal variance() {
        return countedCash == null ? null : countedCash.subtract(expectedCash);
    }

    /**
     * The reconciliation as a map, for the report payloads that already speak this shape.
     *
     * <p>Nulls are preserved rather than defaulted, so a consumer that renders "—" for an
     * uncounted drawer keeps being able to tell the difference.
     */
    public Map<String, Object> toMap() {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("openingFloat", openingFloat);
        map.put("cashTenderCollected", cashTenderCollected);
        map.put("authorizedCashIn", authorizedCashIn);
        map.put("authorizedCashOut", authorizedCashOut);
        map.put("expectedCash", expectedCash);
        map.put("countedCash", countedCash);
        map.put("countedAt", countedAt);
        map.put("variance", variance());
        map.put("status", status);
        return map;
    }
}
