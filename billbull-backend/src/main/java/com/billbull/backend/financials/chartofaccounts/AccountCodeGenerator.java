package com.billbull.backend.financials.chartofaccounts;

import java.util.Collection;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Single source of truth for allocating the next free Chart of Accounts code.
 *
 * <p>Two rules, in order:
 * <ol>
 *   <li><b>Parent-derived</b> — when a parent account is given, children are numbered inside the
 *       parent's own hundred-block (parent {@code 6000} → {@code 6001..6099}, parent {@code 1050} →
 *       {@code 1051..1099}). This keeps the code aligned with the tree position, which the seeded
 *       COA already assumes (6001-6099 under 6000, 4101+ under 4100).</li>
 *   <li><b>Group bands</b> — no parent (or the parent block is exhausted) falls back to the bands
 *       the seeded COA actually occupies. Note these are <i>not</i> one 1000-wide band per group:
 *       Expenses also owns 6000-6999 and 7500-7999, Income also owns 7000-7499.</li>
 * </ol>
 *
 * <p>Allocation always scans for the <b>first free</b> code in a band rather than {@code max + 1},
 * so a code sitting at the top of a band (e.g. the seeded {@code 5999 Rounding Adjustment}) can
 * never push the next allocation out of the band and onto an existing account.
 */
public final class AccountCodeGenerator {

    /** A contiguous, inclusive range of numeric account codes. */
    public record CodeBand(int min, int max) {}

    /** Bands owned by each account group, in allocation preference order. */
    private static List<CodeBand> bandsForGroup(String accountGroup) {
        String group = accountGroup == null ? "" : accountGroup.trim().toLowerCase(Locale.ROOT);
        return switch (group) {
            case "assets", "asset"           -> List.of(new CodeBand(1000, 1999));
            case "liabilities", "liability"  -> List.of(new CodeBand(2000, 2999));
            case "equity"                    -> List.of(new CodeBand(3000, 3999));
            case "income", "revenue"         -> List.of(new CodeBand(4000, 4999), new CodeBand(7000, 7499));
            case "expenses", "expense"       -> List.of(new CodeBand(5000, 5999),
                                                        new CodeBand(6000, 6999),
                                                        new CodeBand(7500, 7999));
            // Unknown/custom groups get a dedicated band so they can never collide with the standard COA.
            default                          -> List.of(new CodeBand(9000, 9999));
        };
    }

    /**
     * The hundred-block a child of {@code parentCode} belongs in — e.g. 6000 → 6001..6099,
     * 1050 → 1051..1099. Returns {@code null} when the parent code is not a plain number.
     */
    static CodeBand childBandFor(String parentCode) {
        Integer parent = parseCode(parentCode);
        if (parent == null) return null;
        int blockStart = (parent / 100) * 100;
        // Start above the parent itself so a parent sitting mid-block (1050) never re-issues its own code.
        return new CodeBand(Math.max(blockStart, parent) + 1, blockStart + 99);
    }

    /**
     * Allocates the first free code for a new account.
     *
     * @param parentCode      selected parent account code, may be {@code null}/blank
     * @param accountGroup    root group name ("Assets", "Expenses", …)
     * @param existingCodes   every code already present in the COA (any format; non-numeric ignored)
     * @return the allocated code, or {@code null} if every candidate band is full
     */
    public static String nextCode(String parentCode, String accountGroup, Collection<String> existingCodes) {
        Set<Integer> used = existingCodes.stream()
                .map(AccountCodeGenerator::parseCode)
                .filter(java.util.Objects::nonNull)
                .collect(Collectors.toSet());

        CodeBand parentBand = childBandFor(parentCode);
        if (parentBand != null) {
            Integer allocated = firstFree(parentBand, used);
            if (allocated != null) return String.valueOf(allocated);
        }

        for (CodeBand band : bandsForGroup(accountGroup)) {
            // Skip the band root itself (5000, 6000, …) — those are the group/header accounts.
            Integer allocated = firstFree(new CodeBand(band.min() + 1, band.max()), used);
            if (allocated != null) return String.valueOf(allocated);
        }

        return null;
    }

    private static Integer firstFree(CodeBand band, Set<Integer> used) {
        for (int candidate = band.min(); candidate <= band.max(); candidate++) {
            if (!used.contains(candidate)) return candidate;
        }
        return null;
    }

    /** Parses a plain numeric code; returns {@code null} for blank or non-numeric codes. */
    private static Integer parseCode(String code) {
        if (code == null) return null;
        String trimmed = code.trim();
        if (trimmed.isEmpty()) return null;
        try {
            return Integer.valueOf(trimmed);
        } catch (NumberFormatException ex) {
            return null;
        }
    }

    private AccountCodeGenerator() {}
}
