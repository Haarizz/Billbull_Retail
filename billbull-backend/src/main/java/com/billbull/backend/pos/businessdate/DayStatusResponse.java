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

    /** The Business Day window's live phase and boundaries — the authoritative
     *  source for every POS phase banner and every closure screen. Never null. */
    private BusinessDayInfo businessDay;

    private OperatingHoursInfo operatingHours;
    private int totalOpenSessions;
    private CurrentSessionInfo currentTerminalSession; // null if none
    private boolean blocked;
    private List<OpenSessionInfo> openSessions;
    /** Sessions still OPEN/SUSPENDED on a Business Day that has now closed — the
     *  operator must close these before trading can resume. Derived, never a stored
     *  flag, and their {@code tradingDate} is never mutated to reflect it. Empty
     *  whenever the Business Day is not closed. */
    private List<OpenSessionInfo> sessionsRequiringClosure = List.of();
    /** Set when THIS terminal's existing session belongs to a previous Business Day,
     *  i.e. "Continue Session" is refused by {@code BusinessDayContinuationGate}. Null
     *  whenever continuation is allowed. Purely a projection of the same gate the
     *  backend enforces with — the POS renders it, it never decides from it. */
    private PreviousBusinessDaySessionBlock previousBusinessDaySession;
    /**
     * True when the Business Day has closed, nothing is left in
     * {@code sessionsRequiringClosure}, and a Day Close is still outstanding for
     * that Trading Date or an earlier one — i.e. the operator's only remaining
     * step is the Day Close / Z-Report.
     *
     * <p>Exists so the POS can tell "sessions still need closure" apart from
     * "sessions are all closed but Day Close is still pending" without inferring
     * the latter from an empty session list. Derived here from the same
     * {@link PosPendingDayCloseResolver} answer that already backs
     * {@code pendingDayCloseDate} — the authoritative Day Close state, read off
     * {@code PosDayCloseRepository}, never from the absence of open sessions.
     * Mutually exclusive with a non-empty {@code sessionsRequiringClosure}.
     */
    private boolean dayCloseRequired;

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

    public BusinessDayInfo getBusinessDay() { return businessDay; }
    public void setBusinessDay(BusinessDayInfo businessDay) { this.businessDay = businessDay; }

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

    public PreviousBusinessDaySessionBlock getPreviousBusinessDaySession() { return previousBusinessDaySession; }
    public void setPreviousBusinessDaySession(PreviousBusinessDaySessionBlock previousBusinessDaySession) { this.previousBusinessDaySession = previousBusinessDaySession; }

    public boolean isContinuationBlocked() { return previousBusinessDaySession != null; }

    public List<OpenSessionInfo> getSessionsRequiringClosure() { return sessionsRequiringClosure; }
    public void setSessionsRequiringClosure(List<OpenSessionInfo> sessionsRequiringClosure) { this.sessionsRequiringClosure = sessionsRequiringClosure; }

    public boolean isDayCloseRequired() { return dayCloseRequired; }
    public void setDayCloseRequired(boolean dayCloseRequired) { this.dayCloseRequired = dayCloseRequired; }

    /**
     * The live Business Day window. Everything the POS needs to render any of its
     * phase states without doing date arithmetic of its own — the client must never
     * recompute a phase from the raw start/end times, because a client clock in a
     * different timezone from the configured Business Day timezone would then
     * disagree with the backend about when the day closed.
     */
    public static class BusinessDayInfo {
        /** ACTIVE | EXTENSION | CLOSED | UNRESTRICTED. */
        private String phase;
        /** The one authoritative Trading Date for this window. */
        private LocalDate tradingDate;
        private LocalDateTime windowStart;
        /** Scheduled End — ends normal operation, does NOT close the Business Day. */
        private LocalDateTime scheduledEnd;
        /** Actual closure: Scheduled End + the configured extension. */
        private LocalDateTime closureAt;
        private LocalDateTime nextWindowStart;
        /** Configured grace, in minutes, between Scheduled End and closure. */
        private int extensionMinutes;
        /** Whether closure actually blocks for this branch. */
        private boolean enforcementEnabled;
        /** True when the current extension came from a supervisor grant rather than
         *  the configured schedule — labelled differently in the UI. */
        /** Server-computed seconds until closure, so the client counts down from the
         *  Business Day clock rather than the browser's. Null when not applicable. */
        private Long secondsUntilClosure;
        /** Server-computed seconds until the next Business Day starts. */
        private Long secondsUntilNextStart;
        /** The server's current time in the Business Day timezone — lets the client
         *  detect and surface a badly-skewed local clock instead of silently
         *  rendering the wrong countdown. */
        private LocalDateTime serverTime;
        /** IANA id of the timezone every field above is expressed in. */
        private String timezone;

        public String getPhase() { return phase; }
        public void setPhase(String phase) { this.phase = phase; }
        public LocalDate getTradingDate() { return tradingDate; }
        public void setTradingDate(LocalDate tradingDate) { this.tradingDate = tradingDate; }
        public LocalDateTime getWindowStart() { return windowStart; }
        public void setWindowStart(LocalDateTime windowStart) { this.windowStart = windowStart; }
        public LocalDateTime getScheduledEnd() { return scheduledEnd; }
        public void setScheduledEnd(LocalDateTime scheduledEnd) { this.scheduledEnd = scheduledEnd; }
        public LocalDateTime getClosureAt() { return closureAt; }
        public void setClosureAt(LocalDateTime closureAt) { this.closureAt = closureAt; }
        public LocalDateTime getNextWindowStart() { return nextWindowStart; }
        public void setNextWindowStart(LocalDateTime nextWindowStart) { this.nextWindowStart = nextWindowStart; }
        public int getExtensionMinutes() { return extensionMinutes; }
        public void setExtensionMinutes(int extensionMinutes) { this.extensionMinutes = extensionMinutes; }
        public boolean isEnforcementEnabled() { return enforcementEnabled; }
        public void setEnforcementEnabled(boolean enforcementEnabled) { this.enforcementEnabled = enforcementEnabled; }
        public Long getSecondsUntilClosure() { return secondsUntilClosure; }
        public void setSecondsUntilClosure(Long secondsUntilClosure) { this.secondsUntilClosure = secondsUntilClosure; }
        public Long getSecondsUntilNextStart() { return secondsUntilNextStart; }
        public void setSecondsUntilNextStart(Long secondsUntilNextStart) { this.secondsUntilNextStart = secondsUntilNextStart; }
        public LocalDateTime getServerTime() { return serverTime; }
        public void setServerTime(LocalDateTime serverTime) { this.serverTime = serverTime; }
        public String getTimezone() { return timezone; }
        public void setTimezone(String timezone) { this.timezone = timezone; }
    }

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

    /** Why "Continue Session" is blocked on this terminal, with everything the
     *  "Previous Day Not Closed" modal needs to name the offending session. */
    public static class PreviousBusinessDaySessionBlock {
        private Long sessionId;
        private String terminalId;
        private String terminalName;
        private String status;
        private LocalDate businessDay;
        private LocalDate currentBusinessDay;
        /** The same text the backend throws on a blocked continuation attempt, so the
         *  proactive modal and the API refusal always read identically. */
        private String message;

        public PreviousBusinessDaySessionBlock() {}
        public PreviousBusinessDaySessionBlock(Long sessionId, String terminalId, String terminalName,
                                                String status, LocalDate businessDay,
                                                LocalDate currentBusinessDay, String message) {
            this.sessionId = sessionId;
            this.terminalId = terminalId;
            this.terminalName = terminalName;
            this.status = status;
            this.businessDay = businessDay;
            this.currentBusinessDay = currentBusinessDay;
            this.message = message;
        }

        public Long getSessionId() { return sessionId; }
        public void setSessionId(Long sessionId) { this.sessionId = sessionId; }
        public String getTerminalId() { return terminalId; }
        public void setTerminalId(String terminalId) { this.terminalId = terminalId; }
        public String getTerminalName() { return terminalName; }
        public void setTerminalName(String terminalName) { this.terminalName = terminalName; }
        public String getStatus() { return status; }
        public void setStatus(String status) { this.status = status; }
        public LocalDate getBusinessDay() { return businessDay; }
        public void setBusinessDay(LocalDate businessDay) { this.businessDay = businessDay; }
        public LocalDate getCurrentBusinessDay() { return currentBusinessDay; }
        public void setCurrentBusinessDay(LocalDate currentBusinessDay) { this.currentBusinessDay = currentBusinessDay; }
        public String getMessage() { return message; }
        public void setMessage(String message) { this.message = message; }
    }

    public static class OpenSessionInfo {
        private Long sessionId;
        private String terminalId;
        private String terminalName;
        private String counterName;
        private String openedBy;
        private LocalDateTime openedAt;
        /** OPEN | SUSPENDED — the session's own status, so the client can drive the
         *  right closure action from backend state instead of assuming OPEN. */
        private String status;

        public OpenSessionInfo() {}
        public OpenSessionInfo(Long sessionId, String terminalId, String terminalName,
                                String counterName, String openedBy, LocalDateTime openedAt) {
            this(sessionId, terminalId, terminalName, counterName, openedBy, openedAt, null);
        }
        public OpenSessionInfo(Long sessionId, String terminalId, String terminalName,
                                String counterName, String openedBy, LocalDateTime openedAt,
                                String status) {
            this.sessionId = sessionId;
            this.terminalId = terminalId;
            this.terminalName = terminalName;
            this.counterName = counterName;
            this.openedBy = openedBy;
            this.openedAt = openedAt;
            this.status = status;
        }

        public String getStatus() { return status; }
        public void setStatus(String status) { this.status = status; }

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
