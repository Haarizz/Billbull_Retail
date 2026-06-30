package com.billbull.backend.pos.devicemanager;

import java.time.LocalDateTime;

/**
 * Published whenever a terminal's effective hardware configuration changes — today, only after
 * a successful {@link HardwareProfileAssignmentEngine#assign} (persist + device events + runtime
 * refresh all succeeded). This is the integration point named in the v2 spec for:
 * <ul>
 *   <li>the Local Device Agent — to know it should re-pull its assigned printer/scanner/drawer
 *       configuration rather than waiting for its next unrelated poll;</li>
 *   <li>the Device Dashboard (Phase F) — to refresh a terminal's displayed config without a
 *       manual reload;</li>
 *   <li>audit — a structured trail of "what changed and when," distinct from the per-device
 *       {@link PosDeviceEventLog} rows already written for the same assignment;</li>
 *   <li>future notification mechanisms (e.g. paging an operator if a terminal's config drifts).</li>
 * </ul>
 * No subscriber currently does any of the above — {@link PosConfigurationChangedEventListener}
 * is a deliberate stub (logs only) so the publish/subscribe wiring exists and is exercised
 * end-to-end, without building speculative integrations this phase doesn't need yet. A plain
 * POJO, not a {@code ApplicationEvent} subclass — Spring has supported arbitrary event objects
 * since 4.2, and a domain class with no framework coupling is easier to reuse/test.
 */
public class PosConfigurationChangedEvent {

    private final String terminalId;
    private final Long branchId;
    private final Long hardwareProfileId;
    private final int profileVersion;
    private final String reason;
    private final LocalDateTime occurredAt;

    public PosConfigurationChangedEvent(String terminalId, Long branchId, Long hardwareProfileId,
                                         int profileVersion, String reason) {
        this.terminalId = terminalId;
        this.branchId = branchId;
        this.hardwareProfileId = hardwareProfileId;
        this.profileVersion = profileVersion;
        this.reason = reason;
        this.occurredAt = LocalDateTime.now();
    }

    public String getTerminalId() { return terminalId; }
    public Long getBranchId() { return branchId; }
    public Long getHardwareProfileId() { return hardwareProfileId; }
    public int getProfileVersion() { return profileVersion; }
    public String getReason() { return reason; }
    public LocalDateTime getOccurredAt() { return occurredAt; }
}
