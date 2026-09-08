package com.billbull.backend.pos.terminal;

import com.billbull.backend.pos.settings.PosSettings;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Single source for "how many terminals may this branch hold".
 *
 * <p>Normally the answer is the per-branch {@code pos_settings.max_terminals_per_branch} row
 * (entity default 5). A tenant can lift the cap for every one of its branches at once by setting
 * {@code pos.terminal.max-per-branch-override} in its {@code application-{client}.properties} —
 * that is a deployment-level entitlement, not something a branch admin edits, so it wins over the
 * stored row instead of being merged into it. The property is unset by default, so tenants that do
 * not declare it keep the stored per-branch behaviour untouched.
 *
 * <p>The override is capped at {@link #MAX_SUPPORTED} because generated terminal IDs are formatted
 * {@code T%03d-XXXX} — a four-digit sequence would break that fixed-width ID shape, so 999 is the
 * real "unlimited" for this system rather than {@code Integer.MAX_VALUE}.
 */
@Component
public class PosTerminalLimitPolicy {

    /** Highest limit the T%03d terminal-ID format can represent. */
    public static final int MAX_SUPPORTED = 999;

    /** Fallback when a branch has no settings row and no tenant override. */
    public static final int DEFAULT_LIMIT = 5;

    private final Integer override;

    public PosTerminalLimitPolicy(
            @Value("${pos.terminal.max-per-branch-override:}") String configuredOverride) {
        Integer parsed = null;
        if (configuredOverride != null && !configuredOverride.isBlank()) {
            parsed = Math.min(MAX_SUPPORTED, Math.max(1, Integer.parseInt(configuredOverride.trim())));
        }
        this.override = parsed;
    }

    /** @return the tenant-wide override, or {@code null} when this tenant has not declared one. */
    public Integer getOverride() {
        return override;
    }

    /** Effective terminal cap for a branch, given its (possibly null/absent) stored settings. */
    public int resolveLimit(PosSettings settings) {
        if (override != null) return override;
        if (settings != null && settings.getMaxTerminalsPerBranch() != null) {
            return settings.getMaxTerminalsPerBranch();
        }
        return DEFAULT_LIMIT;
    }
}
