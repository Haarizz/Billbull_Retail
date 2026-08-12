package com.billbull.backend.pos.businessdate;

import com.billbull.backend.pos.session.PosSession;
import com.billbull.backend.pos.session.PosSessionRepository;
import com.billbull.backend.pos.session.PosSessionStatus;
import com.billbull.backend.pos.session.PosSessionResolutionStrategy;
import com.billbull.backend.pos.settings.PosSettings;
import com.billbull.backend.pos.settings.PosSettingsRepository;
import com.billbull.backend.pos.terminal.PosTerminalRepository;
import com.billbull.backend.settings.branch.Branch;
import com.billbull.backend.settings.branch.BranchAccessService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Phase 2 tests for {@link PosDayStatusService} — proves the Business Day Engine's
 * new fields are populated correctly AND that the pre-existing public contract
 * (currentBusinessDate/businessDateStatus/blocked/...) remains driven exclusively
 * by {@link PosBusinessDateService}, unchanged from before this phase.
 */
@ExtendWith(MockitoExtension.class)
class PosDayStatusServiceTest {

    @Mock private PosBusinessDateService businessDateService;
    @Mock private PosPendingDayCloseResolver pendingDayCloseResolver;
    @Mock private com.billbull.backend.pos.dayclose.PosDayCloseRepository dayCloseRepository;
    @Mock private BusinessDayStateService businessDayStateService;
    @Mock private PosSessionRepository sessionRepository;
    @Mock private PosSessionResolutionStrategy sessionResolutionStrategy;
    @Mock private PosSettingsRepository settingsRepository;
    @Mock private PosTerminalRepository terminalRepository;
    @Mock private BranchAccessService branchAccessService;

    private PosDayStatusService service;
    private BusinessDayWindowService businessDayWindowService;

    @BeforeEach
    void setUp() {
        // Real BusinessDayWindowService over mocked repositories: the window
        // arithmetic under test must be the genuine one, and a fixed-zone clock keeps
        // these assertions independent of the host's timezone.
        businessDayWindowService = new BusinessDayWindowService(
                new BusinessDayClock("Asia/Dubai"), settingsRepository);

        service = new PosDayStatusService(businessDateService, pendingDayCloseResolver, dayCloseRepository,
                businessDayStateService, businessDayWindowService,
                sessionRepository, sessionResolutionStrategy, settingsRepository, terminalRepository, branchAccessService,
                new BusinessDayContinuationGate(businessDayWindowService));

        Branch branch = new Branch();
        branch.setId(1L);
        lenient().when(branchAccessService.getRequiredCurrentUserBranch()).thenReturn(branch);
        lenient().when(sessionRepository.findUnclosedSessionsBeforeDate(anyLong(), any())).thenReturn(List.of());
        lenient().when(sessionRepository.findOpenSessionsByBranchAndDate(anyLong(), any())).thenReturn(List.of());
        lenient().when(pendingDayCloseResolver.resolvePendingBusinessDate(anyLong())).thenReturn(Optional.empty());
    }

    @Test
    void currentBusinessDateAndStatusRemainFullyPointerDriven() {
        LocalDate pointerDate = LocalDate.of(2026, 1, 1);
        when(businessDateService.getCurrentBusinessDate(1L)).thenReturn(pointerDate);
        when(businessDateService.isDateClosed(1L, pointerDate)).thenReturn(true);
        when(settingsRepository.findByBranchId(1L)).thenReturn(Optional.empty());
        when(businessDayStateService.findUnclosedBusinessDay(1L)).thenReturn(Optional.empty());

        DayStatusResponse response = service.getDayStatus("");

        // Unchanged from before Phase 2 — sourced exclusively from PosBusinessDateService.
        assertEquals(pointerDate, response.getCurrentBusinessDate());
        assertEquals("CLOSED", response.getBusinessDateStatus());
    }

    @Test
    void newFieldsArePopulatedFromBusinessDayEngineAndDoNotAlterLegacyFields() {
        LocalDate pointerDate = LocalDate.of(2026, 1, 1); // deliberately not "today"
        when(businessDateService.getCurrentBusinessDate(1L)).thenReturn(pointerDate);
        when(businessDateService.isDateClosed(1L, pointerDate)).thenReturn(false);
        when(settingsRepository.findByBranchId(1L)).thenReturn(Optional.empty()); // no operating hours configured
        LocalDate active = LocalDate.of(2025, 12, 30);
        when(businessDayStateService.findUnclosedBusinessDay(1L)).thenReturn(Optional.of(active));

        DayStatusResponse response = service.getDayStatus("");

        assertEquals(LocalDate.now(), response.getCandidateBusinessDay(), "no settings configured -> plain calendar date");
        assertEquals(active, response.getActiveBusinessDay());
        assertTrue(response.isHasActiveBusinessDay());
        assertEquals("LEGACY_POINTER", response.getBusinessDaySource());
        // Legacy fields untouched by the new engine's (deliberately different) values.
        assertEquals(pointerDate, response.getCurrentBusinessDate());
        assertEquals("OPEN", response.getBusinessDateStatus());
    }

    @Test
    void hasActiveBusinessDayIsFalseAndActiveBusinessDayIsNullWhenNothingUnclosed() {
        when(businessDateService.getCurrentBusinessDate(1L)).thenReturn(LocalDate.now());
        when(businessDateService.isDateClosed(1L, LocalDate.now())).thenReturn(false);
        when(settingsRepository.findByBranchId(1L)).thenReturn(Optional.empty());
        when(businessDayStateService.findUnclosedBusinessDay(1L)).thenReturn(Optional.empty());

        DayStatusResponse response = service.getDayStatus("");

        assertNull(response.getActiveBusinessDay());
        assertFalse(response.isHasActiveBusinessDay());
        verify(businessDayStateService).recordNoActiveBusinessDay(1L);
    }

    @Test
    void recordsShadowValidationExactlyOncePerRequest() {
        LocalDate pointerDate = LocalDate.now();
        when(businessDateService.getCurrentBusinessDate(1L)).thenReturn(pointerDate);
        when(businessDateService.isDateClosed(1L, pointerDate)).thenReturn(false);
        when(settingsRepository.findByBranchId(1L)).thenReturn(Optional.empty());
        when(businessDayStateService.findUnclosedBusinessDay(1L)).thenReturn(Optional.of(pointerDate));

        service.getDayStatus("");

        verify(businessDayStateService).recordShadowValidation(anyLong(), any(), any(), anyBoolean());
        verify(businessDayStateService, never()).recordNoActiveBusinessDay(anyLong());
    }

    @Test
    void overnightConfiguredWindowIsDetectedAndPassedToShadowValidation() {
        PosSettings settings = new PosSettings();
        settings.setOperatingHoursEnabled(true);
        settings.setOperatingStartTime(LocalTime.of(8, 0));
        settings.setOperatingEndTime(LocalTime.of(2, 0)); // overnight
        when(businessDateService.getCurrentBusinessDate(1L)).thenReturn(LocalDate.now());
        when(businessDateService.isDateClosed(1L, LocalDate.now())).thenReturn(false);
        when(settingsRepository.findByBranchId(1L)).thenReturn(Optional.of(settings));
        when(businessDayStateService.findUnclosedBusinessDay(1L)).thenReturn(Optional.empty());

        service.getDayStatus("");

        verify(businessDayStateService).recordShadowValidation(org.mockito.ArgumentMatchers.eq(1L),
                any(), any(), org.mockito.ArgumentMatchers.eq(true));
    }

    @Test
    void blockedFieldIsUnaffectedByBusinessDayEngine() {
        // blocked stays computed exactly as before: hoursEnabled && !withinHours &&
        // staleSessions non-empty && caller doesn't own one — none of that reads the
        // new engine's output.
        when(businessDateService.getCurrentBusinessDate(1L)).thenReturn(LocalDate.now());
        when(businessDateService.isDateClosed(1L, LocalDate.now())).thenReturn(false);
        when(settingsRepository.findByBranchId(1L)).thenReturn(Optional.empty());
        when(businessDayStateService.findUnclosedBusinessDay(1L)).thenReturn(Optional.empty());

        DayStatusResponse response = service.getDayStatus("");

        assertFalse(response.isBlocked()); // no operating hours configured -> never blocked
    }

    // ── dayCloseRequired ────────────────────────────────────────────────────
    // The signal that keeps the post-trading workflow recoverable: after the last
    // session on a closed Trading Date is closed, the POS has an empty
    // sessionsRequiringClosure list and nothing else to go on. Without this flag it
    // cannot tell "Day Close done" from "Day Close still pending" and leaves the
    // operator with no next step.

    /** A service whose Business Day clock is pinned at 23:00, i.e. well past the
     *  21:00/22:00 window the tests below configure — so the Business Day is
     *  genuinely CLOSED regardless of when the suite actually runs. */
    private PosDayStatusService serviceAtClosedWindow() {
        LocalDateTime fixed = LocalDate.of(2026, 8, 11).atTime(23, 0);
        BusinessDayClock frozen = new BusinessDayClock("Asia/Dubai") {
            @Override public LocalDateTime now() { return fixed; }
        };
        BusinessDayWindowService windowService = new BusinessDayWindowService(frozen, settingsRepository);
        return new PosDayStatusService(businessDateService, pendingDayCloseResolver, dayCloseRepository,
                businessDayStateService, windowService, sessionRepository, sessionResolutionStrategy,
                settingsRepository, terminalRepository, branchAccessService,
                new BusinessDayContinuationGate(windowService));
    }

    private static final LocalDate TRADING_DATE = LocalDate.of(2026, 8, 11);

    /** Window 09:00–21:00 with a 60-minute extension: closed from 22:00. The
     *  Trading Date's sessions are supplied per-test, since "was there trading at
     *  all" and "is anything still open" are both read off that one list. */
    private void givenClosedWindowWithSessions(PosSession... tradingDateSessions) {
        PosSettings settings = new PosSettings();
        settings.setOperatingHoursEnabled(true);
        settings.setOperatingStartTime(LocalTime.of(9, 0));
        settings.setOperatingEndTime(LocalTime.of(21, 0));
        settings.setBusinessDayExtensionMinutes(60);
        when(settingsRepository.findByBranchId(1L)).thenReturn(Optional.of(settings));
        when(businessDateService.getCurrentBusinessDate(1L)).thenReturn(TRADING_DATE);
        lenient().when(businessDateService.isDateClosed(anyLong(), any())).thenReturn(false);
        lenient().when(businessDayStateService.findUnclosedBusinessDay(1L)).thenReturn(Optional.empty());
        lenient().when(sessionRepository.findByBranchIdAndTradingDateOrderByOpenedAtDesc(anyLong(), any()))
                .thenReturn(List.of(tradingDateSessions));
    }

    private static PosSession session(Long id, PosSessionStatus status) {
        PosSession s = new PosSession();
        s.setId(id);
        s.setStatus(status);
        return s;
    }

    @Test
    void dayCloseRequiredWhenEverySessionIsClosedButTheDayIsNotFinalized() {
        // The reported case: sessions traded on this date and are all closed, and
        // pos_day_closes has no row for it.
        givenClosedWindowWithSessions(session(73L, PosSessionStatus.CLOSED),
                session(74L, PosSessionStatus.CLOSED));
        when(dayCloseRepository.existsByBranchIdAndCloseDate(1L, TRADING_DATE)).thenReturn(false);
        lenient().when(pendingDayCloseResolver.resolvePendingBusinessDate(1L))
                .thenReturn(Optional.of(TRADING_DATE));

        DayStatusResponse response = serviceAtClosedWindow().getDayStatus("");

        assertTrue(response.getSessionsRequiringClosure().isEmpty());
        assertTrue(response.isDayCloseRequired());
    }

    @Test
    void dayCloseRequiredIsFalseOnceTheDayCloseRecordExists() {
        givenClosedWindowWithSessions(session(73L, PosSessionStatus.CLOSED));
        // The authoritative "this date is finalized" answer — a pos_day_closes row.
        when(dayCloseRepository.existsByBranchIdAndCloseDate(1L, TRADING_DATE)).thenReturn(true);
        when(pendingDayCloseResolver.resolvePendingBusinessDate(1L)).thenReturn(Optional.empty());

        assertFalse(serviceAtClosedWindow().getDayStatus("").isDayCloseRequired());
    }

    @Test
    void dayCloseStillRequiredWhenALaterDateWasClosedFirst() {
        // Closing a later date moves the resolver's last-closed anchor past this
        // one, so it reports nothing pending — yet this date still has no record.
        // Asking pos_day_closes about this date directly is what catches it.
        givenClosedWindowWithSessions(session(73L, PosSessionStatus.CLOSED));
        when(dayCloseRepository.existsByBranchIdAndCloseDate(1L, TRADING_DATE)).thenReturn(false);
        when(pendingDayCloseResolver.resolvePendingBusinessDate(1L)).thenReturn(Optional.empty());

        assertTrue(serviceAtClosedWindow().getDayStatus("").isDayCloseRequired());
    }

    @Test
    void aTradingDateWithNoSessionsAtAllNeverRequiresADayClose() {
        // Same rule that lets the resolver ignore empty calendar dates — a day with
        // no trading was never owed a Day Close, and must not raise a prompt.
        givenClosedWindowWithSessions();
        when(pendingDayCloseResolver.resolvePendingBusinessDate(1L)).thenReturn(Optional.empty());

        DayStatusResponse response = serviceAtClosedWindow().getDayStatus("");

        assertFalse(response.isDayCloseRequired());
        verify(dayCloseRepository, never()).existsByBranchIdAndCloseDate(anyLong(), any());
    }

    @Test
    void sessionClosureTakesPrecedenceOverDayCloseRequired() {
        givenClosedWindowWithSessions(session(71L, PosSessionStatus.OPEN));
        lenient().when(pendingDayCloseResolver.resolvePendingBusinessDate(1L))
                .thenReturn(Optional.of(TRADING_DATE));

        DayStatusResponse response = serviceAtClosedWindow().getDayStatus("");

        // Mutually exclusive: the operator is told to close sessions first.
        assertEquals(1, response.getSessionsRequiringClosure().size());
        assertFalse(response.isDayCloseRequired());
    }

    @Test
    void dayCloseIsNotRequestedWhileTheBusinessDayIsStillTrading() {
        // Same outstanding Day Close, but the window has not closed — mid-trading is
        // not the moment to push the operator into a Day Close.
        when(businessDateService.getCurrentBusinessDate(1L)).thenReturn(LocalDate.now());
        when(businessDateService.isDateClosed(anyLong(), any())).thenReturn(false);
        when(settingsRepository.findByBranchId(1L)).thenReturn(Optional.empty());
        when(businessDayStateService.findUnclosedBusinessDay(1L)).thenReturn(Optional.empty());
        when(pendingDayCloseResolver.resolvePendingBusinessDate(1L)).thenReturn(Optional.of(LocalDate.now()));

        assertFalse(service.getDayStatus("").isDayCloseRequired());
    }
}
