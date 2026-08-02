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
