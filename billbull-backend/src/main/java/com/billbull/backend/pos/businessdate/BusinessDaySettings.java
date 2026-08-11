package com.billbull.backend.pos.businessdate;

import com.billbull.backend.pos.settings.PosSettings;

import java.time.LocalTime;

/**
 * Immutable snapshot of the Business Day window configuration a branch is running
 * under — decouples the pure window math ({@link PosOperatingHoursCalculator#resolveWindow},
 * {@link BusinessDayResolver}) from the JPA {@link PosSettings} entity so neither
 * ever needs repository/persistence access.
 *
 * <p>Carries the three scheduled concepts the Business Day distinguishes: the start
 * time, the <b>Scheduled End Time</b> (which ends normal operation but does
 * <i>not</i> close the Business Day), and the <b>extension</b> that runs from the
 * Scheduled End Time to actual closure.
 */
public final class BusinessDaySettings {

    private final boolean enabled;
    private final LocalTime startTime;
    private final LocalTime endTime;
    private final int extensionMinutes;

    public BusinessDaySettings(boolean enabled, LocalTime startTime, LocalTime endTime, int extensionMinutes) {
        this.enabled = enabled;
        this.startTime = startTime;
        this.endTime = endTime;
        // Negative/absent extension is normalized to zero — "closes exactly at the
        // Scheduled End Time" — rather than rejected here, so a bad stored value can
        // never make a pure function throw mid-decision. Validation happens at save
        // time (PosSettingsService), which is where a user can act on the error.
        this.extensionMinutes = Math.max(0, extensionMinutes);
    }

    /** Convenience for a window with no extension — closure coincides with the
     *  Scheduled End Time. */
    public BusinessDaySettings(boolean enabled, LocalTime startTime, LocalTime endTime) {
        this(enabled, startTime, endTime, 0);
    }

    /** Disabled/unconfigured window — resolves to plain calendar dates and never
     *  blocks anything. */
    public static BusinessDaySettings disabled() {
        return new BusinessDaySettings(false, null, null, 0);
    }

    public static BusinessDaySettings from(PosSettings settings) {
        if (settings == null) return disabled();
        Integer extension = settings.getBusinessDayExtensionMinutes();
        return new BusinessDaySettings(
                Boolean.TRUE.equals(settings.getOperatingHoursEnabled()),
                settings.getOperatingStartTime(),
                settings.getOperatingEndTime(),
                extension != null ? extension : 0);
    }

    public boolean isEnabled() { return enabled; }
    public LocalTime getStartTime() { return startTime; }
    public LocalTime getEndTime() { return endTime; }

    /** Minutes of grace between the Scheduled End Time and actual closure. Zero
     *  means the Business Day closes the instant the Scheduled End Time is reached. */
    public int getExtensionMinutes() { return extensionMinutes; }

    /** Whether this configuration actually describes a usable window — enabled and
     *  both boundaries present. */
    public boolean isConfigured() {
        return enabled && startTime != null && endTime != null;
    }
}
