package com.billbull.backend.pos.session.denomination;

import java.math.BigDecimal;
import java.util.Map;

/**
 * A validated physical cash count.
 *
 * <p>Produced only by {@link PosDenominationCountService}, which is the sole place the total is
 * derived. The two fields are guaranteed consistent by construction: {@code countedCash} is
 * {@code Σ(denomination × quantity)} over exactly the {@code denominations} carried here, in the
 * stated currency. Nothing else may compute one from the other, and no caller may substitute a
 * total of its own.
 */
public final class PosDenominationCount {

    private final Map<String, Integer> denominations;
    private final BigDecimal countedCash;
    private final String currencyCode;

    PosDenominationCount(Map<String, Integer> denominations, BigDecimal countedCash, String currencyCode) {
        this.denominations = Map.copyOf(denominations);
        this.countedCash = countedCash;
        this.currencyCode = currencyCode;
    }

    /** Canonical ladder keys to quantities. Omitted denominations are absent, not zero-padded. */
    public Map<String, Integer> denominations() { return denominations; }

    /** {@code Σ(denomination × quantity)}, scale 2. Zero for a genuine all-zero count. */
    public BigDecimal countedCash() { return countedCash; }

    /** The currency the count was validated against. */
    public String currencyCode() { return currencyCode; }
}
