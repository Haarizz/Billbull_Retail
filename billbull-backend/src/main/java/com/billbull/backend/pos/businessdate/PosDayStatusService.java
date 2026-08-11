package com.billbull.backend.pos.businessdate;

import com.billbull.backend.pos.session.PosSession;
import com.billbull.backend.pos.session.PosSessionRepository;
import com.billbull.backend.pos.session.PosSessionResolutionStrategy;
import com.billbull.backend.pos.session.PosSessionStatus;
import com.billbull.backend.pos.settings.PosSettings;
import com.billbull.backend.pos.settings.PosSettingsRepository;
import com.billbull.backend.pos.terminal.PosTerminal;
import com.billbull.backend.pos.terminal.PosTerminalRepository;
import com.billbull.backend.settings.branch.Branch;
import com.billbull.backend.settings.branch.BranchAccessService;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Optional;

/**
 * Backend façade for {@code GET /api/pos/sessions/day-status} — the only place that
 * composes business-date, session, settings, and operating-hours data into one
 * response. Pure composition: holds no persistence logic of its own, just assembles
 * data already owned by {@link PosBusinessDateService}, {@link PosSessionRepository},
 * {@link PosSettingsRepository}, and {@link PosOperatingHoursCalculator}.
 *
 * <p>Deliberately keeps its original Business Date behavior (the POS's operating
 * "what day is it" state, {@link PosBusinessDateService}) unchanged, and only
 * additively enriches the response with the session-driven "which trading day still
 * needs a Z-Report" answer from {@link PosPendingDayCloseResolver} — the two are
 * different questions and must not be merged. See that resolver's javadoc.
 *
 * <p><b>Phase 2 (Business Day Engine, shadow mode):</b> also additively computes
 * the new engine's Candidate/Active Business Day via {@link BusinessDayResolver}
 * and {@link BusinessDayStateService}, purely for observation — see
 * {@code docs/business-day-architecture.md}. {@code currentBusinessDate}/
 * {@code businessDateStatus}/{@code blocked} remain 100% driven by
 * {@link PosBusinessDateService}, exactly as before this phase.
 */
@Service
public class PosDayStatusService {

    private final PosBusinessDateService businessDateService;
    private final PosPendingDayCloseResolver pendingDayCloseResolver;
    private final BusinessDayStateService businessDayStateService;
    private final BusinessDayWindowService businessDayWindowService;
    private final PosSessionRepository sessionRepository;
    private final PosSessionResolutionStrategy sessionResolutionStrategy;
    private final PosSettingsRepository settingsRepository;
    private final PosTerminalRepository terminalRepository;
    private final BranchAccessService branchAccessService;
    private final BusinessDayContinuationGate businessDayContinuationGate;

    public PosDayStatusService(PosBusinessDateService businessDateService,
                                PosPendingDayCloseResolver pendingDayCloseResolver,
                                BusinessDayStateService businessDayStateService,
                                BusinessDayWindowService businessDayWindowService,
                                PosSessionRepository sessionRepository,
                                PosSessionResolutionStrategy sessionResolutionStrategy,
                                PosSettingsRepository settingsRepository,
                                PosTerminalRepository terminalRepository,
                                BranchAccessService branchAccessService,
                                BusinessDayContinuationGate businessDayContinuationGate) {
        this.businessDateService = businessDateService;
        this.pendingDayCloseResolver = pendingDayCloseResolver;
        this.businessDayStateService = businessDayStateService;
        this.businessDayWindowService = businessDayWindowService;
        this.sessionRepository = sessionRepository;
        this.sessionResolutionStrategy = sessionResolutionStrategy;
        this.settingsRepository = settingsRepository;
        this.terminalRepository = terminalRepository;
        this.branchAccessService = branchAccessService;
        this.businessDayContinuationGate = businessDayContinuationGate;
    }

    private String currentUser() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return auth != null ? auth.getName() : "system";
    }

    @Transactional
    public DayStatusResponse getDayStatus(String terminalId) {
        Branch branch = branchAccessService.getRequiredCurrentUserBranch();
        Long branchId = branch.getId();

        LocalDate businessDate = businessDateService.getCurrentBusinessDate(branchId);
        boolean dateClosed = businessDateService.isDateClosed(branchId, businessDate);
        // Additive only: the session-driven "which trading day still needs a Z-Report"
        // answer, kept separate from the operating Business Date above.
        Optional<LocalDate> pendingDayClose = pendingDayCloseResolver.resolvePendingBusinessDate(branchId);

        PosSettings settings = settingsRepository.findByBranchId(branchId).orElse(new PosSettings());
        boolean hoursEnabled = Boolean.TRUE.equals(settings.getOperatingHoursEnabled())
                && settings.getOperatingStartTime() != null && settings.getOperatingEndTime() != null;
        // The legacy advisory flag, kept for backward compatibility — but now read
        // off the Business Day clock rather than the host's default timezone, so it
        // cannot contradict the phase reported alongside it in the same response.
        LocalTime nowLocalTime = businessDayWindowService.clock().now().toLocalTime();
        boolean withinHours = !hoursEnabled || PosOperatingHoursCalculator.isWithinOperatingHours(
                settings.getOperatingStartTime(), settings.getOperatingEndTime(), nowLocalTime);

        // ── Business Day window state ────────────────────────────────────────────
        // Resolved from the one authoritative service, against the Business Day
        // clock — never LocalDateTime.now(). This is what every POS phase banner and
        // closure screen renders from; the legacy fields above are left untouched.
        BusinessDayState businessDayState = businessDayWindowService.resolveAt(branchId, settings);
        BusinessDaySettings businessDaySettings = BusinessDaySettings.from(settings);
        LocalDate candidateBusinessDay = businessDayState.window().tradingDate();
        Optional<LocalDate> activeBusinessDay = businessDayStateService.findUnclosedBusinessDay(branchId);
        boolean overnightWindowConfigured = businessDaySettings.isConfigured()
                && PosOperatingHoursCalculator.isOvernightWindow(businessDaySettings.getStartTime(), businessDaySettings.getEndTime());
        businessDayStateService.recordShadowValidation(branchId, businessDate, candidateBusinessDay, overnightWindowConfigured);
        if (activeBusinessDay.isEmpty()) {
            businessDayStateService.recordNoActiveBusinessDay(branchId);
        }

        // Reuses the same stale-session lookup openSession() already relies on — one
        // query, two callers, not a second implementation of "is there a stale session."
        List<PosSession> staleSessions = sessionRepository.findUnclosedSessionsBeforeDate(branchId, businessDate);
        int totalOpenSessions = sessionRepository.findOpenSessionsByBranchAndDate(branchId, businessDate).size();

        DayStatusResponse.CurrentSessionInfo currentSessionInfo = null;
        DayStatusResponse.PreviousBusinessDaySessionBlock continuationBlock = null;
        if (terminalId != null && !terminalId.isBlank()) {
            Optional<PosSession> active = sessionResolutionStrategy.resolveByTerminal(branchId, terminalId);
            if (active.isPresent()) {
                PosSession s = active.get();
                currentSessionInfo = new DayStatusResponse.CurrentSessionInfo(
                        s.getId(), s.getStatus().name(), s.getOpenedBy());
                // Projection of the enforcing gate, never a second copy of the rule: if
                // BusinessDayContinuationGate would refuse "Continue Session" for this
                // session, say so here too so the POS can raise its existing "Previous
                // Day Not Closed" flow at mount rather than only on the refused call.
                continuationBlock = businessDayContinuationGate.evaluate(s)
                        .map(sessionBusinessDay -> new DayStatusResponse.PreviousBusinessDaySessionBlock(
                                s.getId(), s.getTerminalId(), resolveTerminalName(s.getTerminalId()),
                                s.getStatus().name(), sessionBusinessDay, candidateBusinessDay,
                                PreviousBusinessDaySessionException.buildMessage(
                                        s.getId(), s.getTerminalId(), s.getStatus().name(), sessionBusinessDay)))
                        .orElse(null);
            }
        }

        String caller = currentUser();
        boolean callerOwnsAStaleSession = staleSessions.stream()
                .anyMatch(s -> caller.equals(s.getOpenedBy()));
        boolean blocked = hoursEnabled && !withinHours && !staleSessions.isEmpty() && !callerOwnsAStaleSession;

        List<DayStatusResponse.OpenSessionInfo> openSessionInfos = staleSessions.stream()
                .map(s -> new DayStatusResponse.OpenSessionInfo(
                        s.getId(),
                        s.getTerminalId(),
                        resolveTerminalName(s.getTerminalId()),
                        s.getCounterName(),
                        s.getOpenedBy(),
                        s.getOpenedAt()))
                .toList();

        DayStatusResponse response = new DayStatusResponse();
        response.setBranchId(branchId);
        response.setCurrentBusinessDate(businessDate);
        response.setBusinessDateStatus(dateClosed ? "CLOSED" : "OPEN");
        response.setPendingDayCloseDate(pendingDayClose.orElse(null));
        response.setHasPendingDayClose(pendingDayClose.isPresent());
        response.setCandidateBusinessDay(candidateBusinessDay);
        response.setActiveBusinessDay(activeBusinessDay.orElse(null));
        response.setHasActiveBusinessDay(activeBusinessDay.isPresent());
        response.setBusinessDaySource("LEGACY_POINTER");
        response.setBusinessDay(buildBusinessDayInfo(businessDayState, businessDaySettings));
        response.setSessionsRequiringClosure(resolveSessionsRequiringClosure(branchId, businessDayState));
        response.setOperatingHours(new DayStatusResponse.OperatingHoursInfo(
                hoursEnabled,
                settings.getOperatingStartTime() != null ? settings.getOperatingStartTime().toString() : null,
                settings.getOperatingEndTime() != null ? settings.getOperatingEndTime().toString() : null,
                withinHours));
        response.setTotalOpenSessions(totalOpenSessions);
        response.setCurrentTerminalSession(currentSessionInfo);
        response.setPreviousBusinessDaySession(continuationBlock);
        response.setBlocked(blocked);
        response.setOpenSessions(openSessionInfos);
        return response;
    }

    /** Projects the resolved {@link BusinessDayState} onto the wire DTO. All
     *  countdowns are computed server-side from the Business Day clock so a POS
     *  terminal whose local clock or timezone differs cannot render a phase or a
     *  remaining time that disagrees with what the backend will enforce. */
    private DayStatusResponse.BusinessDayInfo buildBusinessDayInfo(BusinessDayState state,
                                                                   BusinessDaySettings settings) {
        BusinessDayWindow window = state.window();
        DayStatusResponse.BusinessDayInfo info = new DayStatusResponse.BusinessDayInfo();
        info.setPhase(window.phase().name());
        info.setTradingDate(window.tradingDate());
        info.setWindowStart(window.windowStart());
        info.setScheduledEnd(window.scheduledEnd());
        info.setClosureAt(window.closureAt());
        info.setNextWindowStart(window.nextWindowStart());
        info.setExtensionMinutes(settings.getExtensionMinutes());
        info.setEnforcementEnabled(state.enforcementEnabled());

        Duration untilClosure = window.remainingUntilClosure(state.now());
        info.setSecondsUntilClosure(untilClosure != null ? untilClosure.toSeconds() : null);
        Duration untilNextStart = window.remainingUntilNextStart(state.now());
        info.setSecondsUntilNextStart(untilNextStart != null ? untilNextStart.toSeconds() : null);

        info.setServerTime(state.now());
        info.setTimezone(businessDayWindowService.clock().zone().getId());
        return info;
    }

    /**
     * Sessions that are still OPEN/SUSPENDED on a Business Day that has now closed.
     *
     * <p>Purely derived — nothing is written, and in particular no session's
     * {@code tradingDate} is touched: a session opened on the Business Day that just
     * closed belongs to that Business Day permanently, and moving it to the next one
     * would silently relocate its sales in Day Close and the Z-Report. The POS uses
     * this list to drive the operator toward closing them.
     *
     * <p>Empty unless the Business Day is actually closed, so this costs one extra
     * query only during the closed phase, never during normal trading.
     */
    private List<DayStatusResponse.OpenSessionInfo> resolveSessionsRequiringClosure(Long branchId,
                                                                                     BusinessDayState state) {
        if (!state.blocksNormalOperation()) return List.of();
        return sessionRepository
                .findByBranchIdAndTradingDateOrderByOpenedAtDesc(branchId, state.window().tradingDate())
                .stream()
                .filter(s -> s.getStatus() == PosSessionStatus.OPEN || s.getStatus() == PosSessionStatus.SUSPENDED)
                .map(s -> new DayStatusResponse.OpenSessionInfo(
                        s.getId(), s.getTerminalId(), resolveTerminalName(s.getTerminalId()),
                        s.getCounterName(), s.getOpenedBy(), s.getOpenedAt()))
                .toList();
    }

    private String resolveTerminalName(String terminalId) {
        if (terminalId == null || terminalId.isBlank()) return null;
        return terminalRepository.findByTerminalId(terminalId).map(PosTerminal::getTerminalName).orElse(null);
    }
}
