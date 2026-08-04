package com.billbull.backend.pos.businessdate;

import com.billbull.backend.pos.settings.PosSettings;

import java.time.LocalTime;

/**
 * Immutable snapshot of the Business Day window configuration a branch is running
 * under — decouples {@link BusinessDayResolver} (a pure function) from the JPA
 * {@link PosSettings} entity so the resolver never needs repository/persistence
 * access. Mirrors the same three fields {@code PosOperatingHoursCalculator}'s
 * caller already reads off {@code PosSettings} (see {@code PosDayStatusService}),
 * just packaged as a value object instead of read inline at each call site.
 *
 * <p>Phase 1 only — this type exists so {@code BusinessDayResolver} has a stable
 * input shape; nothing in production code constructs or consumes it yet.
 */
public final class BusinessDaySettings {

    private final boolean enabled;
    private final LocalTime startTime;
    private final LocalTime endTime;

    public BusinessDaySettings(boolean enabled, LocalTime startTime, LocalTime endTime) {
        this.enabled = enabled;
        this.startTime = startTime;
        this.endTime = endTime;
    }

    /** Disabled/unconfigured window — {@link BusinessDayResolver} treats this as
     *  "no window," resolving purely from the calendar date of the timestamp. */
    public static BusinessDaySettings disabled() {
        return new BusinessDaySettings(false, null, null);
    }

    public static BusinessDaySettings from(PosSettings settings) {
        if (settings == null) return disabled();
        return new BusinessDaySettings(
                Boolean.TRUE.equals(settings.getOperatingHoursEnabled()),
                settings.getOperatingStartTime(),
                settings.getOperatingEndTime());
    }

    public boolean isEnabled() { return enabled; }
    public LocalTime getStartTime() { return startTime; }
    public LocalTime getEndTime() { return endTime; }

    /** Whether this configuration actually describes a usable window — enabled
     *  and both boundaries present. Matches the null-guard every existing
     *  operating-hours caller already applies (see {@code PosDayStatusService}). */
    public boolean isConfigured() {
        return enabled && startTime != null && endTime != null;
    }
}
