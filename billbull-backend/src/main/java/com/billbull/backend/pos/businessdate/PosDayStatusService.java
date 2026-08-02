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
 */
@Service
public class PosDayStatusService {

    private final PosBusinessDateService businessDateService;
    private final PosSessionRepository sessionRepository;
    private final PosSessionResolutionStrategy sessionResolutionStrategy;
    private final PosSettingsRepository settingsRepository;
    private final PosTerminalRepository terminalRepository;
    private final BranchAccessService branchAccessService;

    public PosDayStatusService(PosBusinessDateService businessDateService,
                                PosSessionRepository sessionRepository,
                                PosSessionResolutionStrategy sessionResolutionStrategy,
                                PosSettingsRepository settingsRepository,
                                PosTerminalRepository terminalRepository,
                                BranchAccessService branchAccessService) {
        this.businessDateService = businessDateService;
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

        java.time.LocalDate businessDate = businessDateService.getCurrentBusinessDate(branchId);
        boolean dateClosed = businessDateService.isDateClosed(branchId, businessDate);

        PosSettings settings = settingsRepository.findByBranchId(branchId).orElse(new PosSettings());
        boolean hoursEnabled = Boolean.TRUE.equals(settings.getOperatingHoursEnabled())
                && settings.getOperatingStartTime() != null && settings.getOperatingEndTime() != null;
        boolean withinHours = !hoursEnabled || PosOperatingHoursCalculator.isWithinOperatingHours(
                settings.getOperatingStartTime(), settings.getOperatingEndTime(), LocalTime.now());

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
