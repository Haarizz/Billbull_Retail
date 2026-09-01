package com.billbull.backend.pos.session.denomination;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

/**
 * The denominations a drawer can physically hold, per currency. Server-owned and authoritative.
 *
 * <p>This replaces a frontend-only AED constant as the definition of what a cash count may
 * contain. While the ladder lived only in the browser, the server accepted whatever key the
 * client sent and multiplied it by whatever quantity came with it — so "counted cash" was
 * whatever arithmetic the page chose to perform, and a made-up denomination was indistinguishable
 * from a real one.
 *
 * <h3>Only currencies with a defined ladder are countable</h3>
 * There is deliberately no permissive fallback for an unknown currency. Accepting arbitrary
 * positive decimals would defeat the purpose: the ladder exists precisely to bound which values
 * are legal tender, and a fallback that accepts anything is not a ladder. A company configured
 * to a currency with no ladder here gets a clear configuration error at count time rather than a
 * silently unvalidated total.
 *
 * <p>AED is the only ladder defined, because it is the only one the codebase has ever contained.
 * Adding another is a business question — which denominations actually circulate — not something
 * that can be derived from code, so the remedy for an unsupported currency is to add its ladder
 * deliberately, not to loosen validation.
 */
public final class PosDenominationLadder {

    /** Largest first, matching how a drawer is counted and how the count screen renders. */
    private static final Map<String, PosDenominationLadder> BY_CURRENCY = new LinkedHashMap<>();

    static {
        // AED — notes then coins. Mirrors the ladder the POS has always presented.
        // 0.10 and 0.05 are rarely circulated but are legal tender; without them any drawer
        // total with a sub-0.25 tail is not physically countable and reports a permanent short.
        register(new PosDenominationLadder("AED", "UAE Dirham",
                List.of("1000", "500", "200", "100", "50", "20", "10", "5"),
                List.of("1", "0.50", "0.25", "0.10", "0.05")));
    }

    private static void register(PosDenominationLadder ladder) {
        BY_CURRENCY.put(ladder.currencyCode, ladder);
    }

    private final String currencyCode;
    private final String currencyName;
    private final List<String> noteKeys;
    private final List<String> coinKeys;
    /** Canonical key by numeric value, so "0.5" and "0.50" resolve to the same denomination. */
    private final Map<BigDecimal, String> byValue;

    private PosDenominationLadder(String currencyCode, String currencyName,
                                  List<String> noteKeys, List<String> coinKeys) {
        this.currencyCode = currencyCode;
        this.currencyName = currencyName;
        this.noteKeys = List.copyOf(noteKeys);
        this.coinKeys = List.copyOf(coinKeys);
        Map<BigDecimal, String> index = new LinkedHashMap<>();
        for (String key : noteKeys) index.put(new BigDecimal(key).stripTrailingZeros(), key);
        for (String key : coinKeys) index.put(new BigDecimal(key).stripTrailingZeros(), key);
        this.byValue = Map.copyOf(index);
    }

    /** The ladder for a currency, or empty when none is defined. */
    public static Optional<PosDenominationLadder> forCurrency(String currencyCode) {
        if (currencyCode == null || currencyCode.isBlank()) return Optional.empty();
        return Optional.ofNullable(BY_CURRENCY.get(currencyCode.trim().toUpperCase(Locale.ROOT)));
    }

    public static List<String> supportedCurrencies() {
        return List.copyOf(BY_CURRENCY.keySet());
    }

    public String currencyCode() { return currencyCode; }
    public String currencyName() { return currencyName; }
    public List<String> noteKeys() { return noteKeys; }
    public List<String> coinKeys() { return coinKeys; }

    /** Every denomination, notes then coins, largest first. */
    public List<String> allKeys() {
        List<String> all = new java.util.ArrayList<>(noteKeys.size() + coinKeys.size());
        all.addAll(noteKeys);
        all.addAll(coinKeys);
        return List.copyOf(all);
    }

    /**
     * The canonical key for a submitted denomination value, or empty when this currency has no
     * such denomination. Matching is by numeric value rather than string equality so a client
     * sending {@code "0.5"} or {@code "500.00"} is understood, while a value that is not legal
     * tender is still rejected.
     */
    public Optional<String> canonicalKey(BigDecimal value) {
        if (value == null) return Optional.empty();
        return Optional.ofNullable(byValue.get(value.stripTrailingZeros()));
    }

    /** The monetary value of a canonical key. */
    public BigDecimal valueOf(String canonicalKey) {
        return new BigDecimal(canonicalKey);
    }
}
