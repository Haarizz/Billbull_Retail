package com.billbull.backend.pos.businessdate;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/** Response DTO for {@code GET /api/pos/sessions/day-status} — a single composed view
 *  of business date, operating hours, and open-session state for a branch/terminal. */
public class DayStatusResponse {

    private Long branchId;
    private LocalDate currentBusinessDate;
    private String businessDateStatus; // "OPEN" | "CLOSED" — derived live, never stored
    /** Business date of the earliest unclosed POS session — the next Day Close due,
     *  per {@link PosPendingDayCloseResolver}. Null when there is nothing pending. */
    private LocalDate pendingDayCloseDate;
    private boolean hasPendingDayClose;

    // ---------------------------------------------------------------------
    // Phase 2 — Business Day Engine, read-only/informational only. None of these
    // fields drive `blocked`, session opening, or any other decision in this
    // response; they exist purely so the new engine's output can be observed
    // against live traffic. currentBusinessDate/businessDateStatus/blocked above
    // remain fully legacy-pointer-driven — see businessDaySource.
    // ---------------------------------------------------------------------

    /** What {@code BusinessDayResolver.resolve(now, settings)} computes right now —
     *  a proposal only, never persisted, never activated by this endpoint. */
    private LocalDate candidateBusinessDay;
    /** What {@code BusinessDayStateService} reports as the branch's Active Business
     *  Day (oldest unclosed session date), or null for No Active Business Day. */
    private LocalDate activeBusinessDay;
    private boolean hasActiveBusinessDay;
    /** Always {@code "LEGACY_POINTER"} in Phase 2 — documents that
     *  currentBusinessDate/businessDateStatus/blocked are still fully controlled
     *  by {@code PosBusinessDateService}, not the new engine. Will change once a
     *  later phase actually switches control. */
    private String businessDaySource;

    private OperatingHoursInfo operatingHours;
    private int totalOpenSessions;
    private CurrentSessionInfo currentTerminalSession; // null if none
    private boolean blocked;
    private List<OpenSessionInfo> openSessions;

    public Long getBranchId() { return branchId; }
    public void setBranchId(Long branchId) { this.branchId = branchId; }

    public LocalDate getCurrentBusinessDate() { return currentBusinessDate; }
    public void setCurrentBusinessDate(LocalDate currentBusinessDate) { this.currentBusinessDate = currentBusinessDate; }

    public String getBusinessDateStatus() { return businessDateStatus; }
    public void setBusinessDateStatus(String businessDateStatus) { this.businessDateStatus = businessDateStatus; }

    public LocalDate getPendingDayCloseDate() { return pendingDayCloseDate; }
    public void setPendingDayCloseDate(LocalDate pendingDayCloseDate) { this.pendingDayCloseDate = pendingDayCloseDate; }

    public boolean isHasPendingDayClose() { return hasPendingDayClose; }
    public void setHasPendingDayClose(boolean hasPendingDayClose) { this.hasPendingDayClose = hasPendingDayClose; }

    public LocalDate getCandidateBusinessDay() { return candidateBusinessDay; }
    public void setCandidateBusinessDay(LocalDate candidateBusinessDay) { this.candidateBusinessDay = candidateBusinessDay; }

    public LocalDate getActiveBusinessDay() { return activeBusinessDay; }
    public void setActiveBusinessDay(LocalDate activeBusinessDay) { this.activeBusinessDay = activeBusinessDay; }

    public boolean isHasActiveBusinessDay() { return hasActiveBusinessDay; }
    public void setHasActiveBusinessDay(boolean hasActiveBusinessDay) { this.hasActiveBusinessDay = hasActiveBusinessDay; }

    public String getBusinessDaySource() { return businessDaySource; }
    public void setBusinessDaySource(String businessDaySource) { this.businessDaySource = businessDaySource; }

    public OperatingHoursInfo getOperatingHours() { return operatingHours; }
    public void setOperatingHours(OperatingHoursInfo operatingHours) { this.operatingHours = operatingHours; }

    public int getTotalOpenSessions() { return totalOpenSessions; }
    public void setTotalOpenSessions(int totalOpenSessions) { this.totalOpenSessions = totalOpenSessions; }

    public CurrentSessionInfo getCurrentTerminalSession() { return currentTerminalSession; }
    public void setCurrentTerminalSession(CurrentSessionInfo currentTerminalSession) { this.currentTerminalSession = currentTerminalSession; }

    public boolean isBlocked() { return blocked; }
    public void setBlocked(boolean blocked) { this.blocked = blocked; }

    public List<OpenSessionInfo> getOpenSessions() { return openSessions; }
    public void setOpenSessions(List<OpenSessionInfo> openSessions) { this.openSessions = openSessions; }

    public static class OperatingHoursInfo {
        private boolean enabled;
        private String start;
        private String end;
        private boolean withinHours;

        public OperatingHoursInfo() {}
        public OperatingHoursInfo(boolean enabled, String start, String end, boolean withinHours) {
            this.enabled = enabled;
            this.start = start;
            this.end = end;
            this.withinHours = withinHours;
        }

        public boolean isEnabled() { return enabled; }
        public void setEnabled(boolean enabled) { this.enabled = enabled; }
        public String getStart() { return start; }
        public void setStart(String start) { this.start = start; }
        public String getEnd() { return end; }
        public void setEnd(String end) { this.end = end; }
        public boolean isWithinHours() { return withinHours; }
        public void setWithinHours(boolean withinHours) { this.withinHours = withinHours; }
    }

    public static class CurrentSessionInfo {
        private Long sessionId;
        private String status;
        private String openedBy;

        public CurrentSessionInfo() {}
        public CurrentSessionInfo(Long sessionId, String status, String openedBy) {
            this.sessionId = sessionId;
            this.status = status;
            this.openedBy = openedBy;
        }

        public Long getSessionId() { return sessionId; }
        public void setSessionId(Long sessionId) { this.sessionId = sessionId; }
        public String getStatus() { return status; }
        public void setStatus(String status) { this.status = status; }
        public String getOpenedBy() { return openedBy; }
        public void setOpenedBy(String openedBy) { this.openedBy = openedBy; }
    }

    public static class OpenSessionInfo {
        private Long sessionId;
        private String terminalId;
        private String terminalName;
        private String counterName;
        private String openedBy;
        private LocalDateTime openedAt;

        public OpenSessionInfo() {}
        public OpenSessionInfo(Long sessionId, String terminalId, String terminalName,
                                String counterName, String openedBy, LocalDateTime openedAt) {
            this.sessionId = sessionId;
            this.terminalId = terminalId;
            this.terminalName = terminalName;
            this.counterName = counterName;
            this.openedBy = openedBy;
            this.openedAt = openedAt;
        }

        public Long getSessionId() { return sessionId; }
        public void setSessionId(Long sessionId) { this.sessionId = sessionId; }
        public String getTerminalId() { return terminalId; }
        public void setTerminalId(String terminalId) { this.terminalId = terminalId; }
        public String getTerminalName() { return terminalName; }
        public void setTerminalName(String terminalName) { this.terminalName = terminalName; }
        public String getCounterName() { return counterName; }
        public void setCounterName(String counterName) { this.counterName = counterName; }
        public String getOpenedBy() { return openedBy; }
        public void setOpenedBy(String openedBy) { this.openedBy = openedBy; }
        public LocalDateTime getOpenedAt() { return openedAt; }
        public void setOpenedAt(LocalDateTime openedAt) { this.openedAt = openedAt; }
    }
}
