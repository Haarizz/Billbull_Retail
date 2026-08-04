package com.billbull.backend.pos.session;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.backend.exception.SessionRangeExclusionException;
import com.billbull.backend.financials.generalledger.postingengine.PostingEngineService;
import com.billbull.backend.financials.receiptvoucher.ReceiptPurpose;
import com.billbull.backend.financials.receiptvoucher.ReceiptVoucher;
import com.billbull.backend.pos.audit.PosAuditLogRepository;
import com.billbull.backend.pos.audit.PosAuditService;
import com.billbull.backend.pos.settings.PosSettingsRepository;
import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;
import com.billbull.backend.pos.terminal.PosTerminalRepository;
import com.billbull.backend.sales.payment.PaymentRepository;
import com.billbull.backend.sales.returns.SalesReturn;
import com.billbull.backend.sales.returns.SalesReturnRepository;
import com.billbull.backend.sales.returns.SalesReturnStatus;
import com.billbull.backend.settings.branch.Branch;
import com.billbull.backend.settings.branch.BranchAccessService;
import com.billbull.backend.settings.branch.BranchRepository;

/**
 * Characterization tests for {@link PosSessionService} cash-reconciliation and
 * Z/X-report aggregation.
 *
 * <p>Purpose: pin the behaviour of the money math so the {@code Double -> BigDecimal}
 * conversion is provably behaviour-preserving. Every asserted figure here is a value
 * that is exactly representable in IEEE-754 {@code double} AND in {@code BigDecimal},
 * so these assertions held identically before and after the type change (the suite
 * was first run green against the pre-conversion {@code double} code, then again
 * after). Cases that exercise <em>branching</em> logic (null coalescing,
 * payment-mode classification, the sign / clamping of derived figures) are the real
 * safety net — those are where a naive type flip silently breaks the books.
 *
 * <p>Money assertions compare by <em>numeric value</em> ({@link BigDecimal#compareTo})
 * via {@link #assertMoney}, so {@code 380} and {@code 380.00} are treated as equal —
 * scale is not part of the contract, value is.
 */
@ExtendWith(MockitoExtension.class)
class PosSessionServiceTest {

    @Mock private PosSessionRepository repo;
    @Mock private SalesInvoiceRepository invoiceRepo;
    @Mock private BranchAccessService branchAccessService;
    @Mock private BranchRepository branchRepository;
    @Mock private PostingEngineService postingEngine;
    @Mock private PosSettingsRepository posSettingsRepository;
    @Mock private PosAuditService auditService;
    @Mock private PaymentRepository paymentRepository;
    @Mock private PosAuditLogRepository auditLogRepository;
    @Mock private PosTerminalRepository terminalRepository;
    @Mock private SalesReturnRepository returnRepository;
    @Mock private com.billbull.backend.pos.dayclose.PosDayCloseRepository dayCloseRepository;
    @Mock private com.fasterxml.jackson.databind.ObjectMapper objectMapper;
    @Mock private com.billbull.backend.pos.terminal.PosTerminalActivityService terminalActivityService;
    @Mock private com.billbull.backend.pos.businessdate.PosBusinessDateService businessDateService;
    @Mock private com.billbull.backend.pos.businessdate.BusinessDayStateService businessDayStateService;
    @Mock private com.billbull.backend.pos.businessdate.BusinessDayValidationService businessDayValidationService;
    @Mock private com.billbull.backend.pos.businessdate.BusinessDayFeatureFlagService businessDayFeatureFlagService;
    @Mock private PosCashMovementRepository cashMovementRepository;
    @Mock private com.billbull.backend.financials.receiptvoucher.ReceiptVoucherRepository receiptVoucherRepository;
    @Mock private com.billbull.backend.pos.reports.PosXReportSnapshotRepository xReportSnapshotRepository;
    @Mock private com.billbull.backend.pos.reports.PosReportNumberService reportNumberService;
    @Mock private com.billbull.backend.user.UserRepository userRepository;
    @Mock private com.billbull.backend.pos.admin.PosCashMovementCategoryService cashMovementCategoryService;
    @Mock private PosSessionTerminalHistoryRepository sessionTerminalHistoryRepository;
    @Mock private PosSessionTransferLogRepository transferLogRepository;
    @Mock private jakarta.persistence.EntityManager entityManager;
    @Mock private com.billbull.backend.pos.admin.EffectiveCorrectionViewService effectiveCorrectionViewService;

    private PosSessionService service;

    @BeforeEach
    void setUp() {
        // Real (not mocked) Phase 2 wrapper services — they delegate to the same mocked
        // repositories the tests already stub, so behavior is identical to the pre-wiring
        // inline lookups.
        PosSessionResolutionStrategy sessionResolutionStrategy = new PosSessionTerminalFirstResolutionStrategy(repo);
        PosSessionOwnershipService sessionOwnershipService = new PosSessionOwnershipService();
        com.billbull.backend.pos.terminal.PosTerminalHostingService terminalHostingService =
                new com.billbull.backend.pos.terminal.PosTerminalHostingService(terminalRepository, sessionTerminalHistoryRepository);
        PosSessionDiscoveryService sessionDiscoveryService = new PosSessionDiscoveryService(repo);
        PosSessionTransferService sessionTransferService = new PosSessionTransferService(
                repo, terminalRepository, terminalHostingService, transferLogRepository);
        PosSessionTransferPolicy sessionTransferPolicy = new PosSessionTransferPolicy(posSettingsRepository);
        service = new PosSessionService(repo, invoiceRepo, branchAccessService, branchRepository,
                postingEngine, posSettingsRepository, auditService, paymentRepository, auditLogRepository,
                terminalRepository, returnRepository, dayCloseRepository, objectMapper, terminalActivityService,
                businessDateService, businessDayStateService, businessDayValidationService, businessDayFeatureFlagService, cashMovementRepository, receiptVoucherRepository,
                xReportSnapshotRepository, reportNumberService, userRepository, cashMovementCategoryService,
                sessionResolutionStrategy, sessionOwnershipService, terminalHostingService, sessionDiscoveryService,
                sessionTransferService, transferLogRepository, sessionTransferPolicy,
                entityManager, effectiveCorrectionViewService);
        lenient().when(repo.save(any(PosSession.class))).thenAnswer(inv -> inv.getArgument(0));
        lenient().when(effectiveCorrectionViewService.resolveOverlays(any(), org.mockito.ArgumentMatchers.anyList(), any())).thenAnswer(inv -> inv.getArgument(1));
        lenient().when(transferLogRepository.findBySessionIdOrderByCreatedAtDesc(anyLong())).thenReturn(List.of());
        // Default: no linked User row — resolveDisplayName() falls back to the raw username.
        lenient().when(userRepository.findByUsername(any())).thenReturn(java.util.Optional.empty());
        // Default: no tender / audit rows unless a test stubs them.
        lenient().when(paymentRepository.sumTenderByModeForInvoices(any())).thenReturn(List.of());
        lenient().when(paymentRepository.findTenderForInvoices(any())).thenReturn(List.of());
        lenient().when(auditLogRepository.findBySessionIdOrderByCreatedAtDesc(anyLong())).thenReturn(List.of());
        lenient().when(terminalRepository.findByTerminalId(any())).thenReturn(java.util.Optional.empty());
        lenient().when(returnRepository.findByReturnDateAndBranchWithItems(any(), any())).thenReturn(List.of());
        lenient().when(cashMovementRepository.sumAmountByMovementTypeForSessionIds(any(), any())).thenReturn(List.of());
        lenient().when(cashMovementRepository.findByPosSession_IdInOrderByPerformedAtAsc(any())).thenReturn(List.of());
        lenient().when(receiptVoucherRepository.findCompletedByBranchAndDateAndPurpose(any(), any(), any())).thenReturn(List.of());
        // Stage 3B.2A shadow validation — always executes inside openSession(); default
        // to a harmless ALLOW so unrelated tests never trip the exception-safety catch path.
        lenient().when(businessDayValidationService.validate(any(), any(), any())).thenReturn(
                new com.billbull.backend.pos.businessdate.BusinessDayValidationResult(
                        LocalDate.now(), java.util.Optional.empty(),
                        com.billbull.backend.pos.businessdate.BusinessDayValidationVerdict.ALLOW,
                        com.billbull.backend.pos.businessdate.BusinessDayBlockingReason.NONE));
    }

    // ---------------------------------------------------------------------
    // Session Roaming Phase 4 — terminal-first hosting lifecycle
    // ---------------------------------------------------------------------

    @org.junit.jupiter.api.AfterEach
    void clearOwnershipContext() {
        com.billbull.backend.common.ownership.OwnershipContextHolder.clear();
        org.springframework.security.core.context.SecurityContextHolder.clearContext();
    }

    private com.billbull.backend.pos.terminal.PosTerminal terminal(Long id, Long counterId, String counterName) {
        com.billbull.backend.pos.terminal.PosTerminal t = new com.billbull.backend.pos.terminal.PosTerminal();
        t.setId(id);
        t.setCounterId(counterId);
        t.setCounterName(counterName);
        return t;
    }

    private void stubOpenSessionPreconditions(Long branchId, LocalDate businessDate, String terminalId) {
        when(branchAccessService.getRequiredCurrentUserBranch()).thenReturn(branch(branchId));
        when(businessDateService.getCurrentBusinessDate(branchId)).thenReturn(businessDate);
        // lenient: Stage 3B.2B enforcement-ALLOW tests never reach the legacy gate at
        // all, so this stub goes unused for them — that's expected, not a bug.
        lenient().when(businessDateService.isDateClosed(branchId, businessDate)).thenReturn(false);
        lenient().when(repo.findUnclosedSessionsBeforeDate(branchId, businessDate)).thenReturn(List.of());
        // The gate itself asks about the Candidate Business Day, which for an
        // unconfigured window (this helper's default) is today's calendar date —
        // NOT the `businessDate` pointer these tests pass in. Both are stubbed so a
        // test can keep using an arbitrary pointer without tripping strict stubbing.
        lenient().when(businessDateService.isDateClosed(branchId, LocalDate.now())).thenReturn(false);
        lenient().when(repo.findUnclosedSessionsBeforeDate(branchId, LocalDate.now())).thenReturn(List.of());
        lenient().when(repo.findByBranchIdAndTerminalIdAndStatus(branchId, terminalId, PosSessionStatus.OPEN))
                .thenReturn(Optional.empty());
        lenient().when(posSettingsRepository.findByBranchId(branchId)).thenReturn(Optional.empty());
    }

    /** Day Close domain: tradingDate must be the real calendar day the session opens
     *  on, independent of the Business Date pointer — even when the pointer lags
     *  behind (the exact scenario Skip Date used to exist for). sessionDate keeps
     *  reflecting the pointer, unchanged. */
    @Test
    void openSessionStampsTradingDateFromRealCalendarDayIndependentOfLaggingBusinessDate() {
        LocalDate laggingBusinessDate = LocalDate.of(2020, 1, 1); // deliberately not "today"
        stubOpenSessionPreconditions(1L, laggingBusinessDate, "T1");

        PosSession opened = service.openSession("T1", "Counter 1", bd("100"));

        assertEquals(laggingBusinessDate, opened.getSessionDate(), "sessionDate must still track the pointer");
        assertEquals(LocalDate.now(), opened.getTradingDate(), "tradingDate must be the real open day");
    }

    // ---------------------------------------------------------------------
    // Phase 3A — Business Day persistence (tradingDate, resolver-driven)
    // ---------------------------------------------------------------------

    /** With no operating hours configured (the default), the resolver's output is
     *  byte-identical to the raw calendar date — proving Phase 3A changes nothing
     *  observable for the common case. */
    @Test
    void openSessionTradingDateMatchesCalendarDateWhenNoOperatingHoursConfigured() {
        LocalDate businessDate = LocalDate.of(2020, 1, 1);
        stubOpenSessionPreconditions(1L, businessDate, "T1");

        PosSession opened = service.openSession("T1", "Counter 1", bd("100"));

        assertEquals(LocalDate.now(), opened.getTradingDate());
    }

    // ---------------------------------------------------------------------
    // "Previous Business Day Not Closed" regression — the gate must compare the
    // unclosed Business Day (tradingDate domain) against the RESOLVED Candidate
    // Business Day, never against the legacy Business Date pointer. Mixing the
    // two made a branch on Business Day D, whose pointer had already advanced to
    // D+1, read its own current day as an unclosed PREVIOUS day and refuse every
    // further session.
    // ---------------------------------------------------------------------

    /** Helper: same-day 09:00–21:00 window, i.e. the reported configuration. */
    private com.billbull.backend.pos.settings.PosSettings sameDayWindowSettings() {
        com.billbull.backend.pos.settings.PosSettings s = new com.billbull.backend.pos.settings.PosSettings();
        s.setOperatingHoursEnabled(true);
        s.setOperatingStartTime(java.time.LocalTime.of(9, 0));
        s.setOperatingEndTime(java.time.LocalTime.of(21, 0));
        return s;
    }

    /** Scenario 1 — current Business Day is D, all its sessions are closed, Day
     *  Close has not run, and the legacy pointer has already advanced to D+1.
     *  A further session on D must still open. This is the reported bug. */
    @Test
    void openSessionAllowsAnotherSessionOnCurrentBusinessDayWhenPointerAlreadyAdvanced() {
        Long branchId = 1L;
        com.billbull.backend.pos.settings.PosSettings settings = sameDayWindowSettings();
        LocalDate today = com.billbull.backend.pos.businessdate.BusinessDayResolver.resolve(
                java.time.LocalDateTime.now(), com.billbull.backend.pos.businessdate.BusinessDaySettings.from(settings));

        when(branchAccessService.getRequiredCurrentUserBranch()).thenReturn(branch(branchId));
        // Legacy pointer has rolled ahead of the actual Business Day.
        when(businessDateService.getCurrentBusinessDate(branchId)).thenReturn(today.plusDays(1));
        when(posSettingsRepository.findByBranchId(branchId)).thenReturn(Optional.of(settings));
        when(businessDateService.isDateClosed(branchId, today)).thenReturn(false);
        when(repo.findUnclosedSessionsBeforeDate(branchId, today)).thenReturn(List.of());
        when(repo.findByBranchIdAndTerminalIdAndStatus(branchId, "T1", PosSessionStatus.OPEN))
                .thenReturn(Optional.empty());
        // The oldest Business Day without a PosDayClose row IS the current one.
        when(businessDayStateService.findUnclosedBusinessDay(branchId)).thenReturn(Optional.of(today));

        PosSession opened = service.openSession("T1", "Counter 1", bd("100"));

        assertEquals(PosSessionStatus.OPEN, opened.getStatus());
        assertEquals(today, opened.getTradingDate());
    }

    /** Scenario 2/3 — a genuinely PRIOR Business Day is unclosed. Still blocked,
     *  with the same message, even though the pointer is unreliable. */
    @Test
    void openSessionStillBlocksWhenAGenuinelyPriorBusinessDayIsUnclosed() {
        Long branchId = 1L;
        com.billbull.backend.pos.settings.PosSettings settings = sameDayWindowSettings();
        LocalDate today = com.billbull.backend.pos.businessdate.BusinessDayResolver.resolve(
                java.time.LocalDateTime.now(), com.billbull.backend.pos.businessdate.BusinessDaySettings.from(settings));

        when(branchAccessService.getRequiredCurrentUserBranch()).thenReturn(branch(branchId));
        when(businessDateService.getCurrentBusinessDate(branchId)).thenReturn(today);
        when(posSettingsRepository.findByBranchId(branchId)).thenReturn(Optional.of(settings));
        when(businessDateService.isDateClosed(branchId, today)).thenReturn(false);
        when(repo.findUnclosedSessionsBeforeDate(branchId, today)).thenReturn(List.of());
        when(businessDayStateService.findUnclosedBusinessDay(branchId))
                .thenReturn(Optional.of(today.minusDays(1)));
        when(repo.findByBranchIdAndTradingDateOrderByOpenedAtDesc(branchId, today.minusDays(1)))
                .thenReturn(List.of());

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.openSession("T1", "Counter 1", bd("100")));
        assertTrue(ex.getReason().contains("PREVIOUS_DAY_SESSION_OPEN"));
        assertTrue(ex.getReason().contains(today.minusDays(1).toString()));
    }

    /** Scenario 4 — window DISABLED and the pointer has drifted AHEAD of the
     *  calendar (one advanceBusinessDate per resolved backlog Day Close). The gate
     *  must compare against the Candidate Business Day (= today), not the pointer,
     *  or today's own unclosed Business Day reads as a prior one. sessionDate keeps
     *  tracking the pointer, unchanged. */
    @Test
    void openSessionWithWindowDisabledGatesOnCandidateDayNotDriftedPointer() {
        Long branchId = 1L;
        LocalDate today = LocalDate.now();
        LocalDate driftedPointer = today.plusDays(1);

        when(branchAccessService.getRequiredCurrentUserBranch()).thenReturn(branch(branchId));
        when(businessDateService.getCurrentBusinessDate(branchId)).thenReturn(driftedPointer);
        when(posSettingsRepository.findByBranchId(branchId)).thenReturn(Optional.empty());
        // Stubbed against TODAY, not the pointer — the gate must ask about today.
        when(businessDateService.isDateClosed(branchId, today)).thenReturn(false);
        when(repo.findUnclosedSessionsBeforeDate(branchId, today)).thenReturn(List.of());
        when(repo.findByBranchIdAndTerminalIdAndStatus(branchId, "T1", PosSessionStatus.OPEN))
                .thenReturn(Optional.empty());
        // Today is the oldest Business Day with no PosDayClose row — its own sessions
        // are all CLOSED, which is precisely the reported production state.
        when(businessDayStateService.findUnclosedBusinessDay(branchId)).thenReturn(Optional.of(today));

        PosSession opened = service.openSession("T1", "Counter 1", bd("100"));

        assertEquals(PosSessionStatus.OPEN, opened.getStatus());
        assertEquals(today, opened.getTradingDate());
        assertEquals(driftedPointer, opened.getSessionDate(), "sessionDate must still track the pointer");
    }

    /** Same unconfigured-window branch, but the unclosed day is GENUINELY prior —
     *  Day Close really is overdue. Must still block (BBQA-5.3-013 regression). */
    @Test
    void openSessionWithWindowDisabledStillBlocksOnGenuinelyPriorUnclosedDay() {
        Long branchId = 1L;
        LocalDate today = LocalDate.now();
        LocalDate stale = today.minusDays(2);

        when(branchAccessService.getRequiredCurrentUserBranch()).thenReturn(branch(branchId));
        when(businessDateService.getCurrentBusinessDate(branchId)).thenReturn(today);
        when(posSettingsRepository.findByBranchId(branchId)).thenReturn(Optional.empty());
        when(businessDateService.isDateClosed(branchId, today)).thenReturn(false);
        when(repo.findUnclosedSessionsBeforeDate(branchId, today)).thenReturn(List.of());
        when(businessDayStateService.findUnclosedBusinessDay(branchId)).thenReturn(Optional.of(stale));
        when(repo.findByBranchIdAndTradingDateOrderByOpenedAtDesc(branchId, stale)).thenReturn(List.of());

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.openSession("T1", "Counter 1", bd("100")));
        assertTrue(ex.getReason().contains("PREVIOUS_DAY_SESSION_OPEN"));
        assertTrue(ex.getReason().contains(stale.toString()));
    }

    /** Unconfigured window, today's Business Day still has an OPEN session — the
     *  same-Business-Day reopen path must not be blocked by it either. */
    @Test
    void openSessionWithWindowDisabledAllowsReopenWhileTodaysDayStillHasAnOpenSession() {
        Long branchId = 1L;
        LocalDate today = LocalDate.now();

        when(branchAccessService.getRequiredCurrentUserBranch()).thenReturn(branch(branchId));
        when(businessDateService.getCurrentBusinessDate(branchId)).thenReturn(today);
        when(posSettingsRepository.findByBranchId(branchId)).thenReturn(Optional.empty());
        when(businessDateService.isDateClosed(branchId, today)).thenReturn(false);
        when(repo.findUnclosedSessionsBeforeDate(branchId, today)).thenReturn(List.of());
        when(repo.findByBranchIdAndTerminalIdAndStatus(branchId, "T1", PosSessionStatus.OPEN))
                .thenReturn(Optional.empty());
        when(businessDayStateService.findUnclosedBusinessDay(branchId)).thenReturn(Optional.of(today));

        PosSession opened = service.openSession("T1", "Counter 1", bd("100"));

        assertEquals(PosSessionStatus.OPEN, opened.getStatus());
        assertEquals(today, opened.getTradingDate());
    }

    /** Proves tradingDate is genuinely resolver-driven (not just now.toLocalDate())
     *  by configuring an overnight window and opening the session on the
     *  early-morning side of it — only BusinessDayResolver would roll this back to
     *  the previous calendar day; a naive now.toLocalDate() stamp would not. */
    @Test
    void openSessionTradingDateUsesResolverForOvernightWindow() {
        Long branchId = 1L;
        LocalDate businessDate = LocalDate.of(2020, 1, 1);
        when(branchAccessService.getRequiredCurrentUserBranch()).thenReturn(branch(branchId));
        when(businessDateService.getCurrentBusinessDate(branchId)).thenReturn(businessDate);
        when(repo.findByBranchIdAndTerminalIdAndStatus(branchId, "T1", PosSessionStatus.OPEN))
                .thenReturn(Optional.empty());

        com.billbull.backend.pos.settings.PosSettings settings = new com.billbull.backend.pos.settings.PosSettings();
        settings.setOperatingHoursEnabled(true);
        settings.setOperatingStartTime(java.time.LocalTime.of(8, 0));
        settings.setOperatingEndTime(java.time.LocalTime.of(2, 0)); // overnight
        when(posSettingsRepository.findByBranchId(branchId)).thenReturn(Optional.of(settings));

        // With a CONFIGURED window the gate no longer queries the stale legacy
        // pointer (2020-01-01) — it queries the resolved Candidate Business Day.
        // Stubbing against the resolved day is itself the assertion that it does.
        LocalDate resolvedDay = com.billbull.backend.pos.businessdate.BusinessDayResolver.resolve(
                java.time.LocalDateTime.now(), com.billbull.backend.pos.businessdate.BusinessDaySettings.from(settings));
        when(businessDateService.isDateClosed(branchId, resolvedDay)).thenReturn(false);
        when(repo.findUnclosedSessionsBeforeDate(branchId, resolvedDay)).thenReturn(List.of());

        // We can't control LocalDateTime.now() inside openSession(), so instead we
        // prove the *rule*: with these settings, "now" always resolves to either
        // today or yesterday depending on the wall clock — either way, the result
        // must equal exactly what BusinessDayResolver independently computes for
        // the same instant class, never the raw calendar date when they'd differ.
        // Deterministic assertion: candidateBusinessDay is never simply undefined/
        // null and always matches BusinessDayResolver.resolve(now, settings) to
        // within the same day (re-resolved immediately after, negligible race).
        PosSession opened = service.openSession("T1", "Counter 1", bd("100"));

        com.billbull.backend.pos.businessdate.BusinessDaySettings bds =
                com.billbull.backend.pos.businessdate.BusinessDaySettings.from(settings);
        LocalDate expected = com.billbull.backend.pos.businessdate.BusinessDayResolver.resolve(
                java.time.LocalDateTime.now(), bds);
        assertEquals(expected, opened.getTradingDate());
    }

    @Test
    void openSessionSessionDateStillTracksBusinessDatePointerUnchanged() {
        LocalDate laggingBusinessDate = LocalDate.of(2020, 6, 15);
        stubOpenSessionPreconditions(1L, laggingBusinessDate, "T1");

        PosSession opened = service.openSession("T1", "Counter 1", bd("100"));

        assertEquals(laggingBusinessDate, opened.getSessionDate());
    }

    /** The pointer is still read (sessionDate depends on it), but the already-closed
     *  gate asks about the Candidate Business Day — for an unconfigured window,
     *  today — so a drifted pointer can no longer decide whether trading is blocked. */
    @Test
    void openSessionReadsPointerButGatesOnCandidateBusinessDay() {
        LocalDate businessDate = LocalDate.of(2020, 1, 1);
        stubOpenSessionPreconditions(1L, businessDate, "T1");

        service.openSession("T1", "Counter 1", bd("100"));

        verify(businessDateService).getCurrentBusinessDate(1L);
        verify(businessDateService).isDateClosed(1L, LocalDate.now());
        verify(businessDateService, org.mockito.Mockito.never()).isDateClosed(1L, businessDate);
    }

    @Test
    void openSessionRecordsShadowValidationAfterPersistence() {
        LocalDate businessDate = LocalDate.of(2020, 1, 1);
        stubOpenSessionPreconditions(1L, businessDate, "T1");

        service.openSession("T1", "Counter 1", bd("100"));

        verify(businessDayStateService).recordShadowValidation(
                eq(1L), eq(businessDate), eq(LocalDate.now()), eq(false));
    }

    /** Business Day, once persisted, is never re-derived — no other session
     *  lifecycle method (close/suspend/resume/transfer) touches tradingDate. */
    @Test
    void tradingDateIsNeverModifiedByCloseSession() {
        PosSession session = openSession();
        session.setSessionDate(LocalDate.of(2020, 1, 1));
        session.setTradingDate(LocalDate.of(2020, 1, 1));
        when(repo.findById(1L)).thenReturn(Optional.of(session));
        when(invoiceRepo.findByPosSessionIdWithItems(1L)).thenReturn(List.of());

        LocalDate before = session.getTradingDate();
        service.closeSession(1L, bd("0"), "eod");

        assertEquals(before, session.getTradingDate());
    }

    // ---------------------------------------------------------------------
    // Phase 3B.1 — Previous Unclosed Business Day detection, sourced from
    // BusinessDayStateService instead of the legacy sessionDate<pointer scan.
    // The allow/block decision, exception type, HTTP status, and message format
    // must all stay identical to before this phase.
    // ---------------------------------------------------------------------

    @Test
    void openSessionAllowsWhenNoUnclosedBusinessDayExists() {
        LocalDate businessDate = LocalDate.of(2026, 1, 1);
        stubOpenSessionPreconditions(1L, businessDate, "T1");
        when(businessDayStateService.findUnclosedBusinessDay(1L)).thenReturn(Optional.empty());

        PosSession opened = service.openSession("T1", "Counter 1", bd("100"));

        assertEquals(PosSessionStatus.OPEN, opened.getStatus());
        verify(businessDayStateService).findUnclosedBusinessDay(1L);
    }

    @Test
    void openSessionBlocksWhenPreviousUnclosedBusinessDayExists() {
        LocalDate businessDate = LocalDate.of(2026, 1, 3);
        LocalDate unclosedDay = LocalDate.of(2026, 1, 1); // strictly before businessDate
        stubOpenSessionPreconditions(1L, businessDate, "T1");
        when(businessDayStateService.findUnclosedBusinessDay(1L)).thenReturn(Optional.of(unclosedDay));
        PosSession stale = sessionAt(77L, 1L, unclosedDay, "cashierX", PosSessionStatus.OPEN,
                unclosedDay.atStartOfDay().plusHours(9));
        stale.setTerminalId("T-OLD");
        when(repo.findByBranchIdAndTradingDateOrderByOpenedAtDesc(1L, unclosedDay)).thenReturn(List.of(stale));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.openSession("T1", "Counter 1", bd("100")));

        assertEquals(org.springframework.http.HttpStatus.CONFLICT, ex.getStatusCode());
        assertTrue(ex.getReason().contains("PREVIOUS_DAY_SESSION_OPEN"));
        assertTrue(ex.getReason().contains("Session ID : 77"));
        assertTrue(ex.getReason().contains("T-OLD"));
    }

    /** The critical case: an "unclosed Business Day" that equals today's own
     *  in-progress day (Day Close simply hasn't run yet, as is normal mid-shift)
     *  must never block a second/third/... session from opening on that same day. */
    @Test
    void openSessionAllowsWhenUnclosedBusinessDayEqualsCurrentBusinessDate() {
        // The unclosed day must equal the CANDIDATE Business Day (today) — that is
        // what "today's own in-progress day" means now that the gate no longer
        // consults the pointer.
        LocalDate businessDate = LocalDate.now();
        stubOpenSessionPreconditions(1L, businessDate, "T1");
        when(businessDayStateService.findUnclosedBusinessDay(1L)).thenReturn(Optional.of(businessDate));

        PosSession opened = service.openSession("T1", "Counter 1", bd("100"));

        assertEquals(PosSessionStatus.OPEN, opened.getStatus());
        verify(repo, org.mockito.Mockito.never()).findByBranchIdAndTradingDateOrderByOpenedAtDesc(anyLong(), any());
    }

    /** Multiple sessions already open on the same unclosed prior day: the message
     *  must reference the earliest-opened one, matching the legacy "oldest" pick. */
    @Test
    void openSessionBlockMessageReferencesEarliestSessionAmongMultipleOnUnclosedDay() {
        LocalDate businessDate = LocalDate.of(2026, 1, 3);
        LocalDate unclosedDay = LocalDate.of(2026, 1, 1);
        stubOpenSessionPreconditions(1L, businessDate, "T1");
        when(businessDayStateService.findUnclosedBusinessDay(1L)).thenReturn(Optional.of(unclosedDay));
        PosSession earlier = sessionAt(1L, 1L, unclosedDay, "cashierA", PosSessionStatus.OPEN,
                unclosedDay.atStartOfDay().plusHours(8));
        PosSession later = sessionAt(2L, 1L, unclosedDay, "cashierB", PosSessionStatus.SUSPENDED,
                unclosedDay.atStartOfDay().plusHours(11));
        when(repo.findByBranchIdAndTradingDateOrderByOpenedAtDesc(1L, unclosedDay)).thenReturn(List.of(later, earlier));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.openSession("T1", "Counter 1", bd("100")));

        assertTrue(ex.getReason().contains("Session ID : 1"));
        assertFalse(ex.getReason().contains("Session ID : 2"));
    }

    /** A prior date that has already been through Day Close is excluded by
     *  BusinessDayStateService's underlying query (no PosDayClose row = unclosed;
     *  a closed date is never returned) — verified here at the gate level: an
     *  empty Optional (as would result from a fully-closed history) never blocks. */
    @Test
    void openSessionAllowsWhenAllHistoricalBusinessDaysAreAlreadyClosed() {
        LocalDate businessDate = LocalDate.of(2026, 1, 5);
        stubOpenSessionPreconditions(1L, businessDate, "T1");
        when(businessDayStateService.findUnclosedBusinessDay(1L)).thenReturn(Optional.empty());

        PosSession opened = service.openSession("T1", "Counter 1", bd("100"));

        assertEquals(PosSessionStatus.OPEN, opened.getStatus());
    }

    /** Overnight-configured Business Days are just another LocalDate as far as this
     *  gate is concerned — the overnight-aware computation itself is Phase 3A's
     *  concern (BusinessDayResolver); this gate only compares whatever
     *  BusinessDayStateService reports against the pointer's businessDate. */
    @Test
    void openSessionBlocksOnPriorUnclosedOvernightBusinessDay() {
        LocalDate businessDate = LocalDate.of(2026, 7, 30);
        LocalDate unclosedOvernightDay = LocalDate.of(2026, 7, 28); // e.g. rolled back from July 29 by the resolver
        stubOpenSessionPreconditions(1L, businessDate, "T1");
        when(businessDayStateService.findUnclosedBusinessDay(1L)).thenReturn(Optional.of(unclosedOvernightDay));
        PosSession overnightStale = sessionAt(50L, 1L, unclosedOvernightDay, "cashierY", PosSessionStatus.OPEN,
                unclosedOvernightDay.atStartOfDay().plusHours(23));
        when(repo.findByBranchIdAndTradingDateOrderByOpenedAtDesc(1L, unclosedOvernightDay)).thenReturn(List.of(overnightStale));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.openSession("T1", "Counter 1", bd("100")));

        assertTrue(ex.getReason().contains("Session ID : 50"));
    }

    /** REGRESSION TEST: When the unclosed Business Day has only CLOSED sessions
     *  (i.e. Day Close has not been run yet), the legacy gate MUST still block.
     *  This was the exact production regression introduced by the message-only patch. */
    @Test
    void openSessionBlocksWhenAllSessionsOnUnclosedDayAreClosed() {
        LocalDate businessDate = LocalDate.of(2026, 8, 4);
        LocalDate unclosedDay = LocalDate.of(2026, 8, 3);
        stubOpenSessionPreconditions(1L, businessDate, "T1");
        when(businessDayStateService.findUnclosedBusinessDay(1L)).thenReturn(Optional.of(unclosedDay));
        // All sessions on the unclosed day are CLOSED — no OPEN or SUSPENDED remain.
        PosSession s1 = sessionAt(50L, 1L, unclosedDay, "cashierA", PosSessionStatus.CLOSED, unclosedDay.atStartOfDay().plusHours(9));
        PosSession s2 = sessionAt(51L, 1L, unclosedDay, "cashierB", PosSessionStatus.CLOSED, unclosedDay.atStartOfDay().plusHours(10));
        when(repo.findByBranchIdAndTradingDateOrderByOpenedAtDesc(1L, unclosedDay)).thenReturn(List.of(s2, s1));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.openSession("T1", "Counter 1", bd("100")));

        assertEquals(org.springframework.http.HttpStatus.CONFLICT, ex.getStatusCode());
        assertTrue(ex.getReason().contains("PREVIOUS_DAY_SESSION_OPEN"));
        assertTrue(ex.getReason().contains("Previous Business Day Not Closed"));
        assertTrue(ex.getReason().contains("Business Day 2026-08-03 has not been closed."));
        assertTrue(ex.getReason().contains("All sessions for this Business Day are already closed."));
        // Must NOT mention any session details
        assertFalse(ex.getReason().contains("Session ID"));
    }

    // ---------------------------------------------------------------------
    // Stage 3B.2A — Shadow Validation integration: BusinessDayValidationService
    // always executes, never affects the decision, exceptions are swallowed.
    // ---------------------------------------------------------------------

    @Test
    void openSessionExecutesShadowValidationOnSuccessfulOpen() {
        LocalDate businessDate = LocalDate.of(2026, 1, 1);
        stubOpenSessionPreconditions(1L, businessDate, "T1");
        when(businessDayStateService.findUnclosedBusinessDay(1L)).thenReturn(Optional.empty());

        service.openSession("T1", "Counter 1", bd("100"));

        verify(businessDayValidationService).validate(eq(1L), any(LocalDateTime.class), any());
        verify(businessDayStateService).recordValidationOutcome(eq(1L), eq(true), any());
    }

    @Test
    void openSessionExecutesShadowValidationEvenWhenLegacyGateBlocks() {
        LocalDate businessDate = LocalDate.of(2026, 1, 3);
        LocalDate unclosedDay = LocalDate.of(2026, 1, 1);
        stubOpenSessionPreconditions(1L, businessDate, "T1");
        when(businessDayStateService.findUnclosedBusinessDay(1L)).thenReturn(Optional.of(unclosedDay));
        PosSession stale = sessionAt(88L, 1L, unclosedDay, "cashierX", PosSessionStatus.OPEN,
                unclosedDay.atStartOfDay().plusHours(9));
        when(repo.findByBranchIdAndTradingDateOrderByOpenedAtDesc(1L, unclosedDay)).thenReturn(List.of(stale));

        // The legacy gate still throws — unchanged behavior — but shadow validation
        // must still have run beforehand, observing the (now-known) legacy outcome.
        assertThrows(ResponseStatusException.class, () -> service.openSession("T1", "Counter 1", bd("100")));

        verify(businessDayValidationService).validate(eq(1L), any(LocalDateTime.class), any());
        verify(businessDayStateService).recordValidationOutcome(eq(1L), eq(false), any());
    }

    @Test
    void openSessionSwallowsShadowValidationExceptionsAndStillOpensTheSession() {
        LocalDate businessDate = LocalDate.of(2026, 1, 1);
        stubOpenSessionPreconditions(1L, businessDate, "T1");
        when(businessDayStateService.findUnclosedBusinessDay(1L)).thenReturn(Optional.empty());
        when(businessDayValidationService.validate(any(), any(), any()))
                .thenThrow(new RuntimeException("shadow engine bug"));

        PosSession opened = service.openSession("T1", "Counter 1", bd("100"));

        assertEquals(PosSessionStatus.OPEN, opened.getStatus());
        // Stage 3B.2A.6: an unclassified shadow-validation exception is categorized
        // UNEXPECTED and recorded via recordInfrastructureFailure (which internally
        // also calls recordValidationError for backward compatibility — but that's
        // an implementation detail of the real class, invisible to this mock-based
        // assertion, so we verify the categorized entry point instead).
        verify(businessDayStateService).recordInfrastructureFailure(
                eq(1L), eq(com.billbull.backend.pos.businessdate.BusinessDayInfrastructureException.FailureCategory.UNEXPECTED),
                any(RuntimeException.class));
        verify(businessDayStateService, org.mockito.Mockito.never())
                .recordValidationOutcome(anyLong(), org.mockito.ArgumentMatchers.anyBoolean(), any());
    }

    @Test
    void openSessionCategorizesSettingsLookupFailureSeparatelyFromRepositoryFailure() {
        LocalDate businessDate = LocalDate.of(2026, 1, 1);
        stubOpenSessionPreconditions(1L, businessDate, "T1");
        when(businessDayStateService.findUnclosedBusinessDay(1L)).thenReturn(Optional.empty());
        // First call is the shadow-validation settings read (fails); the method's
        // own pre-existing idle/timeout settings read further down (unrelated to
        // this phase) must still succeed so the rest of openSession() is unaffected.
        when(posSettingsRepository.findByBranchId(1L))
                .thenThrow(new RuntimeException("settings datasource down"))
                .thenReturn(Optional.empty());

        PosSession opened = service.openSession("T1", "Counter 1", bd("100"));

        assertEquals(PosSessionStatus.OPEN, opened.getStatus());
        verify(businessDayStateService).recordInfrastructureFailure(
                eq(1L), eq(com.billbull.backend.pos.businessdate.BusinessDayInfrastructureException.FailureCategory.SETTINGS),
                any(RuntimeException.class));
        // businessDayValidationService must never even be called — the settings
        // lookup failed before validate() could be invoked.
        verify(businessDayValidationService, org.mockito.Mockito.never()).validate(any(), any(), any());
    }

    @Test
    void openSessionCategorizesBusinessDayStateServiceExceptionAsInfrastructureFailure() {
        LocalDate businessDate = LocalDate.of(2026, 1, 1);
        stubOpenSessionPreconditions(1L, businessDate, "T1");
        // The 3B.1 gate's own call to findUnclosedBusinessDay succeeds (empty —
        // legacy allows), but the shadow validate() call fails downstream inside
        // BusinessDayValidationService, surfacing as a categorized infra exception.
        when(businessDayStateService.findUnclosedBusinessDay(1L)).thenReturn(Optional.empty());
        when(businessDayValidationService.validate(any(), any(), any()))
                .thenThrow(new com.billbull.backend.pos.businessdate.BusinessDayInfrastructureException(
                        com.billbull.backend.pos.businessdate.BusinessDayInfrastructureException.FailureCategory.REPOSITORY,
                        "dependency failure", new RuntimeException("timeout")));

        PosSession opened = service.openSession("T1", "Counter 1", bd("100"));

        assertEquals(PosSessionStatus.OPEN, opened.getStatus());
        verify(businessDayStateService).recordInfrastructureFailure(
                eq(1L), eq(com.billbull.backend.pos.businessdate.BusinessDayInfrastructureException.FailureCategory.REPOSITORY),
                any());
    }

    // ---------------------------------------------------------------------
    // Stage 3B.2B — Enforcement (feature-flag controlled)
    // ---------------------------------------------------------------------

    private static final com.billbull.backend.pos.businessdate.BusinessDayValidationResult ALLOW_RESULT =
            new com.billbull.backend.pos.businessdate.BusinessDayValidationResult(
                    LocalDate.of(2026, 1, 1), Optional.empty(),
                    com.billbull.backend.pos.businessdate.BusinessDayValidationVerdict.ALLOW,
                    com.billbull.backend.pos.businessdate.BusinessDayBlockingReason.NONE);

    @Test
    void openSessionFlagOffUsesLegacyGateAndIgnoresNewEngineDecision() {
        LocalDate businessDate = LocalDate.of(2026, 1, 1);
        stubOpenSessionPreconditions(1L, businessDate, "T1");
        when(businessDayFeatureFlagService.isLoginGateV2Enabled(1L)).thenReturn(false);
        when(businessDayStateService.findUnclosedBusinessDay(1L)).thenReturn(Optional.empty());
        // Even though the new engine would BLOCK, flag OFF means it must never be consulted for the decision.
        when(businessDayValidationService.validate(any(), any(), any())).thenReturn(
                new com.billbull.backend.pos.businessdate.BusinessDayValidationResult(
                        businessDate, Optional.of(businessDate.minusDays(1)),
                        com.billbull.backend.pos.businessdate.BusinessDayValidationVerdict.BLOCK,
                        com.billbull.backend.pos.businessdate.BusinessDayBlockingReason.PREVIOUS_BUSINESS_DAY_OPEN));

        PosSession opened = service.openSession("T1", "Counter 1", bd("100"));

        assertEquals(PosSessionStatus.OPEN, opened.getStatus());
        verify(businessDayStateService).recordFeatureFlagRequest(1L, false);
        verify(businessDayStateService, org.mockito.Mockito.never())
                .recordEnforcementDecision(anyLong(), any());
    }

    @Test
    void openSessionFlagOnAllowsWhenEngineAllows() {
        LocalDate businessDate = LocalDate.of(2026, 1, 1);
        stubOpenSessionPreconditions(1L, businessDate, "T1");
        when(businessDayFeatureFlagService.isLoginGateV2Enabled(1L)).thenReturn(true);
        when(businessDayValidationService.validate(any(), any(), any())).thenReturn(ALLOW_RESULT);

        PosSession opened = service.openSession("T1", "Counter 1", bd("100"));

        assertEquals(PosSessionStatus.OPEN, opened.getStatus());
        verify(businessDayStateService).recordFeatureFlagRequest(1L, true);
        verify(businessDayStateService).recordEnforcementDecision(1L, ALLOW_RESULT);
        // The legacy pointer gate itself must never run when enforcement succeeds.
        verify(businessDateService, org.mockito.Mockito.never()).isDateClosed(anyLong(), any());
    }

    @Test
    void openSessionFlagOnBlocksWithLegacyMessageShapeForPreviousBusinessDayOpen() {
        LocalDate businessDate = LocalDate.of(2026, 1, 3);
        LocalDate unclosedDay = LocalDate.of(2026, 1, 1);
        stubOpenSessionPreconditions(1L, businessDate, "T1");
        when(businessDayFeatureFlagService.isLoginGateV2Enabled(1L)).thenReturn(true);
        when(businessDayValidationService.validate(any(), any(), any())).thenReturn(
                new com.billbull.backend.pos.businessdate.BusinessDayValidationResult(
                        businessDate, Optional.of(unclosedDay),
                        com.billbull.backend.pos.businessdate.BusinessDayValidationVerdict.BLOCK,
                        com.billbull.backend.pos.businessdate.BusinessDayBlockingReason.PREVIOUS_BUSINESS_DAY_OPEN));
        PosSession stale = sessionAt(99L, 1L, unclosedDay, "cashierZ", PosSessionStatus.OPEN,
                unclosedDay.atStartOfDay().plusHours(9));
        stale.setTerminalId("T-OLD");
        when(repo.findByBranchIdAndTradingDateOrderByOpenedAtDesc(1L, unclosedDay)).thenReturn(List.of(stale));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.openSession("T1", "Counter 1", bd("100")));

        assertEquals(org.springframework.http.HttpStatus.CONFLICT, ex.getStatusCode());
        assertTrue(ex.getReason().contains("PREVIOUS_DAY_SESSION_OPEN"));
        assertTrue(ex.getReason().contains("Session ID : 99"));
        assertTrue(ex.getReason().contains("T-OLD"));
        verify(businessDayStateService).recordEnforcementDecision(eq(1L), any());
    }

    @Test
    void openSessionFlagOnBlocksWithLegacyMessageShapeForBusinessDayAlreadyClosed() {
        LocalDate businessDate = LocalDate.of(2026, 1, 1);
        stubOpenSessionPreconditions(1L, businessDate, "T1");
        when(businessDayFeatureFlagService.isLoginGateV2Enabled(1L)).thenReturn(true);
        when(businessDayValidationService.validate(any(), any(), any())).thenReturn(
                new com.billbull.backend.pos.businessdate.BusinessDayValidationResult(
                        businessDate, Optional.empty(),
                        com.billbull.backend.pos.businessdate.BusinessDayValidationVerdict.BLOCK,
                        com.billbull.backend.pos.businessdate.BusinessDayBlockingReason.BUSINESS_DAY_ALREADY_CLOSED));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.openSession("T1", "Counter 1", bd("100")));

        assertEquals(org.springframework.http.HttpStatus.FORBIDDEN, ex.getStatusCode());
        assertEquals("Cannot open session: The business day has already been closed.", ex.getReason());
    }

    @Test
    void openSessionFlagOnFailsClosedForUnexpectedState() {
        LocalDate businessDate = LocalDate.of(2026, 1, 1);
        stubOpenSessionPreconditions(1L, businessDate, "T1");
        when(businessDayFeatureFlagService.isLoginGateV2Enabled(1L)).thenReturn(true);
        when(businessDayValidationService.validate(any(), any(), any())).thenReturn(
                new com.billbull.backend.pos.businessdate.BusinessDayValidationResult(
                        businessDate, Optional.of(businessDate.plusDays(3)),
                        com.billbull.backend.pos.businessdate.BusinessDayValidationVerdict.UNEXPECTED_STATE,
                        com.billbull.backend.pos.businessdate.BusinessDayBlockingReason.UNEXPECTED_STATE));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.openSession("T1", "Counter 1", bd("100")));

        assertEquals(org.springframework.http.HttpStatus.CONFLICT, ex.getStatusCode());
        assertTrue(ex.getReason().contains("BUSINESS_DAY_UNEXPECTED_STATE"));
        verify(repo, org.mockito.Mockito.never()).save(any(PosSession.class));
    }

    @Test
    void openSessionFlagOnFallsBackToLegacyGateOnRepositoryInfrastructureFailure() {
        LocalDate businessDate = LocalDate.of(2026, 1, 1);
        stubOpenSessionPreconditions(1L, businessDate, "T1");
        when(businessDayFeatureFlagService.isLoginGateV2Enabled(1L)).thenReturn(true);
        when(businessDayValidationService.validate(any(), any(), any()))
                .thenThrow(new com.billbull.backend.pos.businessdate.BusinessDayInfrastructureException(
                        com.billbull.backend.pos.businessdate.BusinessDayInfrastructureException.FailureCategory.REPOSITORY,
                        "dependency failure", new RuntimeException("timeout")));
        // Legacy fallback: no unclosed day -> allow.
        when(businessDayStateService.findUnclosedBusinessDay(1L)).thenReturn(Optional.empty());

        PosSession opened = service.openSession("T1", "Counter 1", bd("100"));

        assertEquals(PosSessionStatus.OPEN, opened.getStatus());
        verify(businessDayStateService).recordEnforcementFallback(
                eq(1L), eq(com.billbull.backend.pos.businessdate.BusinessDayInfrastructureException.FailureCategory.REPOSITORY),
                any());
    }

    @Test
    void openSessionFlagOnFallsBackToLegacyGateOnSettingsLookupFailure() {
        LocalDate businessDate = LocalDate.of(2026, 1, 1);
        stubOpenSessionPreconditions(1L, businessDate, "T1");
        when(businessDayFeatureFlagService.isLoginGateV2Enabled(1L)).thenReturn(true);
        // First posSettingsRepository call is the enforcement-path settings load (fails);
        // the method's own later idle/timeout settings read (unrelated to this phase)
        // must still succeed once the legacy fallback allows the session to proceed.
        when(posSettingsRepository.findByBranchId(1L))
                .thenThrow(new RuntimeException("settings datasource down"))
                .thenReturn(Optional.empty());
        when(businessDayStateService.findUnclosedBusinessDay(1L)).thenReturn(Optional.empty());

        PosSession opened = service.openSession("T1", "Counter 1", bd("100"));

        assertEquals(PosSessionStatus.OPEN, opened.getStatus());
        verify(businessDayStateService).recordEnforcementFallback(
                eq(1L), eq(com.billbull.backend.pos.businessdate.BusinessDayInfrastructureException.FailureCategory.SETTINGS),
                any());
        // The engine's validate() must never have been reached — settings load failed first.
        verify(businessDayValidationService, org.mockito.Mockito.never()).validate(any(), any(), any());
    }

    @Test
    void openSessionFlagOnFallbackStillBlocksWhenLegacyGateWouldBlock() {
        // Proves the fallback is a real re-evaluation, not a silent allow: the new
        // engine fails, and the legacy gate it falls back to also says block.
        LocalDate businessDate = LocalDate.of(2026, 1, 3);
        LocalDate unclosedDay = LocalDate.of(2026, 1, 1);
        stubOpenSessionPreconditions(1L, businessDate, "T1");
        when(businessDayFeatureFlagService.isLoginGateV2Enabled(1L)).thenReturn(true);
        when(businessDayValidationService.validate(any(), any(), any()))
                .thenThrow(new com.billbull.backend.pos.businessdate.BusinessDayInfrastructureException(
                        com.billbull.backend.pos.businessdate.BusinessDayInfrastructureException.FailureCategory.UNEXPECTED,
                        "boom", new RuntimeException()));
        when(businessDayStateService.findUnclosedBusinessDay(1L)).thenReturn(Optional.of(unclosedDay));
        PosSession stale = sessionAt(77L, 1L, unclosedDay, "cashierX", PosSessionStatus.OPEN,
                unclosedDay.atStartOfDay().plusHours(9));
        when(repo.findByBranchIdAndTradingDateOrderByOpenedAtDesc(1L, unclosedDay)).thenReturn(List.of(stale));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.openSession("T1", "Counter 1", bd("100")));

        assertEquals(org.springframework.http.HttpStatus.CONFLICT, ex.getStatusCode());
        assertTrue(ex.getReason().contains("PREVIOUS_DAY_SESSION_OPEN"));
        verify(businessDayStateService).recordEnforcementFallback(
                eq(1L), eq(com.billbull.backend.pos.businessdate.BusinessDayInfrastructureException.FailureCategory.UNEXPECTED),
                any());
    }

    @Test
    void openSessionFlagLookupFailureDefaultsToLegacyGate() {
        LocalDate businessDate = LocalDate.of(2026, 1, 1);
        stubOpenSessionPreconditions(1L, businessDate, "T1");
        when(businessDayFeatureFlagService.isLoginGateV2Enabled(1L)).thenThrow(new RuntimeException("flag lookup failed"));
        when(businessDayStateService.findUnclosedBusinessDay(1L)).thenReturn(Optional.empty());

        PosSession opened = service.openSession("T1", "Counter 1", bd("100"));

        assertEquals(PosSessionStatus.OPEN, opened.getStatus());
        // Flag lookup failure defaults to OFF (legacy-primary) — Shadow Validation
        // still runs on that path exactly as it does for any other OFF branch, so
        // businessDayValidationService.validate() IS still called here; what must
        // never happen is the flag defaulting to true/enforcement mode.
        verify(businessDayStateService).recordFeatureFlagRequest(1L, false);
        verify(businessDayStateService, org.mockito.Mockito.never()).recordEnforcementDecision(anyLong(), any());
    }

    @Test
    void openSessionCreatesExactlyOneHostingSegment() {
        LocalDate businessDate = LocalDate.of(2026, 1, 1);
        stubOpenSessionPreconditions(1L, businessDate, "T1");
        com.billbull.backend.pos.terminal.PosTerminal terminal = terminal(99L, 5L, "Counter 1");
        when(terminalRepository.findByTerminalId("T1")).thenReturn(Optional.of(terminal));
        when(terminalRepository.setOpenSession(eq(99L), any())).thenReturn(1);
        org.mockito.ArgumentCaptor<PosSessionTerminalHistory> captor =
                org.mockito.ArgumentCaptor.forClass(PosSessionTerminalHistory.class);
        when(sessionTerminalHistoryRepository.save(captor.capture())).thenAnswer(inv -> inv.getArgument(0));

        PosSession opened = service.openSession("T1", "Counter 1", bd("100"));

        assertEquals(PosSessionStatus.OPEN, opened.getStatus());
        verify(sessionTerminalHistoryRepository, org.mockito.Mockito.times(1)).save(any());
        assertEquals(99L, captor.getValue().getTerminalId());
        assertEquals(java.util.List.of(99L),
                captor.getAllValues().stream().map(PosSessionTerminalHistory::getTerminalId).toList());
    }

    @Test
    void openSessionStampsOwnerUserId() {
        LocalDate businessDate = LocalDate.of(2026, 1, 1);
        stubOpenSessionPreconditions(1L, businessDate, "T1");
        when(sessionTerminalHistoryRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        com.billbull.backend.common.ownership.OwnershipContextHolder.set(
                new com.billbull.backend.common.ownership.OwnershipContextHolder.OwnershipContext(42L, false));

        PosSession opened = service.openSession("T1", "Counter 1", bd("100"));

        assertEquals(42L, opened.getOwnerUserId());
    }

    @Test
    void openSessionHandsBackExistingSessionWithoutDuplicateHostingSegment() {
        // Pin the authenticated principal explicitly (rather than relying on the
        // unauthenticated-context "system" fallback) since other test classes running earlier
        // in the same forked JVM can leave a stale Authentication in the shared
        // SecurityContextHolder ThreadLocal; clearOwnershipContext() resets it afterward.
        org.springframework.security.core.context.SecurityContextHolder.getContext().setAuthentication(
                new org.springframework.security.authentication.UsernamePasswordAuthenticationToken(
                        "cashier1", null, List.of()));
        LocalDate businessDate = LocalDate.of(2026, 1, 1);
        when(branchAccessService.getRequiredCurrentUserBranch()).thenReturn(branch(1L));
        when(businessDateService.getCurrentBusinessDate(1L)).thenReturn(businessDate);
        // Gate operands are the Candidate Business Day (today), not the pointer.
        when(businessDateService.isDateClosed(1L, LocalDate.now())).thenReturn(false);
        when(repo.findUnclosedSessionsBeforeDate(1L, LocalDate.now())).thenReturn(List.of());
        PosSession existing = openSession();
        existing.setOpenedBy("cashier1");
        when(repo.findByBranchIdAndTerminalIdAndStatus(1L, "T1", PosSessionStatus.OPEN))
                .thenReturn(Optional.of(existing));

        PosSession result = service.openSession("T1", "Counter 1", bd("100"));

        assertEquals(existing, result);
        verify(sessionTerminalHistoryRepository, org.mockito.Mockito.never()).save(any());
    }

    // ---------------------------------------------------------------------
    // Session Roaming Phase 7 — discovery-blocked openSession() cases
    // ---------------------------------------------------------------------

    @Test
    void openSessionBlocksWithOwnerSessionResponse_whenUserOwnsOpenSessionOnAnotherTerminal() {
        LocalDate businessDate = LocalDate.of(2026, 1, 1);
        stubOpenSessionPreconditions(1L, businessDate, "T1");
        com.billbull.backend.common.ownership.OwnershipContextHolder.set(
                new com.billbull.backend.common.ownership.OwnershipContextHolder.OwnershipContext(42L, false));
        PosSession elsewhere = openSession();
        elsewhere.setId(7L);
        elsewhere.setTerminalId("T2");
        elsewhere.setOwnerUserId(42L);
        when(repo.findByOwnerUserIdAndStatus(42L, PosSessionStatus.OPEN)).thenReturn(List.of(elsewhere));

        PosSessionDiscoveryBlockedException ex = assertThrows(PosSessionDiscoveryBlockedException.class,
                () -> service.openSession("T1", "Counter 1", bd("100")));

        assertEquals(PosSessionDiscoveryStatus.OWNER_SESSION, ex.getResponse().getStatus());
        assertEquals(7L, ex.getResponse().getOwnerSessionId());
        assertEquals("T2", ex.getResponse().getOwnerSessionTerminalId());
        verify(repo, org.mockito.Mockito.never()).save(any(PosSession.class));
    }

    @Test
    void openSessionBlocksWithConflictResponse_whenTerminalHasDifferentSessionThanOwners() {
        LocalDate businessDate = LocalDate.of(2026, 1, 1);
        stubOpenSessionPreconditions(1L, businessDate, "T1");
        com.billbull.backend.common.ownership.OwnershipContextHolder.set(
                new com.billbull.backend.common.ownership.OwnershipContextHolder.OwnershipContext(42L, false));
        PosSession terminalSession = openSession();
        terminalSession.setId(8L);
        terminalSession.setTerminalId("T1");
        terminalSession.setOpenedBy("otherCashier");
        when(repo.findByBranchIdAndTerminalIdAndStatus(1L, "T1", PosSessionStatus.OPEN))
                .thenReturn(Optional.of(terminalSession));
        PosSession elsewhere = openSession();
        elsewhere.setId(9L);
        elsewhere.setTerminalId("T2");
        elsewhere.setOwnerUserId(42L);
        when(repo.findByOwnerUserIdAndStatus(42L, PosSessionStatus.OPEN)).thenReturn(List.of(elsewhere));

        PosSessionDiscoveryBlockedException ex = assertThrows(PosSessionDiscoveryBlockedException.class,
                () -> service.openSession("T1", "Counter 1", bd("100")));

        assertEquals(PosSessionDiscoveryStatus.CONFLICT, ex.getResponse().getStatus());
        assertEquals(8L, ex.getResponse().getTerminalSessionId());
        assertEquals(9L, ex.getResponse().getOwnerSessionId());
        verify(repo, org.mockito.Mockito.never()).save(any(PosSession.class));
    }

    @Test
    void openSessionBlocksWithMultipleOwnerSessionsResponse_refusingToGuess() {
        LocalDate businessDate = LocalDate.of(2026, 1, 1);
        stubOpenSessionPreconditions(1L, businessDate, "T1");
        com.billbull.backend.common.ownership.OwnershipContextHolder.set(
                new com.billbull.backend.common.ownership.OwnershipContextHolder.OwnershipContext(42L, false));
        PosSession first = openSession();
        first.setId(10L);
        first.setOwnerUserId(42L);
        PosSession second = openSession();
        second.setId(11L);
        second.setOwnerUserId(42L);
        when(repo.findByOwnerUserIdAndStatus(42L, PosSessionStatus.OPEN)).thenReturn(List.of(first, second));

        PosSessionDiscoveryBlockedException ex = assertThrows(PosSessionDiscoveryBlockedException.class,
                () -> service.openSession("T1", "Counter 1", bd("100")));

        assertEquals(PosSessionDiscoveryStatus.MULTIPLE_OWNER_SESSIONS, ex.getResponse().getStatus());
        assertEquals(2, ex.getResponse().getOwnerSessionCount());
        verify(repo, org.mockito.Mockito.never()).save(any(PosSession.class));
    }

    @Test
    void closeSessionClosesTheOpenHostingSegment() {
        PosSession session = openSession();
        when(repo.findById(1L)).thenReturn(Optional.of(session));
        when(invoiceRepo.findByPosSessionIdWithItems(1L)).thenReturn(List.of());
        PosSessionTerminalHistory openSegment = new PosSessionTerminalHistory();
        when(sessionTerminalHistoryRepository.findFirstBySessionIdAndEndedAtIsNullOrderByStartedAtDesc(1L))
                .thenReturn(Optional.of(openSegment));
        when(sessionTerminalHistoryRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        service.closeSession(1L, bd("0"), "eod");

        assertTrue(openSegment.getEndedAt() != null);
        verify(sessionTerminalHistoryRepository).save(openSegment);
    }

    @Test
    void resumeSessionDoesNotDuplicateHostingSegmentOnSameTerminal() {
        PosSession session = openSession();
        session.setId(2L);
        session.setStatus(PosSessionStatus.SUSPENDED);
        session.setTerminalId("T1");
        when(repo.findById(2L)).thenReturn(Optional.of(session));
        com.billbull.backend.pos.terminal.PosTerminal terminal = terminal(99L, 5L, "Counter 1");
        when(terminalRepository.findByTerminalId("T1")).thenReturn(Optional.of(terminal));
        PosSessionTerminalHistory openSegment = new PosSessionTerminalHistory();
        openSegment.setTerminalId(99L);
        when(sessionTerminalHistoryRepository.findFirstBySessionIdAndEndedAtIsNullOrderByStartedAtDesc(2L))
                .thenReturn(Optional.of(openSegment));

        PosSession resumed = service.resumeSession(2L);

        assertEquals(PosSessionStatus.OPEN, resumed.getStatus());
        verify(sessionTerminalHistoryRepository, org.mockito.Mockito.never()).save(any());
    }

    @Test
    void terminalReassignmentClosesOldSegmentAndOpensNewOne() {
        // Exercises PosTerminalHostingService#ensureHostingSegment directly, the single place
        // that would drive a hosting-terminal change if/when a later phase adds a transfer flow.
        com.billbull.backend.pos.terminal.PosTerminalHostingService terminalHostingService =
                new com.billbull.backend.pos.terminal.PosTerminalHostingService(terminalRepository, sessionTerminalHistoryRepository);
        PosSession session = openSession();
        session.setId(3L);
        com.billbull.backend.pos.terminal.PosTerminal newTerminal = terminal(200L, 6L, "Counter 2");
        PosSessionTerminalHistory openSegment = new PosSessionTerminalHistory();
        openSegment.setTerminalId(99L);
        when(sessionTerminalHistoryRepository.findFirstBySessionIdAndEndedAtIsNullOrderByStartedAtDesc(3L))
                .thenReturn(Optional.of(openSegment));
        when(sessionTerminalHistoryRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        PosSessionTerminalHistory result = terminalHostingService.ensureHostingSegment(session, newTerminal);

        assertTrue(openSegment.getEndedAt() != null);
        assertEquals(200L, result.getTerminalId());
        assertTrue(result.getEndedAt() == null);
    }

    // ---------------------------------------------------------------------
    // closeSession() — expected cash + cash difference
    // ---------------------------------------------------------------------

    @Test
    void closeSessionComputesExpectedCashAndDifference() {
        PosSession session = openSession();
        session.setOpeningCash(bd("100"));
        session.getCashMovements().add(cashMovement(PosCashMovementType.DROP_IN, bd("50")));
        session.getCashMovements().add(cashMovement(PosCashMovementType.DROP_OUT, bd("20")));
        when(repo.findById(1L)).thenReturn(java.util.Optional.of(session));
        // closeSession() now derives expected cash from actual cash tender collected
        // (same formula as getXReport()), not the session.totalCashSales counter.
        when(invoiceRepo.findByPosSessionIdWithItems(1L)).thenReturn(List.of(invoiceWithTax(250.0, 0.0)));
        when(paymentRepository.sumTenderByModeForInvoices(any()))
                .thenReturn(List.<Object[]>of(new Object[]{ "Cash", bd("250"), 1L }));

        // expected = opening(100) + cashTender(250) + (dropIn 50 - dropOut 20) = 380
        PosSession closed = service.closeSession(1L, bd("400"), "ok");

        assertMoney("380", closed.getExpectedCash());
        // over by 20
        assertMoney("20", closed.getCashDifference());
        assertMoney("400", closed.getClosingCash());
        assertEquals(PosSessionStatus.CLOSED, closed.getStatus());
    }

    @Test
    @SuppressWarnings("unchecked")
    void closeSessionAndXReportAgreeOnExpectedCashForNonStandardPaymentMode() {
        // Regression test for the modal/X-Report desync: a payment mode that isn't a
        // literal "cash"/"card"/"credit" match (e.g. a voucher tender row) must still
        // produce the SAME expected cash from closeSession() and getXReport(), since
        // both now share computeExpectedCash()/aggregateTender() instead of diverging
        // (one via the session.totalCashSales counter, the other via a live query).
        PosSession session = openSession();
        session.setOpeningCash(bd("100"));
        session.getCashMovements().add(cashMovement(PosCashMovementType.DROP_IN, bd("50")));
        session.getCashMovements().add(cashMovement(PosCashMovementType.DROP_OUT, bd("20")));
        when(repo.findById(1L)).thenReturn(java.util.Optional.of(session));
        when(invoiceRepo.findByPosSessionIdWithItems(1L)).thenReturn(List.of(invoiceWithTax(250.0, 0.0)));
        when(paymentRepository.sumTenderByModeForInvoices(any()))
                .thenReturn(List.<Object[]>of(new Object[]{ "Cash", bd("250"), 1L }));

        Map<String, Object> report = service.getXReport(1L);
        Map<String, Object> summary = (Map<String, Object>) report.get("summary");
        PosSession closed = service.closeSession(1L, bd("400"), "ok");

        assertMoney("380", (BigDecimal) summary.get("expectedCash"));
        assertMoney("380", closed.getExpectedCash());
    }

    @Test
    void closeSessionTreatsNullMoneyFieldsAsZero() {
        PosSession session = openSession();
        session.setOpeningCash(null);
        session.setTotalCashSales(null);
        // no cash movements
        when(repo.findById(1L)).thenReturn(java.util.Optional.of(session));

        PosSession closed = service.closeSession(1L, null, null);

        // opening(0) + cashSales(0) + net(0) = 0
        assertMoney("0", closed.getExpectedCash());
        // closingCash null -> coalesced to 0, and difference 0 when closing null
        assertMoney("0", closed.getClosingCash());
        assertMoney("0", closed.getCashDifference());
    }

    @Test
    void closeSessionShortfallIsNegativeDifference() {
        PosSession session = openSession();
        session.setOpeningCash(bd("100"));
        session.setTotalCashSales(bd("0"));
        when(repo.findById(1L)).thenReturn(java.util.Optional.of(session));

        PosSession closed = service.closeSession(1L, bd("90"), null);

        assertMoney("100", closed.getExpectedCash());
        // counted 90 against expected 100 -> short by 10
        assertMoney("-10", closed.getCashDifference());
        assertTrue(closed.getCashDifference().signum() < 0, "shortfall must be negative");
    }

    // ---------------------------------------------------------------------
    // recordInvoiceOnSession() — payment-mode classification + accumulation
    // ---------------------------------------------------------------------

    // recordInvoiceOnSession now uses an atomic SQL UPDATE (incrementSessionTotals)
    // instead of load-then-save to avoid hot-row contention at checkout throughput.
    // Tests verify that the correct deltas are passed to the repository method.

    @Test
    void recordInvoiceClassifiesCashSale() {
        lenient().when(repo.incrementSessionTotals(anyLong(), any(), any(), any(), any(), any(), any(), anyInt())).thenReturn(1);

        service.recordInvoiceOnSession(1L, invoice(105.0, "Cash"));

        verify(repo).incrementSessionTotals(
                eq(1L),
                eq(bd("105.0")),  // totalSales
                eq(bd("105.0")),  // cashDelta
                eq(BigDecimal.ZERO),  // cardDelta
                eq(BigDecimal.ZERO),  // creditDelta
                eq(BigDecimal.ZERO),  // mixedDelta
                eq(BigDecimal.ZERO),  // onlineDelta
                eq(0));               // voidDelta
    }

    @Test
    void recordInvoiceClassifiesMixedWhenCashAndCard() {
        lenient().when(repo.incrementSessionTotals(anyLong(), any(), any(), any(), any(), any(), any(), anyInt())).thenReturn(1);

        service.recordInvoiceOnSession(1L, invoice(200.0, "Cash + Card"));

        verify(repo).incrementSessionTotals(
                eq(1L),
                eq(bd("200.0")),
                eq(BigDecimal.ZERO),  // cashDelta
                eq(BigDecimal.ZERO),  // cardDelta
                eq(BigDecimal.ZERO),  // creditDelta
                eq(bd("200.0")),      // mixedDelta
                eq(BigDecimal.ZERO),  // onlineDelta
                eq(0));               // voidDelta
    }

    @Test
    void recordInvoiceClassifiesCreditSale() {
        lenient().when(repo.incrementSessionTotals(anyLong(), any(), any(), any(), any(), any(), any(), anyInt())).thenReturn(1);

        service.recordInvoiceOnSession(1L, invoice(75.0, "Credit"));

        verify(repo).incrementSessionTotals(
                eq(1L),
                eq(bd("75.0")),
                eq(BigDecimal.ZERO),  // cashDelta
                eq(BigDecimal.ZERO),  // cardDelta
                eq(bd("75.0")),       // creditDelta
                eq(BigDecimal.ZERO),  // mixedDelta
                eq(BigDecimal.ZERO),  // onlineDelta
                eq(0));               // voidDelta
    }

    @Test
    void recordInvoiceUnknownModeFallsBackToCash() {
        lenient().when(repo.incrementSessionTotals(anyLong(), any(), any(), any(), any(), any(), any(), anyInt())).thenReturn(1);

        service.recordInvoiceOnSession(1L, invoice(33.0, "Voucher"));

        verify(repo).incrementSessionTotals(
                eq(1L),
                eq(bd("33.0")),
                eq(bd("33.0")),       // falls back to cashDelta
                eq(BigDecimal.ZERO),
                eq(BigDecimal.ZERO),
                eq(BigDecimal.ZERO),
                eq(BigDecimal.ZERO),  // onlineDelta
                eq(0));               // voidDelta
    }

    @Test
    void recordInvoiceAccumulatesAcrossInvoices() {
        lenient().when(repo.incrementSessionTotals(anyLong(), any(), any(), any(), any(), any(), any(), anyInt())).thenReturn(1);

        service.recordInvoiceOnSession(1L, invoice(100.25, "Cash"));
        service.recordInvoiceOnSession(1L, invoice(50.50, "Cash"));

        // Two separate atomic increments — each fires one UPDATE.
        verify(repo, org.mockito.Mockito.times(2))
                .incrementSessionTotals(anyLong(), any(), any(), any(), any(), any(), any(), anyInt());
    }

    @Test
    void recordInvoiceDoesNothingForNullSession() {
        // Null sessionId — no DB call should be made.
        service.recordInvoiceOnSession(null, invoice(100.0, "Cash"));
        verify(repo, org.mockito.Mockito.never())
                .incrementSessionTotals(anyLong(), any(), any(), any(), any(), any(), any(), anyInt());
    }

    // ---------------------------------------------------------------------
    // getXReport() — derived figures, clamping, drop netting
    // ---------------------------------------------------------------------

    @Test
    @SuppressWarnings("unchecked")
    void xReportDerivesExpectedCashAndExTaxClamped() {
        PosSession session = openSession();
        session.setOpeningCash(bd("100"));
        session.setTotalSales(bd("500"));
        session.setTotalCashSales(bd("300"));
        session.getCashMovements().add(cashMovement(PosCashMovementType.DROP_IN, bd("40")));
        session.getCashMovements().add(cashMovement(PosCashMovementType.DROP_OUT, bd("10")));
        when(repo.findById(1L)).thenReturn(java.util.Optional.of(session));
        when(invoiceRepo.findByPosSessionIdWithItems(1L)).thenReturn(List.of(invoiceWithTax(500.0, 25.0)));
        // Expected cash now derives from ACTUAL cash tender collected, not the session
        // counter — stub 300 of cash tender for this session's invoice.
        when(paymentRepository.sumTenderByModeForInvoices(any()))
                .thenReturn(List.<Object[]>of(new Object[]{ "Cash", bd("300"), 1L }));

        Map<String, Object> result = service.getXReport(1L);
        Map<String, Object> summary = (Map<String, Object>) result.get("summary");

        // expectedCash = opening(100) + cashTender(300) + net(40-10=30) = 430
        assertMoney("430", (BigDecimal) summary.get("expectedCash"));
        assertMoney("300", (BigDecimal) summary.get("cashSales"));
        assertMoney("40", (BigDecimal) summary.get("cashDropIn"));
        assertMoney("10", (BigDecimal) summary.get("cashDropOut"));
        assertMoney("25", (BigDecimal) summary.get("totalTax"));
        // salesAmountExTax = max(0, 500 - 25) = 475 (invoice total, net of voids)
        assertMoney("475", (BigDecimal) summary.get("salesAmountExTax"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void xReportClampsNegativeExTaxToZero() {
        PosSession session = openSession();
        session.setTotalSales(bd("10"));
        when(repo.findById(1L)).thenReturn(java.util.Optional.of(session));
        // tax greater than total sales (degenerate, but the clamp must hold)
        when(invoiceRepo.findByPosSessionIdWithItems(1L)).thenReturn(List.of(invoiceWithTax(10.0, 30.0)));

        Map<String, Object> result = service.getXReport(1L);
        Map<String, Object> summary = (Map<String, Object>) result.get("summary");

        // salesAmountExTax = max(0, 10 - 30) = 0
        assertMoney("0", (BigDecimal) summary.get("salesAmountExTax"));
    }

    // ---------------------------------------------------------------------
    // getXReport() — session isolation (BBQA X-Report leak fix)
    // ---------------------------------------------------------------------

    @Test
    @SuppressWarnings("unchecked")
    void xReportExcludesReturnsLinkedToAnotherSessionsInvoiceSameBranchAndDay() {
        // Regression test: cashier closes session #1 on Device A (INV-A-1), then opens
        // session #2 on Device B and rings INV-B-1. Sales Return rows carry no
        // posSessionId (only branch+date), so a return posted against the OLD session's
        // invoice (INV-A-1) must not bleed into the NEW session's X-Report.
        PosSession session = openSession();
        session.setId(2L);
        when(repo.findById(2L)).thenReturn(java.util.Optional.of(session));
        SalesInvoice ownInvoice = invoiceWithNumber("INV-B-1", 100.0, 0.0);
        when(invoiceRepo.findByPosSessionIdWithItems(2L)).thenReturn(List.of(ownInvoice));

        SalesReturn otherSessionReturn = salesReturn("INV-A-1", SalesReturnStatus.APPROVED, "Refund", 40.0);
        SalesReturn ownSessionReturn = salesReturn("INV-B-1", SalesReturnStatus.APPROVED, "Refund", 15.0);
        when(returnRepository.findByReturnDateAndBranchWithItems(any(), any()))
                .thenReturn(List.of(otherSessionReturn, ownSessionReturn));

        Map<String, Object> result = service.getXReport(2L);
        Map<String, Object> summary = (Map<String, Object>) result.get("summary");

        assertEquals(1, summary.get("salesReturnCount"));
        assertMoney("15", (BigDecimal) summary.get("salesReturnTotal"));
        assertEquals(1, summary.get("refundCount"));
        assertMoney("15", (BigDecimal) summary.get("refundTotal"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void xReportIsolatesConcurrentCashiersOnSameBranchAndDay() {
        // Cashier A (session #1) and Cashier B (session #2) both have OPEN sessions on
        // the same branch+day. A return is posted against Cashier B's invoice while
        // Cashier A's X-Report is generated — it must not appear in Cashier A's report,
        // regardless of which cashier closes/reports first.
        PosSession sessionA = openSession();
        sessionA.setId(1L);
        sessionA.setOpenedBy("cashierA");
        when(repo.findById(1L)).thenReturn(java.util.Optional.of(sessionA));

        SalesInvoice invoiceA = invoiceWithNumber("INV-A-1", 200.0, 0.0);
        when(invoiceRepo.findByPosSessionIdWithItems(1L)).thenReturn(List.of(invoiceA));

        SalesReturn returnForCashierB = salesReturn("INV-B-1", SalesReturnStatus.APPROVED, "Credit Note", 60.0);
        when(returnRepository.findByReturnDateAndBranchWithItems(any(), any()))
                .thenReturn(List.of(returnForCashierB));

        Map<String, Object> result = service.getXReport(1L);
        Map<String, Object> summary = (Map<String, Object>) result.get("summary");

        assertEquals(0, summary.get("salesReturnCount"));
        assertMoney("0", (BigDecimal) summary.get("salesReturnTotal"));
        assertEquals(0, summary.get("creditNoteCount"));
        assertMoney("0", (BigDecimal) summary.get("creditNoteTotal"));
    }

    // ---------------------------------------------------------------------
    // getZReport() — cross-session aggregation
    // ---------------------------------------------------------------------

    @Test
    @SuppressWarnings("unchecked")
    void zReportAggregatesAcrossSessions() {
        // Z-Report only aggregates CLOSED sessions (generateDynamicZReport filters on
        // PosSessionStatus.CLOSED) — openSession() defaults to OPEN, so override here.
        PosSession s1 = openSession();
        s1.setStatus(PosSessionStatus.CLOSED);
        s1.setTotalSales(bd("200"));
        s1.setTotalCashSales(bd("120"));
        s1.setInvoiceCount(2);
        PosSession s2 = openSession();
        s2.setId(2L);
        s2.setStatus(PosSessionStatus.CLOSED);
        s2.setTotalSales(bd("100"));
        s2.setTotalCashSales(bd("80"));
        s2.setInvoiceCount(1);

        when(repo.findByBranchIdAndTradingDateOrderByOpenedAtDesc(anyLong(), any(LocalDate.class)))
                .thenReturn(List.of(s1, s2));
        when(invoiceRepo.findByBranchIdAndPosSessionIdInWithItems(anyLong(), any()))
                .thenReturn(List.of(invoiceWithTax(200.0, 10.0), invoiceWithTax(100.0, 5.0)));
        // totalSales now sums invoice rows (net of voids); cashSales is actual tender.
        when(paymentRepository.sumTenderByModeForInvoices(any()))
                .thenReturn(List.<Object[]>of(new Object[]{ "Cash", bd("200"), 2L }));

        Map<String, Object> result = service.getZReport(7L, LocalDate.now());
        Map<String, Object> summary = (Map<String, Object>) result.get("summary");

        assertMoney("300", (BigDecimal) summary.get("totalSales"));   // 200 + 100 (invoices)
        assertMoney("200", (BigDecimal) summary.get("cashSales"));     // actual cash tender
        assertEquals(3, summary.get("invoiceCount"));                  // 2 + 1
        assertEquals(2, summary.get("sessionCount"));
        assertMoney("15", (BigDecimal) summary.get("totalTax"));       // 10 + 5
        assertMoney("285", (BigDecimal) summary.get("salesAmountExTax")); // max(0, 300 - 15)
    }

    // ---------------------------------------------------------------------
    // Day Close session-range resolution (ARCHFIX: unified resolution + SUSPENDED gap)
    // ---------------------------------------------------------------------

    @Test
    void closeDayBlocksOnSuspendedSession() {
        // Previously SUSPENDED sessions neither blocked close nor appeared in the
        // report — they were silently dropped. Must now behave like OPEN: block.
        Long branchId = 7L;
        LocalDate date = LocalDate.now();
        PosSession closed = sessionAt(1L, branchId, date, "cashierA", PosSessionStatus.CLOSED, date.atStartOfDay().plusHours(9));
        PosSession suspended = sessionAt(2L, branchId, date, "cashierB", PosSessionStatus.SUSPENDED, date.atStartOfDay().plusHours(10));

        when(dayCloseRepository.existsByBranchIdAndCloseDate(branchId, date)).thenReturn(false);
        when(branchRepository.findById(branchId)).thenReturn(Optional.of(branch(branchId)));
        when(repo.findByBranchIdAndTradingDateOrderByOpenedAtDesc(branchId, date)).thenReturn(List.of(suspended, closed));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.closeDay(branchId, date));

        assertTrue(ex.getReason().contains("suspended"), () -> "expected suspended-session message, got: " + ex.getReason());
    }

    @Test
    void closeDayBlocksOnOpenSession() {
        Long branchId = 7L;
        LocalDate date = LocalDate.now();
        PosSession open = sessionAt(1L, branchId, date, "cashierA", PosSessionStatus.OPEN, date.atStartOfDay().plusHours(9));

        when(dayCloseRepository.existsByBranchIdAndCloseDate(branchId, date)).thenReturn(false);
        when(branchRepository.findById(branchId)).thenReturn(Optional.of(branch(branchId)));
        when(repo.findByBranchIdAndTradingDateOrderByOpenedAtDesc(branchId, date)).thenReturn(List.of(open));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.closeDay(branchId, date));

        assertTrue(ex.getReason().contains("open"), () -> "expected open-session message, got: " + ex.getReason());
    }

    @Test
    void closeDayNarrowedRangeExcludingEligibleSessionRequiresAcknowledgement() {
        Long branchId = 7L;
        LocalDate date = LocalDate.now();
        PosSession s1 = sessionAt(1L, branchId, date, "cashierA", PosSessionStatus.CLOSED, date.atStartOfDay().plusHours(8));
        PosSession s2 = sessionAt(2L, branchId, date, "cashierB", PosSessionStatus.CLOSED, date.atStartOfDay().plusHours(10));
        PosSession s3 = sessionAt(3L, branchId, date, "cashierC", PosSessionStatus.CLOSED, date.atStartOfDay().plusHours(12));

        when(dayCloseRepository.existsByBranchIdAndCloseDate(branchId, date)).thenReturn(false);
        when(branchRepository.findById(branchId)).thenReturn(Optional.of(branch(branchId)));
        when(repo.findByBranchIdAndTradingDateOrderByOpenedAtDesc(branchId, date)).thenReturn(List.of(s3, s2, s1));
        when(repo.findById(1L)).thenReturn(Optional.of(s1));
        when(repo.findById(2L)).thenReturn(Optional.of(s2));

        // Narrow the range to [s1, s2] — s3 falls outside and must be flagged, not
        // silently dropped from the day's audit trail.
        SessionRangeExclusionException ex = assertThrows(SessionRangeExclusionException.class,
                () -> service.closeDay(branchId, date, 1L, 2L, false));

        assertEquals(1, ex.getDetails().get("excludedSessionCount"));
    }

    @Test
    void closeDayStartAfterEndIsRejected() {
        Long branchId = 7L;
        LocalDate date = LocalDate.now();
        PosSession s1 = sessionAt(1L, branchId, date, "cashierA", PosSessionStatus.CLOSED, date.atStartOfDay().plusHours(8));
        PosSession s2 = sessionAt(2L, branchId, date, "cashierB", PosSessionStatus.CLOSED, date.atStartOfDay().plusHours(10));

        when(dayCloseRepository.existsByBranchIdAndCloseDate(branchId, date)).thenReturn(false);
        when(branchRepository.findById(branchId)).thenReturn(Optional.of(branch(branchId)));
        when(repo.findByBranchIdAndTradingDateOrderByOpenedAtDesc(branchId, date)).thenReturn(List.of(s2, s1));
        when(repo.findById(1L)).thenReturn(Optional.of(s1));
        when(repo.findById(2L)).thenReturn(Optional.of(s2));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.closeDay(branchId, date, 2L, 1L, false));

        assertTrue(ex.getReason().contains("Start session must occur before End session"));
    }

    @Test
    void closeDayBoundarySessionFromDifferentBranchIsRejected() {
        Long branchId = 7L;
        LocalDate date = LocalDate.now();
        PosSession s1 = sessionAt(1L, branchId, date, "cashierA", PosSessionStatus.CLOSED, date.atStartOfDay().plusHours(8));
        PosSession otherBranch = sessionAt(9L, 99L, date, "cashierZ", PosSessionStatus.CLOSED, date.atStartOfDay().plusHours(9));

        when(dayCloseRepository.existsByBranchIdAndCloseDate(branchId, date)).thenReturn(false);
        when(branchRepository.findById(branchId)).thenReturn(Optional.of(branch(branchId)));
        when(repo.findByBranchIdAndTradingDateOrderByOpenedAtDesc(branchId, date)).thenReturn(List.of(s1));
        when(repo.findById(9L)).thenReturn(Optional.of(otherBranch));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.closeDay(branchId, date, 9L, 1L, false));

        assertTrue(ex.getReason().contains("does not belong to branch"));
    }

    /** Day Close domain must use tradingDate exclusively — a session whose sessionDate
     *  happens to match the requested date but whose tradingDate does not (e.g. a
     *  historical row from before this field existed, or a lagging Business Date
     *  pointer) must still be rejected as a boundary, proving resolveBoundarySession
     *  really switched fields rather than accepting either. */
    @Test
    void closeDayBoundarySessionWithMatchingSessionDateButMismatchedTradingDateIsRejected() {
        Long branchId = 7L;
        LocalDate date = LocalDate.now();
        PosSession inRange = sessionAt(2L, branchId, date, "cashierB", PosSessionStatus.CLOSED, date.atStartOfDay().plusHours(9));
        PosSession mismatched = sessionAt(1L, branchId, date, "cashierA", PosSessionStatus.CLOSED, date.atStartOfDay().plusHours(8));
        // sessionDate matches the requested date, but tradingDate does not.
        mismatched.setTradingDate(date.minusDays(3));

        when(dayCloseRepository.existsByBranchIdAndCloseDate(branchId, date)).thenReturn(false);
        when(branchRepository.findById(branchId)).thenReturn(Optional.of(branch(branchId)));
        when(repo.findByBranchIdAndTradingDateOrderByOpenedAtDesc(branchId, date)).thenReturn(List.of(inRange));
        when(repo.findById(1L)).thenReturn(Optional.of(mismatched));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.closeDay(branchId, date, 1L, 2L, false));

        assertTrue(ex.getReason().contains("does not belong to business date"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void dayCloseSummaryAutoResolvesFirstAndLastAndAggregatesFields() {
        Long branchId = 7L;
        LocalDate date = LocalDate.now();
        PosSession s1 = sessionAt(1L, branchId, date, "cashierA", PosSessionStatus.OPEN, date.atStartOfDay().plusHours(8));
        s1.setCounterName("Counter-1");
        s1.setTerminalId("T-1");
        PosSession s2 = sessionAt(2L, branchId, date, "cashierB", PosSessionStatus.CLOSED, date.atStartOfDay().plusHours(11));
        s2.setCounterName("Counter-2");
        s2.setTerminalId("T-2");

        when(repo.findByBranchIdAndTradingDateOrderByOpenedAtDesc(branchId, date)).thenReturn(List.of(s2, s1));

        Map<String, Object> summary = service.getDayCloseSummary(branchId, date, null, null);

        assertEquals(1L, summary.get("startSessionId"));
        assertEquals(2L, summary.get("endSessionId"));
        assertEquals(2, summary.get("totalSessions"));
        assertEquals(List.of("cashierA", "cashierB"), summary.get("cashiers"));
        assertEquals(List.of("Counter-1", "Counter-2"), summary.get("counters"));
        assertEquals(List.of("T-1", "T-2"), summary.get("terminals"));
        assertEquals(1L, summary.get("openSessionCount"));
        assertEquals(0L, summary.get("suspendedSessionCount"));
        assertFalse((Boolean) summary.get("readyToClose"));
        assertEquals(0, summary.get("excludedSessionCount"));
    }

    @Test
    void dayCloseSummaryReportsExclusionsWhenRangeIsNarrowed() {
        Long branchId = 7L;
        LocalDate date = LocalDate.now();
        PosSession s1 = sessionAt(1L, branchId, date, "cashierA", PosSessionStatus.CLOSED, date.atStartOfDay().plusHours(8));
        PosSession s2 = sessionAt(2L, branchId, date, "cashierB", PosSessionStatus.CLOSED, date.atStartOfDay().plusHours(10));
        PosSession s3 = sessionAt(3L, branchId, date, "cashierC", PosSessionStatus.CLOSED, date.atStartOfDay().plusHours(12));

        when(repo.findByBranchIdAndTradingDateOrderByOpenedAtDesc(branchId, date)).thenReturn(List.of(s3, s2, s1));
        when(repo.findById(1L)).thenReturn(Optional.of(s1));
        when(repo.findById(2L)).thenReturn(Optional.of(s2));

        Map<String, Object> summary = service.getDayCloseSummary(branchId, date, 1L, 2L);

        assertEquals(2, summary.get("totalSessions"));
        assertEquals(1, summary.get("excludedSessionCount"));
        assertTrue((Boolean) summary.get("readyToClose"));
    }

    // ---------------------------------------------------------------------
    // Consolidated Cash Position — additive section, must not disturb Expected Cash
    // ---------------------------------------------------------------------

    @Test
    @SuppressWarnings("unchecked")
    void xReportConsolidatedCashPositionExcludesBackOfficeReceipts() {
        PosSession session = openSession();
        session.setBranchId(7L);
        session.setSessionDate(LocalDate.now());
        session.setOpeningCash(bd("100"));
        session.getCashMovements().add(cashMovement(PosCashMovementType.DROP_IN, bd("40")));
        session.getCashMovements().add(cashMovement(PosCashMovementType.DROP_OUT, bd("10")));
        when(repo.findById(1L)).thenReturn(Optional.of(session));
        when(invoiceRepo.findByPosSessionIdWithItems(1L)).thenReturn(List.of(invoiceWithTax(300.0, 0.0)));
        when(paymentRepository.sumTenderByModeForInvoices(any()))
                .thenReturn(List.<Object[]>of(new Object[]{ "Cash", bd("300"), 1L }));

        PosCashMovement dropIn = cashMovement(PosCashMovementType.DROP_IN, bd("40"));
        PosCashMovement dropOut = cashMovement(PosCashMovementType.DROP_OUT, bd("10"));
        when(cashMovementRepository.findByPosSession_IdInOrderByPerformedAtAsc(List.of(1L)))
                .thenReturn(List.of(dropIn, dropOut));

        Map<String, Object> result = service.getXReport(1L);
        Map<String, Object> summary = (Map<String, Object>) result.get("summary");
        Map<String, Object> cashPosition = (Map<String, Object>) summary.get("cashPosition");

        List<Map<String, Object>> cashDropRows = (List<Map<String, Object>>) cashPosition.get("cashDropRows");
        assertEquals(2, cashDropRows.size());
        assertMoney("30", (BigDecimal) cashPosition.get("cashDropTotal"));
        assertMoney("0", (BigDecimal) cashPosition.get("customerReceiptsTotal"));
        assertMoney("0", (BigDecimal) cashPosition.get("customerAdvancesTotal"));
        assertEquals(false, cashPosition.get("cashRefundsSupported"));
        // net = opening(100) + cashSales(300) + receipts(0) + advances(0) + dropIn(40) - dropOut(10)
        assertMoney("430", (BigDecimal) cashPosition.get("netCashPosition"));

        // X-Report must never query back-office receipts (no session linkage exists yet).
        verify(receiptVoucherRepository, org.mockito.Mockito.never())
                .findCompletedByBranchAndDateAndPurpose(any(), any(), any());

        // Existing Expected Cash in Drawer must be untouched by the new section.
        assertMoney("430", (BigDecimal) summary.get("expectedCash"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void zReportConsolidatedCashPositionIncludesCashOnlyReceiptsAndAdvances() {
        PosSession s1 = openSession();
        s1.setStatus(PosSessionStatus.CLOSED);
        s1.setBranchId(7L);
        s1.setOpeningCash(bd("100"));
        s1.setInvoiceCount(1);

        when(repo.findByBranchIdAndTradingDateOrderByOpenedAtDesc(anyLong(), any(LocalDate.class)))
                .thenReturn(List.of(s1));
        when(invoiceRepo.findByBranchIdAndPosSessionIdInWithItems(anyLong(), any()))
                .thenReturn(List.of(invoiceWithTax(200.0, 0.0)));
        when(paymentRepository.sumTenderByModeForInvoices(any()))
                .thenReturn(List.<Object[]>of(new Object[]{ "Cash", bd("200"), 1L }));
        PosCashMovement inMovement = new PosCashMovement();
        inMovement.setMovementType(PosCashMovementType.DROP_IN);
        inMovement.setAmount(bd("30"));
        inMovement.setStatus(PosCashMovementStatus.ACTIVE);
        PosCashMovement outMovement = new PosCashMovement();
        outMovement.setMovementType(PosCashMovementType.DROP_OUT);
        outMovement.setAmount(bd("5"));
        outMovement.setStatus(PosCashMovementStatus.ACTIVE);
        when(cashMovementRepository.findByPosSession_IdInOrderByPerformedAtAsc(List.of(1L)))
                .thenReturn(List.of(inMovement, outMovement));

        ReceiptVoucher cashReceipt = receiptVoucher("Alice", "Cash", bd("50"));
        ReceiptVoucher cardReceipt = receiptVoucher("Bob", "Card", bd("999")); // must be excluded (not cash)
        when(receiptVoucherRepository.findCompletedByBranchAndDateAndPurpose(eq(7L), any(LocalDate.class), eq(ReceiptPurpose.CASH_SALE)))
                .thenReturn(List.of(cashReceipt, cardReceipt));
        when(receiptVoucherRepository.findCompletedByBranchAndDateAndPurpose(eq(7L), any(LocalDate.class), eq(ReceiptPurpose.AGAINST_INVOICE)))
                .thenReturn(List.of());
        ReceiptVoucher cashAdvance = receiptVoucher("Dana", "Cash", bd("75"));
        when(receiptVoucherRepository.findCompletedByBranchAndDateAndPurpose(eq(7L), any(LocalDate.class), eq(ReceiptPurpose.ADVANCE_RECEIVED)))
                .thenReturn(List.of(cashAdvance));

        Map<String, Object> result = service.getZReport(7L, LocalDate.now());
        Map<String, Object> summary = (Map<String, Object>) result.get("summary");
        Map<String, Object> cashPosition = (Map<String, Object>) summary.get("cashPosition");

        assertMoney("50", (BigDecimal) cashPosition.get("customerReceiptsTotal")); // card receipt excluded
        assertMoney("75", (BigDecimal) cashPosition.get("customerAdvancesTotal"));
        List<Map<String, Object>> receiptRows = (List<Map<String, Object>>) cashPosition.get("customerReceiptRows");
        assertEquals(1, receiptRows.size());
        assertEquals("Alice", receiptRows.get(0).get("customerName"));
        assertMoney("30", (BigDecimal) cashPosition.get("cashDropIn"));
        assertMoney("5", (BigDecimal) cashPosition.get("cashDropOut"));

        // net = opening(100) + cashSales(200) + receipts(50) + advances(75) + dropIn(30) - dropOut(5)
        assertMoney("450", (BigDecimal) cashPosition.get("netCashPosition"));
    }

    // ---------------------------------------------------------------------
    // Day Close reconciliation bug fix — DROP_IN/DROP_OUT, not PAY_IN/PAY_OUT
    // ---------------------------------------------------------------------

    @Test
    void closeDayCashReconciliationAccountsForActualDropInDropOutMovementTypes() {
        // Regression test for the PAY_IN/PAY_OUT vs DROP_IN/DROP_OUT mismatch: before the
        // fix, cashPaidIn/cashPaidOut were always zero (no code ever writes "PAY_IN"/
        // "PAY_OUT"), so a business day with real cash drops recorded on its session(s)
        // would fail this reconciliation with a false variance, purely from the string
        // mismatch — not a genuine discrepancy.
        Long branchId = 7L;
        LocalDate date = LocalDate.now();
        PosSession s1 = sessionAt(1L, branchId, date, "cashierA", PosSessionStatus.CLOSED, date.atStartOfDay().plusHours(9));
        s1.setOpeningCash(bd("100"));
        s1.setInvoiceCount(1);
        // Persisted per-session Expected Cash already correctly includes the drop in/out
        // (computeExpectedCash is untouched): 100 opening + 200 cash tender + 50 dropIn - 20 dropOut = 330.
        s1.setExpectedCash(bd("330"));

        when(dayCloseRepository.existsByBranchIdAndCloseDate(branchId, date)).thenReturn(false);
        when(branchRepository.findById(branchId)).thenReturn(Optional.of(branch(branchId)));
        when(repo.findByBranchIdAndTradingDateOrderByOpenedAtDesc(branchId, date)).thenReturn(List.of(s1));
        when(invoiceRepo.findByBranchIdAndPosSessionIdInWithItems(eq(branchId), any()))
                .thenReturn(List.of(invoiceWithTax(200.0, 0.0)));
        when(paymentRepository.sumTenderByModeForInvoices(any()))
                .thenReturn(List.<Object[]>of(new Object[]{ "Cash", bd("200"), 1L }));
        PosCashMovement inMovementDayClose = new PosCashMovement();
        inMovementDayClose.setMovementType(PosCashMovementType.DROP_IN);
        inMovementDayClose.setAmount(bd("50"));
        inMovementDayClose.setStatus(PosCashMovementStatus.ACTIVE);
        PosCashMovement outMovementDayClose = new PosCashMovement();
        outMovementDayClose.setMovementType(PosCashMovementType.DROP_OUT);
        outMovementDayClose.setAmount(bd("20"));
        outMovementDayClose.setStatus(PosCashMovementStatus.ACTIVE);
        when(cashMovementRepository.findByPosSession_IdInOrderByPerformedAtAsc(List.of(1L)))
                .thenReturn(List.of(inMovementDayClose, outMovementDayClose));
        when(dayCloseRepository.save(any(com.billbull.backend.pos.dayclose.PosDayClose.class))).thenAnswer(inv -> {
            com.billbull.backend.pos.dayclose.PosDayClose d = inv.getArgument(0);
            d.setId(99L);
            return d;
        });

        // Must NOT throw ReconciliationException("CASH", ...) now that DROP_IN/DROP_OUT
        // are the movement types actually checked.
        Map<String, Object> report = service.closeDay(branchId, date);

        assertEquals(true, report.get("isDayClosed"));
    }

    // ---------------------------------------------------------------------
    // POS Reports module — X-Report snapshot persistence, Z-Report numbering
    // ---------------------------------------------------------------------

    @Test
    @SuppressWarnings("unchecked")
    void generateXReportPersistsSnapshotOnceAndStampsSessionOnFirstCall() throws com.fasterxml.jackson.core.JsonProcessingException {
        PosSession session = openSession();
        session.setBranchId(7L);
        session.setTerminalId("T1");
        session.setCounterName("Main Counter");
        session.setOpenedBy("cashierA");
        session.setSessionDate(LocalDate.now());
        when(repo.findById(1L)).thenReturn(Optional.of(session));
        when(invoiceRepo.findByPosSessionIdWithItems(1L)).thenReturn(List.of());
        when(reportNumberService.nextReportNumber("XR", 7L, session.getSessionDate())).thenReturn("XR-20260101-000001");
        when(objectMapper.writeValueAsString(any())).thenReturn("{\"summary\":{}}");

        Map<String, Object> report = service.generateXReport(1L);

        // Stamp is set exactly once, on the first (idempotent) generation.
        assertTrue(session.getXReportGeneratedAt() != null);
        assertEquals(Boolean.TRUE, session.getXReportPrinted());
        assertEquals("XR-20260101-000001", report.get("reportNumber"));

        var captor = org.mockito.ArgumentCaptor.forClass(com.billbull.backend.pos.reports.PosXReportSnapshot.class);
        verify(xReportSnapshotRepository).save(captor.capture());
        com.billbull.backend.pos.reports.PosXReportSnapshot saved = captor.getValue();
        assertEquals("XR-20260101-000001", saved.getReportNumber());
        assertEquals(1L, saved.getSessionId());
        assertEquals(7L, saved.getBranchId());
        assertEquals("T1", saved.getTerminalId());
        assertEquals("Main Counter", saved.getCounterName());
        assertEquals("cashierA", saved.getCashierName());
        assertTrue(saved.getReportJson() != null);
    }

    @Test
    void generateXReportDoesNotPersistASecondSnapshotOnRepeatCalls() {
        // Idempotent: once xReportGeneratedAt is set, subsequent calls only replay the
        // live preview — matching the pre-existing stamp semantics — and must not mint
        // a second immutable snapshot for the same session.
        PosSession session = openSession();
        session.setBranchId(7L);
        session.setSessionDate(LocalDate.now());
        session.setXReportGeneratedAt(LocalDateTime.now().minusMinutes(5));
        when(repo.findById(1L)).thenReturn(Optional.of(session));
        when(invoiceRepo.findByPosSessionIdWithItems(1L)).thenReturn(List.of());

        service.generateXReport(1L);

        verify(xReportSnapshotRepository, org.mockito.Mockito.never()).save(any());
        verify(reportNumberService, org.mockito.Mockito.never()).nextReportNumber(any(), any(), any());
    }

    @Test
    void closeDayAssignsAnImmutableZReportNumberAndEmbedsItInTheSnapshot() {
        Long branchId = 7L;
        LocalDate date = LocalDate.now();
        PosSession s1 = sessionAt(1L, branchId, date, "cashierA", PosSessionStatus.CLOSED, date.atStartOfDay().plusHours(9));
        s1.setOpeningCash(bd("100"));
        s1.setInvoiceCount(0);
        s1.setExpectedCash(bd("100"));

        when(dayCloseRepository.existsByBranchIdAndCloseDate(branchId, date)).thenReturn(false);
        when(branchRepository.findById(branchId)).thenReturn(Optional.of(branch(branchId)));
        when(repo.findByBranchIdAndTradingDateOrderByOpenedAtDesc(branchId, date)).thenReturn(List.of(s1));
        when(invoiceRepo.findByBranchIdAndPosSessionIdInWithItems(eq(branchId), any())).thenReturn(List.of());
        when(reportNumberService.nextReportNumber("ZR", branchId, date)).thenReturn("ZR-20260101-000001");
        var captor = org.mockito.ArgumentCaptor.forClass(com.billbull.backend.pos.dayclose.PosDayClose.class);
        when(dayCloseRepository.save(captor.capture())).thenAnswer(inv -> {
            com.billbull.backend.pos.dayclose.PosDayClose d = inv.getArgument(0);
            d.setId(99L);
            return d;
        });

        Map<String, Object> report = service.closeDay(branchId, date);

        assertEquals("ZR-20260101-000001", captor.getValue().getReportNumber());
        assertEquals("ZR-20260101-000001", report.get("reportNumber"));
    }

    // ---------------------------------------------------------------------
    // Session Roaming Phase 8 — explicit session transfer endpoint wiring
    // ---------------------------------------------------------------------

    @Test
    void transferSessionDelegatesToTransferServiceAndShapesResponse() {
        PosSession existing = openSession();
        existing.setTerminalPk(99L);
        existing.setTerminalId("T1");
        existing.setBranchId(7L);
        when(repo.findById(1L)).thenReturn(Optional.of(existing));

        com.billbull.backend.pos.terminal.PosTerminal source = new com.billbull.backend.pos.terminal.PosTerminal();
        source.setId(99L);
        source.setTerminalId("T1");
        when(terminalRepository.findById(99L)).thenReturn(Optional.of(source));

        com.billbull.backend.pos.terminal.PosTerminal destination = new com.billbull.backend.pos.terminal.PosTerminal();
        destination.setId(200L);
        destination.setTerminalId("T2");
        destination.setCounterId(6L);
        destination.setCounterName("Counter 2");
        when(terminalRepository.findByTerminalId("T2")).thenReturn(Optional.of(destination));
        when(terminalRepository.clearOpenSession(99L, 1L)).thenReturn(1);
        when(terminalRepository.setOpenSession(200L, 1L)).thenReturn(1);

        PosSessionTransferLog savedLog = new PosSessionTransferLog();
        savedLog.setId(500L);
        savedLog.setSessionId(1L);
        savedLog.setFromTerminalId(99L);
        savedLog.setToTerminalId(200L);
        savedLog.setSupervisorAuthorized(false);
        when(transferLogRepository.save(any())).thenReturn(savedLog);
        when(transferLogRepository.findBySessionIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(savedLog));

        PosSessionTransferResponse response = service.transferSession(1L, "T2", "counter relocation", null);

        assertEquals(1L, response.getSessionId());
        assertEquals("T1", response.getSourceTerminalId());
        assertEquals("T2", response.getDestinationTerminalId());
        assertEquals(500L, response.getTransferLogId());
        assertFalse(response.isSupervisorAuthorized());
        assertEquals("counter relocation", response.getReason());
        assertEquals("T2", existing.getTerminalId());
        assertEquals(200L, existing.getTerminalPk());
    }

    @Test
    void transferSessionRejectsClosedSession() {
        PosSession closed = openSession();
        closed.setStatus(PosSessionStatus.CLOSED);
        closed.setTerminalPk(99L);
        closed.setTerminalId("T1");
        when(repo.findById(1L)).thenReturn(Optional.of(closed));

        assertThrows(ResponseStatusException.class, () -> service.transferSession(1L, "T2", null, null));

        verify(terminalRepository, org.mockito.Mockito.never()).setOpenSession(any(), any());
        verify(transferLogRepository, org.mockito.Mockito.never()).save(any());
    }

    @Test
    void transferSessionRejectsDestinationAlreadyHostingASession() {
        PosSession existing = openSession();
        existing.setTerminalPk(99L);
        existing.setTerminalId("T1");
        when(repo.findById(1L)).thenReturn(Optional.of(existing));

        com.billbull.backend.pos.terminal.PosTerminal destination = new com.billbull.backend.pos.terminal.PosTerminal();
        destination.setId(200L);
        destination.setTerminalId("T2");
        destination.setCurrentOpenSessionId(555L);
        when(terminalRepository.findByTerminalId("T2")).thenReturn(Optional.of(destination));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.transferSession(1L, "T2", null, null));
        assertEquals(org.springframework.http.HttpStatus.CONFLICT, ex.getStatusCode());
        verify(transferLogRepository, org.mockito.Mockito.never()).save(any());
    }

    @Test
    void transferSessionRejectsSameDestinationAsCurrentTerminal() {
        PosSession existing = openSession();
        existing.setTerminalPk(200L);
        existing.setTerminalId("T2");
        when(repo.findById(1L)).thenReturn(Optional.of(existing));

        com.billbull.backend.pos.terminal.PosTerminal destination = new com.billbull.backend.pos.terminal.PosTerminal();
        destination.setId(200L);
        destination.setTerminalId("T2");
        when(terminalRepository.findByTerminalId("T2")).thenReturn(Optional.of(destination));

        assertThrows(ResponseStatusException.class, () -> service.transferSession(1L, "T2", null, null));
        verify(transferLogRepository, org.mockito.Mockito.never()).save(any());
    }

    @Test
    void transferSessionAbortsOnConcurrentDestinationClaim() {
        PosSession existing = openSession();
        existing.setTerminalPk(99L);
        existing.setTerminalId("T1");
        when(repo.findById(1L)).thenReturn(Optional.of(existing));

        com.billbull.backend.pos.terminal.PosTerminal destination = new com.billbull.backend.pos.terminal.PosTerminal();
        destination.setId(200L);
        destination.setTerminalId("T2");
        when(terminalRepository.findByTerminalId("T2")).thenReturn(Optional.of(destination));
        when(terminalRepository.clearOpenSession(99L, 1L)).thenReturn(1);
        when(terminalRepository.setOpenSession(200L, 1L)).thenReturn(0);

        assertThrows(ResponseStatusException.class, () -> service.transferSession(1L, "T2", null, null));

        verify(repo, org.mockito.Mockito.never()).save(any(PosSession.class));
        verify(transferLogRepository, org.mockito.Mockito.never()).save(any());
    }

    @Test
    void transferSessionRejectsInvalidSupervisorPin() {
        PosSession existing = openSession();
        existing.setTerminalPk(99L);
        existing.setTerminalId("T1");
        existing.setBranchId(7L);
        when(repo.findById(1L)).thenReturn(Optional.of(existing));

        com.billbull.backend.pos.settings.PosSettings settings = new com.billbull.backend.pos.settings.PosSettings();
        settings.setSupervisorPin(new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder().encode("9999"));
        when(posSettingsRepository.findByBranchId(7L)).thenReturn(Optional.of(settings));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.transferSession(1L, "T2", null, "0000"));
        assertEquals(org.springframework.http.HttpStatus.FORBIDDEN, ex.getStatusCode());

        verify(terminalRepository, org.mockito.Mockito.never()).setOpenSession(any(), any());
        verify(transferLogRepository, org.mockito.Mockito.never()).save(any());
    }

    @Test
    void transferSessionMarksSupervisorAuthorizedWhenPinMatches() {
        PosSession existing = openSession();
        existing.setTerminalPk(99L);
        existing.setTerminalId("T1");
        existing.setBranchId(7L);
        when(repo.findById(1L)).thenReturn(Optional.of(existing));

        com.billbull.backend.pos.settings.PosSettings settings = new com.billbull.backend.pos.settings.PosSettings();
        settings.setSupervisorPin(new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder().encode("1234"));
        when(posSettingsRepository.findByBranchId(7L)).thenReturn(Optional.of(settings));

        com.billbull.backend.pos.terminal.PosTerminal source = new com.billbull.backend.pos.terminal.PosTerminal();
        source.setId(99L);
        source.setTerminalId("T1");
        when(terminalRepository.findById(99L)).thenReturn(Optional.of(source));

        com.billbull.backend.pos.terminal.PosTerminal destination = new com.billbull.backend.pos.terminal.PosTerminal();
        destination.setId(200L);
        destination.setTerminalId("T2");
        when(terminalRepository.findByTerminalId("T2")).thenReturn(Optional.of(destination));
        when(terminalRepository.clearOpenSession(99L, 1L)).thenReturn(1);
        when(terminalRepository.setOpenSession(200L, 1L)).thenReturn(1);

        org.mockito.ArgumentCaptor<PosSessionTransferLog> logCaptor =
                org.mockito.ArgumentCaptor.forClass(PosSessionTransferLog.class);
        when(transferLogRepository.save(logCaptor.capture())).thenAnswer(inv -> inv.getArgument(0));
        when(transferLogRepository.findBySessionIdOrderByCreatedAtDesc(1L))
                .thenAnswer(inv -> List.of(logCaptor.getValue()));

        PosSessionTransferResponse response = service.transferSession(1L, "T2", "handover", "1234");

        assertTrue(response.isSupervisorAuthorized());
        assertTrue(logCaptor.getValue().getSupervisorAuthorized());
    }

    // ---------------------------------------------------------------------
    // Session Roaming Phase 9 — supervisor authorization policy integration
    // ---------------------------------------------------------------------

    @Test
    void transferSessionRejectsCrossBranchTransferWithoutSupervisorAuthorization() {
        PosSession existing = openSession();
        existing.setTerminalPk(99L);
        existing.setTerminalId("T1");
        existing.setBranchId(7L);
        when(repo.findById(1L)).thenReturn(Optional.of(existing));

        com.billbull.backend.pos.terminal.PosTerminal destination = new com.billbull.backend.pos.terminal.PosTerminal();
        destination.setId(200L);
        destination.setTerminalId("T2");
        destination.setBranchId(8L);
        when(terminalRepository.findByTerminalId("T2")).thenReturn(Optional.of(destination));
        lenient().when(posSettingsRepository.findByBranchId(7L)).thenReturn(Optional.empty());

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.transferSession(1L, "T2", null, null));
        assertEquals(org.springframework.http.HttpStatus.FORBIDDEN, ex.getStatusCode());

        verify(terminalRepository, org.mockito.Mockito.never()).setOpenSession(any(), any());
        verify(transferLogRepository, org.mockito.Mockito.never()).save(any());
    }

    @Test
    void transferSessionAllowsCrossBranchTransferWithSupervisorAuthorization() {
        PosSession existing = openSession();
        existing.setTerminalPk(99L);
        existing.setTerminalId("T1");
        existing.setBranchId(7L);
        when(repo.findById(1L)).thenReturn(Optional.of(existing));

        com.billbull.backend.pos.settings.PosSettings settings = new com.billbull.backend.pos.settings.PosSettings();
        settings.setSupervisorPin(new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder().encode("1234"));
        settings.setRequireSupervisorForCrossBranchTransfer(true);
        when(posSettingsRepository.findByBranchId(7L)).thenReturn(Optional.of(settings));

        com.billbull.backend.pos.terminal.PosTerminal source = new com.billbull.backend.pos.terminal.PosTerminal();
        source.setId(99L);
        source.setTerminalId("T1");
        when(terminalRepository.findById(99L)).thenReturn(Optional.of(source));

        com.billbull.backend.pos.terminal.PosTerminal destination = new com.billbull.backend.pos.terminal.PosTerminal();
        destination.setId(200L);
        destination.setTerminalId("T2");
        destination.setBranchId(8L);
        when(terminalRepository.findByTerminalId("T2")).thenReturn(Optional.of(destination));
        when(terminalRepository.clearOpenSession(99L, 1L)).thenReturn(1);
        when(terminalRepository.setOpenSession(200L, 1L)).thenReturn(1);
        when(transferLogRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(transferLogRepository.findBySessionIdOrderByCreatedAtDesc(1L)).thenReturn(List.of());

        PosSessionTransferResponse response = service.transferSession(1L, "T2", "branch handover", "1234");

        assertEquals("T2", response.getDestinationTerminalId());
        assertEquals(PosSessionTransferAuthorization.SUPERVISOR_REQUIRED, response.getPolicyAuthorization());
        assertEquals(PosSessionTransferReasonCode.CROSS_BRANCH_TRANSFER, response.getPolicyReasonCode());
    }

    @Test
    void transferSessionRejectsWhenDestinationTerminalAlreadyOccupiedViaPolicy() {
        PosSession existing = openSession();
        existing.setTerminalPk(99L);
        existing.setTerminalId("T1");
        existing.setBranchId(7L);
        when(repo.findById(1L)).thenReturn(Optional.of(existing));

        com.billbull.backend.pos.terminal.PosTerminal destination = new com.billbull.backend.pos.terminal.PosTerminal();
        destination.setId(200L);
        destination.setTerminalId("T2");
        destination.setBranchId(7L);
        destination.setCurrentOpenSessionId(555L);
        when(terminalRepository.findByTerminalId("T2")).thenReturn(Optional.of(destination));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.transferSession(1L, "T2", null, null));
        assertEquals(org.springframework.http.HttpStatus.CONFLICT, ex.getStatusCode());
        verify(transferLogRepository, org.mockito.Mockito.never()).save(any());
    }

    @Test
    void discoveryResponseIncludesTransferPolicyForOwnerSessionElsewhere() {
        org.springframework.security.core.context.SecurityContextHolder.getContext().setAuthentication(
                new org.springframework.security.authentication.UsernamePasswordAuthenticationToken(
                        "cashier2", null, List.of()));
        com.billbull.backend.common.ownership.OwnershipContextHolder.set(
                new com.billbull.backend.common.ownership.OwnershipContextHolder.OwnershipContext(42L, false));

        LocalDate businessDate = LocalDate.of(2026, 1, 1);
        when(branchAccessService.getRequiredCurrentUserBranch()).thenReturn(branch(1L));
        when(businessDateService.getCurrentBusinessDate(1L)).thenReturn(businessDate);
        // Gate operands are the Candidate Business Day (today), not the pointer.
        when(businessDateService.isDateClosed(1L, LocalDate.now())).thenReturn(false);
        when(repo.findUnclosedSessionsBeforeDate(1L, LocalDate.now())).thenReturn(List.of());

        PosSession ownerSessionElsewhere = openSession();
        ownerSessionElsewhere.setId(9L);
        ownerSessionElsewhere.setOwnerUserId(42L);
        ownerSessionElsewhere.setBranchId(1L);
        ownerSessionElsewhere.setTerminalId("T-OTHER");
        ownerSessionElsewhere.setTerminalPk(50L);
        when(repo.findByBranchIdAndTerminalIdAndStatus(1L, "T1", PosSessionStatus.OPEN)).thenReturn(Optional.empty());
        when(repo.findByOwnerUserIdAndStatus(42L, PosSessionStatus.OPEN)).thenReturn(List.of(ownerSessionElsewhere));

        com.billbull.backend.pos.terminal.PosTerminal destination = new com.billbull.backend.pos.terminal.PosTerminal();
        destination.setId(60L);
        destination.setTerminalId("T1");
        destination.setBranchId(1L);
        when(terminalRepository.findByTerminalId("T1")).thenReturn(Optional.of(destination));

        PosSessionDiscoveryBlockedException ex = assertThrows(PosSessionDiscoveryBlockedException.class,
                () -> service.openSession("T1", "Counter 1", bd("100")));

        assertEquals(PosSessionDiscoveryStatus.OWNER_SESSION, ex.getResponse().getStatus());
        assertEquals(PosSessionTransferAuthorization.ALLOWED, ex.getResponse().getTransferAuthorization());
        assertEquals(PosSessionTransferReasonCode.SAME_BRANCH_TRANSFER, ex.getResponse().getTransferReasonCode());
    }

    // ---------------------------------------------------------------------
    // helpers
    // ---------------------------------------------------------------------

    private static BigDecimal bd(String v) { return new BigDecimal(v); }

    private static Branch branch(Long id) {
        Branch b = new Branch();
        b.setId(id);
        b.setName("Main Branch");
        b.setCode("MB");
        return b;
    }

    private static PosSession sessionAt(Long id, Long branchId, LocalDate date, String openedBy,
                                        PosSessionStatus status, LocalDateTime openedAt) {
        PosSession s = new PosSession();
        s.setId(id);
        s.setBranchId(branchId);
        s.setSessionDate(date);
        s.setTradingDate(date);
        s.setOpenedBy(openedBy);
        s.setStatus(status);
        s.setOpenedAt(openedAt);
        s.setInvoiceCount(0);
        s.setTotalSales(BigDecimal.ZERO);
        s.setTotalCashSales(BigDecimal.ZERO);
        s.setTotalCardSales(BigDecimal.ZERO);
        s.setTotalCreditSales(BigDecimal.ZERO);
        s.setTotalMixedSales(BigDecimal.ZERO);
        return s;
    }

    /** Assert numeric equality independent of scale (380 == 380.00). */
    private static void assertMoney(String expected, BigDecimal actual) {
        assertEquals(0, new BigDecimal(expected).compareTo(actual),
                () -> "expected " + expected + " but was " + actual);
    }

    private PosSession openSession() {
        PosSession s = new PosSession();
        s.setId(1L);
        s.setStatus(PosSessionStatus.OPEN);
        s.setInvoiceCount(0);
        s.setTotalSales(BigDecimal.ZERO);
        s.setTotalCashSales(BigDecimal.ZERO);
        s.setTotalCardSales(BigDecimal.ZERO);
        s.setTotalCreditSales(BigDecimal.ZERO);
        s.setTotalMixedSales(BigDecimal.ZERO);
        return s;
    }

    private PosCashMovement cashMovement(PosCashMovementType type, BigDecimal amount) {
        PosCashMovement m = new PosCashMovement();
        m.setMovementType(type);
        m.setAmount(amount);
        m.setStatus(PosCashMovementStatus.ACTIVE);
        return m;
    }

    private SalesInvoice invoice(double total, String mode) {
        SalesInvoice inv = new SalesInvoice();
        inv.setInvoiceTotal(BigDecimal.valueOf(total));
        inv.setPaymentMode(mode);
        return inv;
    }

    private SalesInvoice invoiceWithTax(double total, double tax) {
        return invoiceWithNumber("INV-" + System.nanoTime(), total, tax);
    }

    private SalesInvoice invoiceWithNumber(String invoiceNumber, double total, double tax) {
        SalesInvoice inv = new SalesInvoice();
        // A non-blank invoice number is required for tender aggregation to run
        // (aggregateTender skips invoices without a number).
        inv.setInvoiceNumber(invoiceNumber);
        inv.setInvoiceTotal(BigDecimal.valueOf(total));
        inv.setTaxTotal(BigDecimal.valueOf(tax));
        inv.setBillDiscountAmount(BigDecimal.ZERO);
        inv.setPaymentMode("Cash");
        return inv;
    }

    private ReceiptVoucher receiptVoucher(String customerName, String paymentMode, BigDecimal amount) {
        ReceiptVoucher rv = new ReceiptVoucher();
        rv.setMemberName(customerName);
        rv.setPaymentMode(paymentMode);
        rv.setAmount(amount);
        rv.setStatus("Completed");
        return rv;
    }

    private SalesReturn salesReturn(String linkedInvoice, SalesReturnStatus status, String action, double amount) {
        SalesReturn r = new SalesReturn();
        r.setLinkedInvoice(linkedInvoice);
        r.setStatus(status);
        r.setReturnAction(action);
        r.setTotalAmount(BigDecimal.valueOf(amount));
        return r;
    }

    // ---------------------------------------------------------------------
    // Enforcement Messaging Regression Tests
    // ---------------------------------------------------------------------

    @Test
    void enforcementMessageWhenAllSessionsAreClosed() {
        LocalDate businessDate = LocalDate.of(2026, 1, 3);
        LocalDate unclosedDay = LocalDate.of(2026, 1, 1);
        stubOpenSessionPreconditions(1L, businessDate, "T1");
        when(businessDayFeatureFlagService.isLoginGateV2Enabled(1L)).thenReturn(true);
        when(businessDayValidationService.validate(any(), any(), any())).thenReturn(
                new com.billbull.backend.pos.businessdate.BusinessDayValidationResult(
                        businessDate, Optional.of(unclosedDay),
                        com.billbull.backend.pos.businessdate.BusinessDayValidationVerdict.BLOCK,
                        com.billbull.backend.pos.businessdate.BusinessDayBlockingReason.PREVIOUS_BUSINESS_DAY_OPEN));

        PosSession s1 = sessionAt(101L, 1L, unclosedDay, "cashierX", PosSessionStatus.CLOSED, unclosedDay.atStartOfDay().plusHours(9));
        PosSession s2 = sessionAt(102L, 1L, unclosedDay, "cashierY", PosSessionStatus.CLOSED, unclosedDay.atStartOfDay().plusHours(10));
        when(repo.findByBranchIdAndTradingDateOrderByOpenedAtDesc(1L, unclosedDay)).thenReturn(List.of(s2, s1));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.openSession("T1", "Counter 1", bd("100")));

        String msg = ex.getReason();
        assertTrue(msg.contains("Previous Business Day Not Closed"));
        assertTrue(msg.contains("Business Day 2026-01-01 has not been closed."));
        assertTrue(msg.contains("All sessions for this Business Day are already closed."));
        assertFalse(msg.contains("Session ID"));
        assertFalse(msg.contains("Terminal :"));
        assertFalse(msg.contains("Status :"));
        assertFalse(msg.contains("CLOSED"));
    }

    @Test
    void enforcementMessageWhenOpenSessionExists() {
        LocalDate businessDate = LocalDate.of(2026, 1, 3);
        LocalDate unclosedDay = LocalDate.of(2026, 1, 1);
        stubOpenSessionPreconditions(1L, businessDate, "T1");
        when(businessDayFeatureFlagService.isLoginGateV2Enabled(1L)).thenReturn(true);
        when(businessDayValidationService.validate(any(), any(), any())).thenReturn(
                new com.billbull.backend.pos.businessdate.BusinessDayValidationResult(
                        businessDate, Optional.of(unclosedDay),
                        com.billbull.backend.pos.businessdate.BusinessDayValidationVerdict.BLOCK,
                        com.billbull.backend.pos.businessdate.BusinessDayBlockingReason.PREVIOUS_BUSINESS_DAY_OPEN));

        PosSession s1 = sessionAt(101L, 1L, unclosedDay, "cashierX", PosSessionStatus.OPEN, unclosedDay.atStartOfDay().plusHours(9));
        s1.setTerminalId("T-101");
        when(repo.findByBranchIdAndTradingDateOrderByOpenedAtDesc(1L, unclosedDay)).thenReturn(List.of(s1));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.openSession("T1", "Counter 1", bd("100")));

        String msg = ex.getReason();
        assertTrue(msg.contains("Previous Business Day Not Closed"));
        assertTrue(msg.contains("Business Day 2026-01-01 cannot be completed because an active session still exists."));
        assertTrue(msg.contains("Session ID : 101"));
        assertTrue(msg.contains("Terminal : T-101"));
        assertTrue(msg.contains("Status : OPEN"));
        assertTrue(msg.contains("Business Day : 2026-01-01"));
        assertFalse(msg.contains("sessionDate"));
    }

    @Test
    void enforcementMessageWhenSuspendedSessionExists() {
        LocalDate businessDate = LocalDate.of(2026, 1, 3);
        LocalDate unclosedDay = LocalDate.of(2026, 1, 1);
        stubOpenSessionPreconditions(1L, businessDate, "T1");
        when(businessDayFeatureFlagService.isLoginGateV2Enabled(1L)).thenReturn(true);
        when(businessDayValidationService.validate(any(), any(), any())).thenReturn(
                new com.billbull.backend.pos.businessdate.BusinessDayValidationResult(
                        businessDate, Optional.of(unclosedDay),
                        com.billbull.backend.pos.businessdate.BusinessDayValidationVerdict.BLOCK,
                        com.billbull.backend.pos.businessdate.BusinessDayBlockingReason.PREVIOUS_BUSINESS_DAY_OPEN));

        PosSession s1 = sessionAt(101L, 1L, unclosedDay, "cashierX", PosSessionStatus.SUSPENDED, unclosedDay.atStartOfDay().plusHours(9));
        s1.setTerminalId("T-101");
        when(repo.findByBranchIdAndTradingDateOrderByOpenedAtDesc(1L, unclosedDay)).thenReturn(List.of(s1));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.openSession("T1", "Counter 1", bd("100")));

        String msg = ex.getReason();
        assertTrue(msg.contains("Previous Business Day Not Closed"));
        assertTrue(msg.contains("Business Day 2026-01-01 cannot be completed because an active session still exists."));
        assertTrue(msg.contains("Session ID : 101"));
        assertTrue(msg.contains("Terminal : T-101"));
        assertTrue(msg.contains("Status : SUSPENDED"));
        assertTrue(msg.contains("Business Day : 2026-01-01"));
    }

    @Test
    void enforcementMessageShowsTradingDateNotSessionDate() {
        LocalDate businessDate = LocalDate.of(2026, 1, 3);
        LocalDate unclosedDay = LocalDate.of(2026, 1, 2); // Trading Date
        LocalDate sessionDate = LocalDate.of(2026, 1, 1); // Session Date
        
        stubOpenSessionPreconditions(1L, businessDate, "T1");
        when(businessDayFeatureFlagService.isLoginGateV2Enabled(1L)).thenReturn(true);
        when(businessDayValidationService.validate(any(), any(), any())).thenReturn(
                new com.billbull.backend.pos.businessdate.BusinessDayValidationResult(
                        businessDate, Optional.of(unclosedDay),
                        com.billbull.backend.pos.businessdate.BusinessDayValidationVerdict.BLOCK,
                        com.billbull.backend.pos.businessdate.BusinessDayBlockingReason.PREVIOUS_BUSINESS_DAY_OPEN));

        PosSession s1 = sessionAt(101L, 1L, sessionDate, "cashierX", PosSessionStatus.OPEN, unclosedDay.atStartOfDay().plusHours(9));
        s1.setTradingDate(unclosedDay);
        s1.setTerminalId("T-101");
        when(repo.findByBranchIdAndTradingDateOrderByOpenedAtDesc(1L, unclosedDay)).thenReturn(List.of(s1));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.openSession("T1", "Counter 1", bd("100")));

        String msg = ex.getReason();
        assertTrue(msg.contains("Business Day : 2026-01-02"));
        assertFalse(msg.contains("2026-01-01"));
    }
}
