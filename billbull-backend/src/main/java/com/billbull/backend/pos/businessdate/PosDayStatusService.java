package com.billbull.backend.pos.businessdate;

import com.billbull.backend.pos.session.PosSession;
import com.billbull.backend.pos.session.PosSessionRepository;
import com.billbull.backend.pos.session.PosSessionResolutionStrategy;
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

import java.time.LocalDate;
import java.time.LocalDateTime;
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
    private final PosSessionRepository sessionRepository;
    private final PosSessionResolutionStrategy sessionResolutionStrategy;
    private final PosSettingsRepository settingsRepository;
    private final PosTerminalRepository terminalRepository;
    private final BranchAccessService branchAccessService;

    public PosDayStatusService(PosBusinessDateService businessDateService,
                                PosPendingDayCloseResolver pendingDayCloseResolver,
                                BusinessDayStateService businessDayStateService,
                                PosSessionRepository sessionRepository,
                                PosSessionResolutionStrategy sessionResolutionStrategy,
                                PosSettingsRepository settingsRepository,
                                PosTerminalRepository terminalRepository,
                                BranchAccessService branchAccessService) {
        this.businessDateService = businessDateService;
        this.pendingDayCloseResolver = pendingDayCloseResolver;
        this.businessDayStateService = businessDayStateService;
        this.sessionRepository = sessionRepository;
        this.sessionResolutionStrategy = sessionResolutionStrategy;
        this.settingsRepository = settingsRepository;
        this.terminalRepository = terminalRepository;
        this.branchAccessService = branchAccessService;
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
        boolean withinHours = !hoursEnabled || PosOperatingHoursCalculator.isWithinOperatingHours(
                settings.getOperatingStartTime(), settings.getOperatingEndTime(), LocalTime.now());

        // Phase 2 — Business Day Engine, shadow mode only. Computed and recorded
        // for observation; none of this feeds `blocked`, `businessDate`, or any
        // other decision below. See docs/business-day-architecture.md.
        BusinessDaySettings businessDaySettings = BusinessDaySettings.from(settings);
        LocalDate candidateBusinessDay = BusinessDayResolver.resolve(LocalDateTime.now(), businessDaySettings);
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
        if (terminalId != null && !terminalId.isBlank()) {
            Optional<PosSession> active = sessionResolutionStrategy.resolveByTerminal(branchId, terminalId);
            if (active.isPresent()) {
                PosSession s = active.get();
                currentSessionInfo = new DayStatusResponse.CurrentSessionInfo(
                        s.getId(), s.getStatus().name(), s.getOpenedBy());
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
        response.setOperatingHours(new DayStatusResponse.OperatingHoursInfo(
                hoursEnabled,
                settings.getOperatingStartTime() != null ? settings.getOperatingStartTime().toString() : null,
                settings.getOperatingEndTime() != null ? settings.getOperatingEndTime().toString() : null,
                withinHours));
        response.setTotalOpenSessions(totalOpenSessions);
        response.setCurrentTerminalSession(currentSessionInfo);
        response.setBlocked(blocked);
        response.setOpenSessions(openSessionInfos);
        return response;
    }

    private String resolveTerminalName(String terminalId) {
        if (terminalId == null || terminalId.isBlank()) return null;
        return terminalRepository.findByTerminalId(terminalId).map(PosTerminal::getTerminalName).orElse(null);
    }
}
