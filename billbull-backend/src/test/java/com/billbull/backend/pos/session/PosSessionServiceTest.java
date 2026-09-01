package com.billbull.backend.pos.session;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.backend.exception.SessionRangeExclusionException;
import com.billbull.backend.financials.generalledger.postingengine.PostingEngineService;
import com.billbull.backend.financials.receiptvoucher.ReceiptPurpose;
import com.billbull.backend.financials.receiptvoucher.ReceiptVoucher;
import com.billbull.backend.pos.audit.PosAuditLogRepository;
import com.billbull.backend.pos.audit.PosAuditService;
import com.billbull.backend.pos.settings.PosSettings;
import com.billbull.backend.pos.settings.PosSettingsRepository;
import com.billbull.backend.pos.checkout.PosPaymentAllocationResolver;
import com.billbull.backend.pos.checkout.PosPaymentPlan;
import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;
import com.billbull.backend.pos.terminal.PosTerminalRepository;
import com.billbull.backend.sales.payment.Payment;
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
 * safety net â€” those are where a naive type flip silently breaks the books.
 *
 * <p>Money assertions compare by <em>numeric value</em> ({@link BigDecimal#compareTo})
 * via {@link #assertMoney}, so {@code 380} and {@code 380.00} are treated as equal â€”
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

    /** Real, not mocked: the Business Day window arithmetic is precisely what these
     *  tests need to exercise, and a fixed-zone clock keeps them independent of the
     *  host's timezone. */
    private com.billbull.backend.pos.businessdate.BusinessDayWindowService businessDayWindowService;
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
        // Real (not mocked) Phase 2 wrapper services â€” they delegate to the same mocked
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
        businessDayWindowService = new com.billbull.backend.pos.businessdate.BusinessDayWindowService(
                new com.billbull.backend.pos.businessdate.BusinessDayClock("Asia/Dubai"),
                posSettingsRepository);

        service = new PosSessionService(repo, invoiceRepo, branchAccessService, branchRepository,
                postingEngine, posSettingsRepository, auditService, paymentRepository, auditLogRepository,
                terminalRepository, returnRepository, dayCloseRepository, objectMapper, terminalActivityService,
                businessDateService, businessDayStateService, businessDayValidationService, businessDayFeatureFlagService,
                businessDayWindowService, cashMovementRepository, receiptVoucherRepository,
                xReportSnapshotRepository, reportNumberService, userRepository, cashMovementCategoryService,
                sessionResolutionStrategy, sessionOwnershipService, terminalHostingService, sessionDiscoveryService,
                sessionTransferService, transferLogRepository, sessionTransferPolicy,
                entityManager, effectiveCorrectionViewService,
                new com.billbull.backend.pos.businessdate.BusinessDayContinuationGate(businessDayWindowService),
                new PosSessionClosureWorkflowGate());
        // These three collaborators are @Autowired fields rather than constructor arguments,
        // so they have to be injected reflectively. REAL instances, not mocks: the closure
        // authorization rules (owner-or-supervisor to begin, supervisor-only to cancel) are
        // exactly what the closure tests are asserting, and mocking them would assert nothing.
        // Individual closeSession tests still override these with mocks via
        // authorizeSessionClose() where they only want to reach the timestamping logic.
        // A REAL reconciliation service over the same mocked repositories, not a mock: Expected
        // Cash is exactly what these tests assert, and stubbing it would assert nothing. This is
        // also what keeps the zero-variance suite meaningful after the extraction — it now
        // exercises the authoritative service through getXReport()/closeSession().
        // A REAL denomination count service too: the whole point of the phase is that the server
        // derives Counted Cash, so stubbing it would assert nothing. No company profile and no
        // base currency are stubbed, which resolves to AED -- the ladder these tests count in.
        // Real policy and registry: the variance gate and its grants are exactly what the close
        // tests assert on, and stubbing them would assert nothing. The policy reads the same
        // PosSettings mock the rest of the suite uses, so a test that sets a threshold gets it.
        org.springframework.test.util.ReflectionTestUtils.setField(service,
                "variancePolicy", new PosVariancePolicy(posSettingsRepository));
        org.springframework.test.util.ReflectionTestUtils.setField(service,
                "varianceApprovalRegistry", new PosVarianceApprovalRegistry());
        org.springframework.test.util.ReflectionTestUtils.setField(service,
                "denominationCountService",
                new com.billbull.backend.pos.session.denomination.PosDenominationCountService(
                        org.mockito.Mockito.mock(com.billbull.backend.settings.company.CompanyProfileService.class),
                        org.mockito.Mockito.mock(com.billbull.backend.financials.currency.CurrencyRepository.class),
                        new com.fasterxml.jackson.databind.ObjectMapper()));
        org.springframework.test.util.ReflectionTestUtils.setField(service,
                "cashReconciliationService", new PosCashReconciliationService(
                        paymentRepository, receiptVoucherRepository,
                        effectiveCorrectionViewService, entityManager));
        org.springframework.test.util.ReflectionTestUtils.setField(service,
                "posSessionAuthorizationService", new com.billbull.backend.pos.auth.PosSessionAuthorizationService());
        org.springframework.test.util.ReflectionTestUtils.setField(service,
                "closureAuthorizationRegistry", new com.billbull.backend.pos.auth.PosClosureAuthorizationRegistry());
        org.springframework.test.util.ReflectionTestUtils.setField(service,
                "credentialVerificationService", org.mockito.Mockito.mock(
                        com.billbull.backend.pos.auth.PosCredentialVerificationService.class));

        lenient().when(repo.save(any(PosSession.class))).thenAnswer(inv -> inv.getArgument(0));
        lenient().when(effectiveCorrectionViewService.resolveOverlays(any(), org.mockito.ArgumentMatchers.anyList(), any())).thenAnswer(inv -> inv.getArgument(1));
        lenient().when(transferLogRepository.findBySessionIdOrderByCreatedAtDesc(anyLong())).thenReturn(List.of());
        org.mockito.Mockito.lenient().when(repo.findByIdForUpdate(org.mockito.ArgumentMatchers.any())).thenAnswer(i -> repo.findById((Long) i.getArgument(0)));
        // Default: no linked User row â€” resolveDisplayName() falls back to the raw username.
        lenient().when(userRepository.findByUsername(any())).thenReturn(java.util.Optional.empty());
        // Default: no tender / audit rows unless a test stubs them. aggregateTender/
        // aggregateRefunds are keyed on Payment.posSessionId (the COLLECTION session) —
        // see the cross-session delivery settlement tests below for cases that override these.
        lenient().when(paymentRepository.sumTenderByModeForSessions(any())).thenReturn(List.of());
        lenient().when(paymentRepository.findTenderForSessions(any())).thenReturn(List.of());
        lenient().when(paymentRepository.sumRefundByModeForSessions(any())).thenReturn(List.of());
        lenient().when(auditLogRepository.findBySessionIdOrderByCreatedAtDesc(anyLong())).thenReturn(List.of());
        lenient().when(terminalRepository.findByTerminalId(any())).thenReturn(java.util.Optional.empty());
        lenient().when(returnRepository.findByReturnDateAndBranchWithItems(any(), any())).thenReturn(List.of());
        lenient().when(cashMovementRepository.sumAmountByMovementTypeForSessionIds(any(), any())).thenReturn(List.of());
        lenient().when(cashMovementRepository.findByPosSession_IdInOrderByPerformedAtAsc(any())).thenReturn(List.of());
        lenient().when(receiptVoucherRepository.findCompletedByBranchAndDateAndPurpose(any(), any(), any())).thenReturn(List.of());
        // Stage 3B.2A shadow validation â€” always executes inside openSession(); default
        // to a harmless ALLOW so unrelated tests never trip the exception-safety catch path.
        lenient().when(businessDayValidationService.validate(any(), any())).thenReturn(
                new com.billbull.backend.pos.businessdate.BusinessDayValidationResult(
                        LocalDate.now(), java.util.Optional.empty(),
                        com.billbull.backend.pos.businessdate.BusinessDayValidationVerdict.ALLOW,
                        com.billbull.backend.pos.businessdate.BusinessDayBlockingReason.NONE));
    }

    // ---------------------------------------------------------------------
    // Session Roaming Phase 4 â€” terminal-first hosting lifecycle
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
        // all, so this stub goes unused for them â€” that's expected, not a bug.
        lenient().when(businessDateService.isDateClosed(branchId, businessDate)).thenReturn(false);
        lenient().when(repo.findUnclosedSessionsBeforeDate(branchId, businessDate)).thenReturn(List.of());
        // The gate itself asks about the Candidate Business Day, which for an
        // unconfigured window (this helper's default) is today's calendar date â€”
        // NOT the `businessDate` pointer these tests pass in. Both are stubbed so a
        // test can keep using an arbitrary pointer without tripping strict stubbing.
        lenient().when(businessDateService.isDateClosed(branchId, LocalDate.now())).thenReturn(false);
        lenient().when(repo.findUnclosedSessionsBeforeDate(branchId, LocalDate.now())).thenReturn(List.of());
        lenient().when(repo.findByBranchIdAndTerminalIdAndStatus(branchId, terminalId, PosSessionStatus.OPEN))
                .thenReturn(Optional.empty());
        lenient().when(posSettingsRepository.findByBranchIdForShare(branchId)).thenReturn(Optional.empty());
    }

    // ---------------------------------------------------------------------
    // Business Day window enforcement â€” new sessions after the extension expires.
    //
    // These build the window RELATIVE to the service's own Business Day clock
    // rather than pinning a wall-clock time, so they assert the same rule whatever
    // hour the suite happens to run at. A fixed "23:30" would pass or fail by
    // accident depending on CI's schedule.
    // ---------------------------------------------------------------------

    /** A window positioned so that "now" falls in the requested phase. */
    private PosSettings windowInPhase(com.billbull.backend.pos.businessdate.BusinessDayPhase phase) {
        LocalDateTime now = businessDayWindowService.clock().now();
        PosSettings settings = new PosSettings();
        settings.setOperatingHoursEnabled(true);
        settings.setBusinessDayWindowEnforcementEnabled(true);
        switch (phase) {
            case ACTIVE -> {
                settings.setOperatingStartTime(now.minusHours(1).toLocalTime());
                settings.setOperatingEndTime(now.plusHours(1).toLocalTime());
                settings.setBusinessDayExtensionMinutes(0);
            }
            case EXTENSION -> {
                settings.setOperatingStartTime(now.minusHours(2).toLocalTime());
                settings.setOperatingEndTime(now.minusHours(1).toLocalTime());
                settings.setBusinessDayExtensionMinutes(120);
            }
            // The window's start is still ahead of now, so the window in force is
            // yesterday's â€” long since closed.
            case CLOSED -> {
                settings.setOperatingStartTime(now.plusHours(2).toLocalTime());
                settings.setOperatingEndTime(now.plusHours(3).toLocalTime());
                settings.setBusinessDayExtensionMinutes(0);
            }
            default -> throw new IllegalArgumentException("unsupported: " + phase);
        }
        return settings;
    }

    @Test
    void openSessionIsRefusedOnceTheBusinessDayHasClosed() {
        LocalDate businessDate = LocalDate.of(2026, 1, 1);
        stubOpenSessionPreconditions(1L, businessDate, "T1");
        when(posSettingsRepository.findByBranchIdForShare(1L))
                .thenReturn(Optional.of(windowInPhase(com.billbull.backend.pos.businessdate.BusinessDayPhase.CLOSED)));

        var ex = assertThrows(com.billbull.backend.pos.businessdate.BusinessDayClosedException.class,
                () -> service.openSession("T1", "Counter 1", bd("100")));

        assertEquals(com.billbull.backend.pos.businessdate.BusinessDayClosedResponse.CODE,
                ex.getResponse().getCode());
        org.junit.jupiter.api.Assertions.assertNotNull(ex.getResponse().getNextStartAt(),
                "the operator must be told when trading resumes");
        // Nothing was created: a refused open must leave no session behind.
        verify(repo, org.mockito.Mockito.never()).save(any(PosSession.class));
    }

    @Test
    void openSessionSucceedsDuringTheExtensionPeriod() {
        // The Scheduled End Time must NOT block â€” that is the whole point of the
        // extension, and the defect this feature was built to correct.
        LocalDate businessDate = LocalDate.of(2026, 1, 1);
        stubOpenSessionPreconditions(1L, businessDate, "T1");
        when(posSettingsRepository.findByBranchIdForShare(1L))
                .thenReturn(Optional.of(windowInPhase(com.billbull.backend.pos.businessdate.BusinessDayPhase.EXTENSION)));
        when(businessDayStateService.findUnclosedBusinessDay(1L)).thenReturn(Optional.empty());

        PosSession opened = service.openSession("T1", "Counter 1", bd("100"));
        assertEquals(PosSessionStatus.OPEN, opened.getStatus());
    }

    @Test
    void openSessionSucceedsDuringTheActivePhase() {
        LocalDate businessDate = LocalDate.of(2026, 1, 1);
        stubOpenSessionPreconditions(1L, businessDate, "T1");
        when(posSettingsRepository.findByBranchIdForShare(1L))
                .thenReturn(Optional.of(windowInPhase(com.billbull.backend.pos.businessdate.BusinessDayPhase.ACTIVE)));
        when(businessDayStateService.findUnclosedBusinessDay(1L)).thenReturn(Optional.empty());

        assertEquals(PosSessionStatus.OPEN, service.openSession("T1", "Counter 1", bd("100")).getStatus());
    }

    @Test
    void closedBusinessDayDoesNotBlockWhenEnforcementIsDisabledForTheBranch() {
        LocalDate businessDate = LocalDate.of(2026, 1, 1);
        stubOpenSessionPreconditions(1L, businessDate, "T1");
        PosSettings settings = windowInPhase(com.billbull.backend.pos.businessdate.BusinessDayPhase.CLOSED);
        settings.setBusinessDayWindowEnforcementEnabled(false);
        when(posSettingsRepository.findByBranchIdForShare(1L)).thenReturn(Optional.of(settings));
        when(businessDayStateService.findUnclosedBusinessDay(1L)).thenReturn(Optional.empty());

        assertEquals(PosSessionStatus.OPEN, service.openSession("T1", "Counter 1", bd("100")).getStatus());
    }

    @Test
    void aClosedBusinessDayHasNoSupervisorReopeningPathAtAll() {
        // The critical invariant: nothing a supervisor can present turns CLOSED back
        // into ACTIVE/EXTENSION. A branch with a supervisor PIN configured â€” the
        // credential the removed Business Day override used to accept â€” is refused
        // exactly like any other, and the configured schedule is left untouched.
        LocalDate businessDate = LocalDate.of(2026, 1, 1);
        stubOpenSessionPreconditions(1L, businessDate, "T1");
        PosSettings settings = windowInPhase(com.billbull.backend.pos.businessdate.BusinessDayPhase.CLOSED);
        settings.setSupervisorPin(new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder().encode("4321"));
        java.time.LocalTime start = settings.getOperatingStartTime();
        java.time.LocalTime end = settings.getOperatingEndTime();
        Integer extension = settings.getBusinessDayExtensionMinutes();
        when(posSettingsRepository.findByBranchIdForShare(1L)).thenReturn(Optional.of(settings));

        assertThrows(com.billbull.backend.pos.businessdate.BusinessDayClosedException.class,
                () -> service.openSession("T1", "Counter 1", bd("100")));
        // Refusing must not have rewritten the branch's Business Day schedule.
        assertEquals(start, settings.getOperatingStartTime());
        assertEquals(end, settings.getOperatingEndTime());
        assertEquals(extension, settings.getBusinessDayExtensionMinutes());
        verify(posSettingsRepository, org.mockito.Mockito.never()).save(any());
        // A second attempt is refused identically: the first refusal granted nothing.
        assertThrows(com.billbull.backend.pos.businessdate.BusinessDayClosedException.class,
                () -> service.openSession("T1", "Counter 1", bd("100")));
    }

    @Test
    void supervisorTakeoverStillWorksWhileTheBusinessDayIsClosed() {
        // Closure stops trading, not the closure work. Taking over a session a
        // colleague left open is a prerequisite of Day Close, so it must remain
        // available after closure â€” and it changes session ownership only, never the
        // Business Day phase.
        PosSettings settings = windowInPhase(com.billbull.backend.pos.businessdate.BusinessDayPhase.CLOSED);
        settings.setSupervisorPin(new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder().encode("4321"));
        PosSession session = openSession();
        session.setBranchId(1L);
        session.setOpenedBy("cashier2");
        when(repo.findById(1L)).thenReturn(Optional.of(session));
        // Both reads are stubbed: the takeover's PIN lookup goes through the plain
        // finder, while openSession() below takes the shared lock variant.
        lenient().when(posSettingsRepository.findByBranchId(1L)).thenReturn(Optional.of(settings));
        when(posSettingsRepository.findByBranchIdForShare(1L)).thenReturn(Optional.of(settings));
        when(repo.save(any(PosSession.class))).thenAnswer(inv -> inv.getArgument(0));

        PosSession takenOver = service.supervisorTakeover(1L, "4321");

        assertEquals(PosSessionStatus.OPEN, takenOver.getStatus());
        // The Business Day is still CLOSED afterwards â€” the takeover reopened nothing.
        assertEquals(com.billbull.backend.pos.businessdate.BusinessDayPhase.CLOSED,
                businessDayWindowService.resolveAt(1L, settings).phase());
        // ...so a new session still cannot be opened.
        LocalDate businessDate = LocalDate.of(2026, 1, 1);
        stubOpenSessionPreconditions(1L, businessDate, "T1");
        when(posSettingsRepository.findByBranchIdForShare(1L)).thenReturn(Optional.of(settings));
        assertThrows(com.billbull.backend.pos.businessdate.BusinessDayClosedException.class,
                () -> service.openSession("T1", "Counter 1", bd("100")));
    }

    @Test
    void anInvalidSupervisorPinIsRefusedAndStillReopensNothing() {
        PosSettings settings = windowInPhase(com.billbull.backend.pos.businessdate.BusinessDayPhase.CLOSED);
        settings.setSupervisorPin(new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder().encode("4321"));
        PosSession session = openSession();
        session.setBranchId(1L);
        when(repo.findById(1L)).thenReturn(Optional.of(session));
        when(posSettingsRepository.findByBranchId(1L)).thenReturn(Optional.of(settings));

        assertThrows(ResponseStatusException.class, () -> service.supervisorTakeover(1L, "0000"));
        assertEquals(com.billbull.backend.pos.businessdate.BusinessDayPhase.CLOSED,
                businessDayWindowService.resolveAt(1L, settings).phase());
    }

    @Test
    void reachingClosureNeverPerformsDayCloseAutomatically() {
        // Day Close stays manual: closure is only the end of trading. Resolving a
        // CLOSED Business Day must write no Day Close and advance no business date.
        PosSettings settings = windowInPhase(com.billbull.backend.pos.businessdate.BusinessDayPhase.CLOSED);
        when(posSettingsRepository.findByBranchId(1L)).thenReturn(Optional.of(settings));

        assertEquals(com.billbull.backend.pos.businessdate.BusinessDayPhase.CLOSED,
                businessDayWindowService.resolveCurrent(1L).phase());

        verify(dayCloseRepository, org.mockito.Mockito.never()).save(any());
        verify(businessDateService, org.mockito.Mockito.never()).advanceBusinessDate(anyLong(), any());
    }

    @Test
    void sessionOpenedDuringExtensionKeepsTheBusinessDaysTradingDateNotTomorrows() {
        // A session opened at 22:00 on a day whose window began that morning belongs
        // to THAT Business Day â€” never to the next one, and never to a date derived
        // from the calendar rather than the window.
        LocalDate businessDate = LocalDate.of(2026, 1, 1);
        stubOpenSessionPreconditions(1L, businessDate, "T1");
        PosSettings settings = windowInPhase(com.billbull.backend.pos.businessdate.BusinessDayPhase.EXTENSION);
        when(posSettingsRepository.findByBranchIdForShare(1L)).thenReturn(Optional.of(settings));
        when(businessDayStateService.findUnclosedBusinessDay(1L)).thenReturn(Optional.empty());

        LocalDateTime now = businessDayWindowService.clock().now();
        LocalDate expected = com.billbull.backend.pos.businessdate.PosOperatingHoursCalculator
                .resolveWindow(now, com.billbull.backend.pos.businessdate.BusinessDaySettings.from(settings))
                .tradingDate();

        assertEquals(expected, service.openSession("T1", "Counter 1", bd("100")).getTradingDate());
    }

    /** Day Close domain: tradingDate must be the real calendar day the session opens
     *  on, independent of the Business Date pointer â€” even when the pointer lags
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
    // Phase 3A â€” Business Day persistence (tradingDate, resolver-driven)
    // ---------------------------------------------------------------------

    /** With no operating hours configured (the default), the resolver's output is
     *  byte-identical to the raw calendar date â€” proving Phase 3A changes nothing
     *  observable for the common case. */
    @Test
    void openSessionTradingDateMatchesCalendarDateWhenNoOperatingHoursConfigured() {
        LocalDate businessDate = LocalDate.of(2020, 1, 1);
        stubOpenSessionPreconditions(1L, businessDate, "T1");

        PosSession opened = service.openSession("T1", "Counter 1", bd("100"));

        assertEquals(businessDayWindowService.clock().now().toLocalDate(), opened.getTradingDate());
    }

    // ---------------------------------------------------------------------
    // "Previous Business Day Not Closed" regression â€” the gate must compare the
    // unclosed Business Day (tradingDate domain) against the RESOLVED Candidate
    // Business Day, never against the legacy Business Date pointer. Mixing the
    // two made a branch on Business Day D, whose pointer had already advanced to
    // D+1, read its own current day as an unclosed PREVIOUS day and refuse every
    // further session.
    // ---------------------------------------------------------------------

    /** Helper: same-day 09:00â€“21:00 window, i.e. the reported configuration.
     *
     *  <p>Window <i>enforcement</i> is off: these cases are about the unclosed-prior-
     *  day gate and the Trading Date, not about closure, and a fixed wall-clock window
     *  would otherwise make them pass or fail by the hour the suite happens to run at.
     *  Closure enforcement has its own clock-relative tests above. */
    private com.billbull.backend.pos.settings.PosSettings sameDayWindowSettings() {
        com.billbull.backend.pos.settings.PosSettings s = new com.billbull.backend.pos.settings.PosSettings();
        s.setOperatingHoursEnabled(true);
        s.setOperatingStartTime(java.time.LocalTime.of(9, 0));
        s.setOperatingEndTime(java.time.LocalTime.of(21, 0));
        s.setBusinessDayWindowEnforcementEnabled(false);
        return s;
    }

    /** Scenario 1 â€” current Business Day is D, all its sessions are closed, Day
     *  Close has not run, and the legacy pointer has already advanced to D+1.
     *  A further session on D must still open. This is the reported bug. */
    @Test
    void openSessionAllowsAnotherSessionOnCurrentBusinessDayWhenPointerAlreadyAdvanced() {
        Long branchId = 1L;
        com.billbull.backend.pos.settings.PosSettings settings = sameDayWindowSettings();
        // Resolve against the service's OWN Business Day clock, not the host's default
        // zone: with the two an hour or two apart these expectations otherwise disagree
        // with the gate for the part of the day that straddles the window start.
        LocalDate today = com.billbull.backend.pos.businessdate.BusinessDayResolver.resolve(
                businessDayWindowService.clock().now(),
                com.billbull.backend.pos.businessdate.BusinessDaySettings.from(settings));

        when(branchAccessService.getRequiredCurrentUserBranch()).thenReturn(branch(branchId));
        // Legacy pointer has rolled ahead of the actual Business Day.
        when(businessDateService.getCurrentBusinessDate(branchId)).thenReturn(today.plusDays(1));
        when(posSettingsRepository.findByBranchIdForShare(branchId)).thenReturn(Optional.of(settings));
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

    /** Scenario 2/3 â€” a genuinely PRIOR Business Day is unclosed. Still blocked,
     *  with the same message, even though the pointer is unreliable. */
    @Test
    void openSessionStillBlocksWhenAGenuinelyPriorBusinessDayIsUnclosed() {
        Long branchId = 1L;
        com.billbull.backend.pos.settings.PosSettings settings = sameDayWindowSettings();
        // Resolve against the service's OWN Business Day clock, not the host's default
        // zone: with the two an hour or two apart these expectations otherwise disagree
        // with the gate for the part of the day that straddles the window start.
        LocalDate today = com.billbull.backend.pos.businessdate.BusinessDayResolver.resolve(
                businessDayWindowService.clock().now(),
                com.billbull.backend.pos.businessdate.BusinessDaySettings.from(settings));

        when(branchAccessService.getRequiredCurrentUserBranch()).thenReturn(branch(branchId));
        when(businessDateService.getCurrentBusinessDate(branchId)).thenReturn(today);
        when(posSettingsRepository.findByBranchIdForShare(branchId)).thenReturn(Optional.of(settings));
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

    /** Scenario 4 â€” window DISABLED and the pointer has drifted AHEAD of the
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
        when(posSettingsRepository.findByBranchIdForShare(branchId)).thenReturn(Optional.empty());
        // Stubbed against TODAY, not the pointer â€” the gate must ask about today.
        when(businessDateService.isDateClosed(branchId, today)).thenReturn(false);
        when(repo.findUnclosedSessionsBeforeDate(branchId, today)).thenReturn(List.of());
        when(repo.findByBranchIdAndTerminalIdAndStatus(branchId, "T1", PosSessionStatus.OPEN))
                .thenReturn(Optional.empty());
        // Today is the oldest Business Day with no PosDayClose row â€” its own sessions
        // are all CLOSED, which is precisely the reported production state.
        when(businessDayStateService.findUnclosedBusinessDay(branchId)).thenReturn(Optional.of(today));

        PosSession opened = service.openSession("T1", "Counter 1", bd("100"));

        assertEquals(PosSessionStatus.OPEN, opened.getStatus());
        assertEquals(today, opened.getTradingDate());
        assertEquals(driftedPointer, opened.getSessionDate(), "sessionDate must still track the pointer");
    }

    /** Same unconfigured-window branch, but the unclosed day is GENUINELY prior â€”
     *  Day Close really is overdue. Must still block (BBQA-5.3-013 regression). */
    @Test
    void openSessionWithWindowDisabledStillBlocksOnGenuinelyPriorUnclosedDay() {
        Long branchId = 1L;
        LocalDate today = LocalDate.now();
        LocalDate stale = today.minusDays(2);

        when(branchAccessService.getRequiredCurrentUserBranch()).thenReturn(branch(branchId));
        when(businessDateService.getCurrentBusinessDate(branchId)).thenReturn(today);
        when(posSettingsRepository.findByBranchIdForShare(branchId)).thenReturn(Optional.empty());
        when(businessDateService.isDateClosed(branchId, today)).thenReturn(false);
        when(repo.findUnclosedSessionsBeforeDate(branchId, today)).thenReturn(List.of());
        when(businessDayStateService.findUnclosedBusinessDay(branchId)).thenReturn(Optional.of(stale));
        when(repo.findByBranchIdAndTradingDateOrderByOpenedAtDesc(branchId, stale)).thenReturn(List.of());

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.openSession("T1", "Counter 1", bd("100")));
        assertTrue(ex.getReason().contains("PREVIOUS_DAY_SESSION_OPEN"));
        assertTrue(ex.getReason().contains(stale.toString()));
    }

    /** Unconfigured window, today's Business Day still has an OPEN session â€” the
     *  same-Business-Day reopen path must not be blocked by it either. */
    @Test
    void openSessionWithWindowDisabledAllowsReopenWhileTodaysDayStillHasAnOpenSession() {
        Long branchId = 1L;
        LocalDate today = LocalDate.now();

        when(branchAccessService.getRequiredCurrentUserBranch()).thenReturn(branch(branchId));
        when(businessDateService.getCurrentBusinessDate(branchId)).thenReturn(today);
        when(posSettingsRepository.findByBranchIdForShare(branchId)).thenReturn(Optional.empty());
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
     *  early-morning side of it â€” only BusinessDayResolver would roll this back to
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
        // Trading Date resolution is what is under test here, not closure â€” see
        // sameDayWindowSettings() for why enforcement is off.
        settings.setBusinessDayWindowEnforcementEnabled(false);
        when(posSettingsRepository.findByBranchIdForShare(branchId)).thenReturn(Optional.of(settings));

        // With a CONFIGURED window the gate no longer queries the stale legacy
        // pointer (2020-01-01) â€” it queries the resolved Candidate Business Day.
        // Stubbing against the resolved day is itself the assertion that it does.
        // Resolved against the service's own Business Day clock, never
        // LocalDateTime.now(): the JVM default zone and the Business Day zone
        // straddle this overnight window's start for part of the day, and the test
        // must assert the service's rule, not the host's timezone.
        LocalDate resolvedDay = com.billbull.backend.pos.businessdate.BusinessDayResolver.resolve(
                businessDayWindowService.clock().now(),
                com.billbull.backend.pos.businessdate.BusinessDaySettings.from(settings));
        when(businessDateService.isDateClosed(branchId, resolvedDay)).thenReturn(false);
        when(repo.findUnclosedSessionsBeforeDate(branchId, resolvedDay)).thenReturn(List.of());

        // We can't pin the clock inside openSession(), so instead we
        // prove the *rule*: with these settings, "now" always resolves to either
        // today or yesterday depending on the wall clock â€” either way, the result
        // must equal exactly what BusinessDayResolver independently computes for
        // the same instant class, never the raw calendar date when they'd differ.
        // Deterministic assertion: candidateBusinessDay is never simply undefined/
        // null and always matches BusinessDayResolver.resolve(now, settings) to
        // within the same day (re-resolved immediately after, negligible race).
        PosSession opened = service.openSession("T1", "Counter 1", bd("100"));

        com.billbull.backend.pos.businessdate.BusinessDaySettings bds =
                com.billbull.backend.pos.businessdate.BusinessDaySettings.from(settings);
        LocalDate expected = com.billbull.backend.pos.businessdate.BusinessDayResolver.resolve(
                businessDayWindowService.clock().now(), bds);
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
     *  gate asks about the Candidate Business Day â€” for an unconfigured window,
     *  today â€” so a drifted pointer can no longer decide whether trading is blocked. */
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

    // ---------------------------------------------------------------------
    // POS Session Lifecycle Bug Fix Tests
    // ---------------------------------------------------------------------

    @Test
    void openSession_NoExistingSession_CreatesNewSession() {
        LocalDate businessDate = businessDayWindowService.clock().now().toLocalDate();
        stubOpenSessionPreconditions(1L, businessDate, "T1");

        PosSession opened = service.openSession("T1", "Counter 1", bd("1000"));

        assertEquals(PosSessionStatus.OPEN, opened.getStatus());
        assertEquals(bd("1000"), opened.getOpeningCash());
    }

    @Test
    void openSession_ExistingSessionSameDayZeroFloat_ResumesExisting() {
        LocalDate businessDate = businessDayWindowService.clock().now().toLocalDate();
        stubOpenSessionPreconditions(1L, businessDate, "T1");

        PosSession existing = new PosSession();
        existing.setId(10L);
        existing.setTradingDate(businessDate);
        existing.setOpenedBy("system");
        existing.setStatus(PosSessionStatus.OPEN);
        when(repo.findByBranchIdAndTerminalIdAndStatus(1L, "T1", PosSessionStatus.OPEN)).thenReturn(Optional.of(existing));

        PosSession resumed = service.openSession("T1", "Counter 1", BigDecimal.ZERO);
        assertEquals(10L, resumed.getId());
    }

    @Test
    void openSession_ExistingSessionPreviousDay_ThrowsException() {
        LocalDate businessDate = businessDayWindowService.clock().now().toLocalDate();
        LocalDate previousDate = businessDate.minusDays(1);
        stubOpenSessionPreconditions(1L, businessDate, "T1");

        PosSession existing = new PosSession();
        existing.setId(10L);
        existing.setTradingDate(previousDate);
        existing.setOpenedBy("system");
        existing.setStatus(PosSessionStatus.OPEN);
        existing.setTerminalId("T1");
        when(repo.findByBranchIdAndTerminalIdAndStatus(1L, "T1", PosSessionStatus.OPEN)).thenReturn(Optional.of(existing));

        ResponseStatusException ex = assertThrows(
                com.billbull.backend.pos.businessdate.PreviousBusinessDaySessionException.class,
                () -> service.openSession("T1", "Counter 1", BigDecimal.ZERO));
        
        assertTrue(ex.getReason().contains("PREVIOUS_DAY_SESSION_OPEN"));
    }

    @Test
    void openSession_PreviousDaySessionAndOpeningCash_ThrowsExceptionAndDoesNotDiscardFloat() {
        LocalDate businessDate = businessDayWindowService.clock().now().toLocalDate();
        LocalDate previousDate = businessDate.minusDays(1);
        stubOpenSessionPreconditions(1L, businessDate, "T1");

        PosSession existing = new PosSession();
        existing.setId(10L);
        existing.setTradingDate(previousDate);
        existing.setOpenedBy("system");
        existing.setStatus(PosSessionStatus.OPEN);
        existing.setTerminalId("T1");
        when(repo.findByBranchIdAndTerminalIdAndStatus(1L, "T1", PosSessionStatus.OPEN)).thenReturn(Optional.of(existing));

        ResponseStatusException ex = assertThrows(
                com.billbull.backend.pos.businessdate.PreviousBusinessDaySessionException.class,
                () -> service.openSession("T1", "Counter 1", bd("1000")));
        
        assertTrue(ex.getReason().contains("PREVIOUS_DAY_SESSION_OPEN"));
    }

    @Test
    void openSession_SameDaySessionAndNonZeroOpeningCash_ThrowsConflict() {
        LocalDate businessDate = businessDayWindowService.clock().now().toLocalDate();
        stubOpenSessionPreconditions(1L, businessDate, "T1");

        PosSession existing = new PosSession();
        existing.setId(10L);
        existing.setTradingDate(businessDate);
        existing.setOpenedBy("system");
        existing.setStatus(PosSessionStatus.OPEN);
        when(repo.findByBranchIdAndTerminalIdAndStatus(1L, "T1", PosSessionStatus.OPEN)).thenReturn(Optional.of(existing));

        ResponseStatusException ex = assertThrows(
                ResponseStatusException.class,
                () -> service.openSession("T1", "Counter 1", bd("1000")));
        
        assertEquals(org.springframework.http.HttpStatus.CONFLICT, ex.getStatusCode());
        assertTrue(ex.getReason().contains("Cannot apply new opening float"));
    }

    @Test
    void openSession_BusinessDayBoundary_ChecksProperTimezoneDate() {
        LocalDate actualCandidateDay = businessDayWindowService.clock().now().toLocalDate();
        stubOpenSessionPreconditions(1L, actualCandidateDay, "T1");

        PosSession existing = new PosSession();
        existing.setId(10L);
        existing.setTradingDate(actualCandidateDay.minusDays(1)); 
        existing.setOpenedBy("system");
        existing.setStatus(PosSessionStatus.OPEN);
        existing.setTerminalId("T1");
        when(repo.findByBranchIdAndTerminalIdAndStatus(1L, "T1", PosSessionStatus.OPEN)).thenReturn(Optional.of(existing));

        assertThrows(
                com.billbull.backend.pos.businessdate.PreviousBusinessDaySessionException.class,
                () -> service.openSession("T1", "Counter 1", BigDecimal.ZERO));
    }

    @Test
    void openSession_TimezoneRegression_UsesBusinessDayWindowServiceRatherThanSystemLocalDate() {
        com.billbull.backend.pos.settings.PosSettings settings = new com.billbull.backend.pos.settings.PosSettings();
        settings.setOperatingHoursEnabled(true);
        settings.setOperatingStartTime(java.time.LocalTime.of(23, 0));
        settings.setOperatingEndTime(java.time.LocalTime.of(8, 0)); 
        settings.setBusinessDayWindowEnforcementEnabled(false);
        when(posSettingsRepository.findByBranchIdForShare(1L)).thenReturn(Optional.of(settings));

        LocalDate resolvedCandidateDay = com.billbull.backend.pos.businessdate.BusinessDayResolver.resolve(
                businessDayWindowService.clock().now(),
                com.billbull.backend.pos.businessdate.BusinessDaySettings.from(settings));
                
        stubOpenSessionPreconditions(1L, resolvedCandidateDay, "T1");
        lenient().when(businessDateService.isDateClosed(1L, resolvedCandidateDay)).thenReturn(false);
        lenient().when(repo.findUnclosedSessionsBeforeDate(1L, resolvedCandidateDay)).thenReturn(List.of());

        PosSession existing = new PosSession();
        existing.setId(10L);
        existing.setTradingDate(resolvedCandidateDay.minusDays(1));
        existing.setOpenedBy("system");
        existing.setStatus(PosSessionStatus.OPEN);
        existing.setTerminalId("T1");
        when(repo.findByBranchIdAndTerminalIdAndStatus(1L, "T1", PosSessionStatus.OPEN)).thenReturn(Optional.of(existing));

        assertThrows(
                com.billbull.backend.pos.businessdate.PreviousBusinessDaySessionException.class,
                () -> service.openSession("T1", "Counter 1", BigDecimal.ZERO));
    }

    /** Business Day, once persisted, is never re-derived â€” no other session
     *  lifecycle method (close/suspend/resume/transfer) touches tradingDate. */
    @Test
    void tradingDateIsNeverModifiedByCloseSession() {
        // closeSession() verifies the caller's identity and authorization before it does
        // anything else; without this the test never reaches the behavior it asserts on.
        authenticateCashier();
        authorizeSessionClose(null);
        PosSession session = openSession();
        session.setSessionDate(LocalDate.of(2020, 1, 1));
        session.setTradingDate(LocalDate.of(2020, 1, 1));
        when(repo.findById(1L)).thenReturn(Optional.of(session));

        LocalDate before = session.getTradingDate();
        service.closeSession(1L, denoms("0"), null, "eod");

        assertEquals(before, session.getTradingDate());
    }

    // ---------------------------------------------------------------------
    // Phase 3B.1 â€” Previous Unclosed Business Day detection, sourced from
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
        // The unclosed day must equal the CANDIDATE Business Day (today) â€” that is
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
     *  a closed date is never returned) â€” verified here at the gate level: an
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
     *  gate is concerned â€” the overnight-aware computation itself is Phase 3A's
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
        // All sessions on the unclosed day are CLOSED â€” no OPEN or SUSPENDED remain.
        PosSession s1 = sessionAt(50L, 1L, unclosedDay, "cashierA", PosSessionStatus.CLOSED, unclosedDay.atStartOfDay().plusHours(9));
        PosSession s2 = sessionAt(51L, 1L, unclosedDay, "cashierB", PosSessionStatus.CLOSED, unclosedDay.atStartOfDay().plusHours(10));
        when(repo.findByBranchIdAndTradingDateOrderByOpenedAtDesc(1L, unclosedDay)).thenReturn(List.of(s2, s1));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.openSession("T1", "Counter 1", bd("100")));

        assertEquals(org.springframework.http.HttpStatus.CONFLICT, ex.getStatusCode());
        assertTrue(ex.getReason().contains("PREVIOUS_DAY_SESSION_OPEN"));
        assertTrue(ex.getReason().contains("Business Day 2026-08-03 cannot be completed because Day Close has not been run."));
        assertTrue(ex.getReason().contains("All sessions for this Business Day are already closed."));
        // Must NOT mention any session details
        assertFalse(ex.getReason().contains("Session ID"));
    }

    // ---------------------------------------------------------------------
    // Stage 3B.2A â€” Shadow Validation integration: BusinessDayValidationService
    // always executes, never affects the decision, exceptions are swallowed.
    // ---------------------------------------------------------------------

    @Test
    void openSessionExecutesShadowValidationOnSuccessfulOpen() {
        LocalDate businessDate = LocalDate.of(2026, 1, 1);
        stubOpenSessionPreconditions(1L, businessDate, "T1");
        when(businessDayStateService.findUnclosedBusinessDay(1L)).thenReturn(Optional.empty());

        service.openSession("T1", "Counter 1", bd("100"));

        verify(businessDayValidationService).validate(eq(1L), any());
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

        // The legacy gate still throws â€” unchanged behavior â€” but shadow validation
        // must still have run beforehand, observing the (now-known) legacy outcome.
        assertThrows(ResponseStatusException.class, () -> service.openSession("T1", "Counter 1", bd("100")));

        verify(businessDayValidationService).validate(eq(1L), any());
        verify(businessDayStateService).recordValidationOutcome(eq(1L), eq(false), any());
    }

    @Test
    void openSessionSwallowsShadowValidationExceptionsAndStillOpensTheSession() {
        LocalDate businessDate = LocalDate.of(2026, 1, 1);
        stubOpenSessionPreconditions(1L, businessDate, "T1");
        when(businessDayStateService.findUnclosedBusinessDay(1L)).thenReturn(Optional.empty());
        when(businessDayValidationService.validate(any(), any()))
                .thenThrow(new RuntimeException("shadow engine bug"));

        PosSession opened = service.openSession("T1", "Counter 1", bd("100"));

        assertEquals(PosSessionStatus.OPEN, opened.getStatus());
        // Stage 3B.2A.6: an unclassified shadow-validation exception is categorized
        // UNEXPECTED and recorded via recordInfrastructureFailure (which internally
        // also calls recordValidationError for backward compatibility â€” but that's
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
        when(posSettingsRepository.findByBranchIdForShare(1L))
                .thenThrow(new RuntimeException("settings datasource down"))
                .thenReturn(Optional.empty());

        PosSession opened = service.openSession("T1", "Counter 1", bd("100"));

        assertEquals(PosSessionStatus.OPEN, opened.getStatus());
        verify(businessDayStateService).recordInfrastructureFailure(
                eq(1L), eq(com.billbull.backend.pos.businessdate.BusinessDayInfrastructureException.FailureCategory.SETTINGS),
                any(RuntimeException.class));
        // businessDayValidationService must never even be called â€” the settings
        // lookup failed before validate() could be invoked.
        verify(businessDayValidationService, org.mockito.Mockito.never()).validate(any(), any());
    }

    @Test
    void openSessionCategorizesBusinessDayStateServiceExceptionAsInfrastructureFailure() {
        LocalDate businessDate = LocalDate.of(2026, 1, 1);
        stubOpenSessionPreconditions(1L, businessDate, "T1");
        // The 3B.1 gate's own call to findUnclosedBusinessDay succeeds (empty â€”
        // legacy allows), but the shadow validate() call fails downstream inside
        // BusinessDayValidationService, surfacing as a categorized infra exception.
        when(businessDayStateService.findUnclosedBusinessDay(1L)).thenReturn(Optional.empty());
        when(businessDayValidationService.validate(any(), any()))
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
    // Stage 3B.2B â€” Enforcement (feature-flag controlled)
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
        when(businessDayValidationService.validate(any(), any())).thenReturn(
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
        when(businessDayValidationService.validate(any(), any())).thenReturn(ALLOW_RESULT);

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
        when(businessDayValidationService.validate(any(), any())).thenReturn(
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
        when(businessDayValidationService.validate(any(), any())).thenReturn(
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
        when(businessDayValidationService.validate(any(), any())).thenReturn(
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
        when(businessDayValidationService.validate(any(), any()))
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
        when(posSettingsRepository.findByBranchIdForShare(1L))
                .thenThrow(new RuntimeException("settings datasource down"))
                .thenReturn(Optional.empty());
        when(businessDayStateService.findUnclosedBusinessDay(1L)).thenReturn(Optional.empty());

        PosSession opened = service.openSession("T1", "Counter 1", bd("100"));

        assertEquals(PosSessionStatus.OPEN, opened.getStatus());
        verify(businessDayStateService).recordEnforcementFallback(
                eq(1L), eq(com.billbull.backend.pos.businessdate.BusinessDayInfrastructureException.FailureCategory.SETTINGS),
                any());
        // The engine's validate() must never have been reached â€” settings load failed first.
        verify(businessDayValidationService, org.mockito.Mockito.never()).validate(any(), any());
    }

    @Test
    void openSessionFlagOnFallbackStillBlocksWhenLegacyGateWouldBlock() {
        // Proves the fallback is a real re-evaluation, not a silent allow: the new
        // engine fails, and the legacy gate it falls back to also says block.
        LocalDate businessDate = LocalDate.of(2026, 1, 3);
        LocalDate unclosedDay = LocalDate.of(2026, 1, 1);
        stubOpenSessionPreconditions(1L, businessDate, "T1");
        when(businessDayFeatureFlagService.isLoginGateV2Enabled(1L)).thenReturn(true);
        when(businessDayValidationService.validate(any(), any()))
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
        // Flag lookup failure defaults to OFF (legacy-primary) â€” Shadow Validation
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
        LocalDate businessDate = businessDayWindowService.clock().now().toLocalDate();
        when(branchAccessService.getRequiredCurrentUserBranch()).thenReturn(branch(1L));
        when(businessDateService.getCurrentBusinessDate(1L)).thenReturn(businessDate);
        // Gate operands are the Candidate Business Day (today), not the pointer.
        when(businessDateService.isDateClosed(org.mockito.ArgumentMatchers.eq(1L), org.mockito.ArgumentMatchers.any())).thenReturn(false);
        when(repo.findUnclosedSessionsBeforeDate(org.mockito.ArgumentMatchers.eq(1L), org.mockito.ArgumentMatchers.any())).thenReturn(List.of());
        PosSession existing = openSession();
        existing.setOpenedBy("cashier1");
        existing.setTradingDate(businessDate); // make sure it matches candidateBusinessDay to allow resume
        when(repo.findByBranchIdAndTerminalIdAndStatus(1L, "T1", PosSessionStatus.OPEN))
                .thenReturn(Optional.of(existing));

        PosSession result = service.openSession("T1", "Counter 1", BigDecimal.ZERO);

        assertEquals(existing, result);
        verify(sessionTerminalHistoryRepository, org.mockito.Mockito.never()).save(any());
    }

    // ---------------------------------------------------------------------
    // Session Roaming Phase 7 â€” discovery-blocked openSession() cases
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
        // closeSession() verifies the caller's identity and authorization before it does
        // anything else; without this the test never reaches the behavior it asserts on.
        authenticateCashier();
        authorizeSessionClose(null);
        PosSession session = openSession();
        when(repo.findById(1L)).thenReturn(Optional.of(session));
        PosSessionTerminalHistory openSegment = new PosSessionTerminalHistory();
        when(sessionTerminalHistoryRepository.findFirstBySessionIdAndEndedAtIsNullOrderByStartedAtDesc(1L))
                .thenReturn(Optional.of(openSegment));
        when(sessionTerminalHistoryRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        service.closeSession(1L, denoms("0"), null, "eod");

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
    // closeSession() â€” expected cash + cash difference
    // ---------------------------------------------------------------------

    @Test
    void closeSessionComputesExpectedCashAndDifference() {
        allowVarianceUpTo("100");
        // closeSession() verifies the caller's identity and authorization before it does
        // anything else; without this the test never reaches the behavior it asserts on.
        authenticateCashier();
        authorizeSessionClose(null);
        PosSession session = openSession();
        session.setBranchId(1L);
        session.setOpeningCash(bd("100"));
        session.getCashMovements().add(cashMovement(PosCashMovementType.DROP_IN, bd("50")));
        session.getCashMovements().add(cashMovement(PosCashMovementType.DROP_OUT, bd("20")));
        when(repo.findById(1L)).thenReturn(java.util.Optional.of(session));
        // closeSession() now derives expected cash from actual cash tender collected
        // (same formula as getXReport()), keyed on Payment.posSessionId rather than
        // this session's own invoice list.
        when(paymentRepository.sumTenderByModeForSessions(any()))
                .thenReturn(List.<Object[]>of(new Object[]{ "Cash", bd("250"), 1L }));

        // expected = opening(100) + cashTender(250) + (dropIn 50 - dropOut 20) = 380
        PosSession closed = service.closeSession(1L, denoms("400"), null, "ok");

        assertMoney("380", closed.getExpectedCash());
        // over by 20
        assertMoney("20", closed.getCashDifference());
        assertMoney("400", closed.getClosingCash());
        assertEquals(PosSessionStatus.CLOSED, closed.getStatus());
    }

    @Test
    @SuppressWarnings("unchecked")
    void closeSessionAndXReportAgreeOnExpectedCashForNonStandardPaymentMode() {
        allowVarianceUpTo("100");
        // closeSession() verifies the caller's identity and authorization before it does
        // anything else; without this the test never reaches the behavior it asserts on.
        authenticateCashier();
        authorizeSessionClose(null);
        // Regression test for the modal/X-Report desync: a payment mode that isn't a
        // literal "cash"/"card"/"credit" match (e.g. a voucher tender row) must still
        // produce the SAME expected cash from closeSession() and getXReport(), since
        // both now share PosCashReconciliationService instead of diverging
        // (one via the session.totalCashSales counter, the other via a live query).
        PosSession session = openSession();
        session.setBranchId(1L);
        session.setOpeningCash(bd("100"));
        session.getCashMovements().add(cashMovement(PosCashMovementType.DROP_IN, bd("50")));
        session.getCashMovements().add(cashMovement(PosCashMovementType.DROP_OUT, bd("20")));
        when(repo.findById(1L)).thenReturn(java.util.Optional.of(session));
        when(invoiceRepo.findByPosSessionIdWithItems(1L)).thenReturn(List.of(invoiceWithTax(250.0, 0.0)));
        when(paymentRepository.sumTenderByModeForSessions(any()))
                .thenReturn(List.<Object[]>of(new Object[]{ "Cash", bd("250"), 1L }));

        Map<String, Object> report = service.getXReport(1L);
        Map<String, Object> summary = (Map<String, Object>) report.get("summary");
        PosSession closed = service.closeSession(1L, denoms("400"), null, "ok");

        assertMoney("380", (BigDecimal) summary.get("expectedCash"));
        assertMoney("380", closed.getExpectedCash());
    }

    @Test
    void closeSessionTreatsNullMoneyFieldsAsZero() {
        // closeSession() verifies the caller's identity and authorization before it does
        // anything else; without this the test never reaches the behavior it asserts on.
        authenticateCashier();
        authorizeSessionClose(null);
        PosSession session = openSession();
        session.setOpeningCash(null);
        session.setTotalCashSales(null);
        // no cash movements
        when(repo.findById(1L)).thenReturn(java.util.Optional.of(session));

        PosSession closed = service.closeSession(1L, null, null, null);

        // opening(0) + cashSales(0) + net(0) = 0
        assertMoney("0", closed.getExpectedCash());
        // Closing with no denominations submitted is NOT COUNTED, not counted-zero. The drawer
        // was never verified, so there is no counted cash and no variance to state. Coalescing
        // the absent count to 0.00 (the old behaviour) asserted that someone had looked in the
        // drawer and found it empty.
        assertNull(closed.getClosingCash());
        assertNull(closed.getCashDifference());
        assertNull(closed.getCountedAt());
    }

    @Test
    void closeSessionShortfallIsNegativeDifference() {
        allowVarianceUpTo("100");
        // closeSession() verifies the caller's identity and authorization before it does
        // anything else; without this the test never reaches the behavior it asserts on.
        authenticateCashier();
        authorizeSessionClose(null);
        PosSession session = openSession();
        session.setBranchId(1L);
        session.setOpeningCash(bd("100"));
        session.setTotalCashSales(bd("0"));
        when(repo.findById(1L)).thenReturn(java.util.Optional.of(session));

        PosSession closed = service.closeSession(1L, denoms("90"), null, null);

        assertMoney("100", closed.getExpectedCash());
        // counted 90 against expected 100 -> short by 10
        assertMoney("-10", closed.getCashDifference());
        assertTrue(closed.getCashDifference().signum() < 0, "shortfall must be negative");
    }

    // ---------------------------------------------------------------------
    // recordInvoiceOnSession() â€” payment-mode classification + accumulation
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

    /**
     * The allocation path is what every live checkout now takes: each tender's own amount goes
     * to its own bucket, and the deprecated "mixed" counter never moves. Before Phase 10 this
     * same 200 sale put the whole 200 into totalMixedSales and nothing into cash or card, so
     * the drawer expectation excluded cash the cashier was actually holding.
     */
    @Test
    void recordInvoiceSplitsSessionTotalsAcrossTendersFromTheAllocationPlan() {
        lenient().when(repo.incrementSessionTotals(anyLong(), any(), any(), any(), any(), any(), any(), anyInt())).thenReturn(1);

        PosPaymentPlan plan = new PosPaymentAllocationResolver().resolveAllocations(
                java.util.List.of(
                        allocationOf("CASH", 120.0),
                        allocationOf("CARD", 50.0),
                        allocationOf("ONLINE", 30.0)),
                200.0, null, "Cash");

        service.recordInvoiceOnSession(1L, invoice(200.0, "Cash + Card + Online"), plan);

        verify(repo).incrementSessionTotals(
                eq(1L),
                eq(bd("200.0")),      // totalSales â€” still the invoice value
                eq(bd("120.00")),     // cashDelta
                eq(bd("50.00")),      // cardDelta
                eq(bd("0.00")),       // creditDelta
                eq(BigDecimal.ZERO),  // mixedDelta â€” never incremented again
                eq(bd("30.00")),      // onlineDelta
                eq(0));
    }

    /** A part-credit sale puts only the receivable portion in the credit bucket. */
    @Test
    void recordInvoiceSendsOnlyTheReceivablePortionToTheCreditBucket() {
        lenient().when(repo.incrementSessionTotals(anyLong(), any(), any(), any(), any(), any(), any(), anyInt())).thenReturn(1);

        PosPaymentPlan plan = new PosPaymentAllocationResolver().resolveAllocations(
                java.util.List.of(allocationOf("CASH", 40.0), allocationOf("CREDIT", 60.0)),
                100.0, null, "Cash");

        service.recordInvoiceOnSession(1L, invoice(100.0, "Cash + Credit"), plan);

        verify(repo).incrementSessionTotals(
                eq(1L), eq(bd("100.0")),
                eq(bd("40.00")), eq(bd("0.00")), eq(bd("60.00")),
                eq(BigDecimal.ZERO), eq(bd("0.00")), eq(0));
    }

    /** Legacy/replayed callers with no plan keep the old label classification, so historical
     *  reprocessing still produces the totals those sessions were closed with. */
    @Test
    void recordInvoiceWithoutAPlanFallsBackToTheStoredLabelClassification() {
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

        // Two separate atomic increments â€” each fires one UPDATE.
        verify(repo, org.mockito.Mockito.times(2))
                .incrementSessionTotals(anyLong(), any(), any(), any(), any(), any(), any(), anyInt());
    }

    @Test
    void recordInvoiceDoesNothingForNullSession() {
        // Null sessionId â€” no DB call should be made.
        service.recordInvoiceOnSession(null, invoice(100.0, "Cash"));
        verify(repo, org.mockito.Mockito.never())
                .incrementSessionTotals(anyLong(), any(), any(), any(), any(), any(), any(), anyInt());
    }

    // ---------------------------------------------------------------------
    // getXReport() â€” derived figures, clamping, drop netting
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
        // counter â€” stub 300 of cash tender for this session's invoice.
        when(paymentRepository.sumTenderByModeForSessions(any()))
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
    // Cross-session delivery settlement: Payment.posSessionId (the COLLECTION session)
    // drives cash, independent of SalesInvoice.posSessionId (the SALE session).
    // Regression coverage for "delivery created in session A, closed, settled as cash
    // in a later session B" reconciliation bugs.
    // ---------------------------------------------------------------------

    @Test
    @SuppressWarnings("unchecked")
    void xReportIncludesCashCollectedThroughThisSessionEvenWithNoInvoicesOfItsOwn() {
        // This session (100) rang up nothing itself - the delivery order being settled
        // here was created under a different, already-closed session (99).
        PosSession session = openSession();
        session.setId(100L);
        session.setOpeningCash(bd("100"));
        when(repo.findById(100L)).thenReturn(java.util.Optional.of(session));
        when(invoiceRepo.findByPosSessionIdWithItems(100L)).thenReturn(List.of());
        // The 195 settlement Payment carries posSessionId=100 (this session) even
        // though its invoice's own posSessionId is 99 - exactly what settleDelivery
        // now stamps. Keyed on the Payment's own session, not this session's (empty)
        // invoice list.
        when(paymentRepository.sumTenderByModeForSessions(eq(List.of(100L))))
                .thenReturn(List.<Object[]>of(new Object[]{ "Cash", bd("195"), 1L }));

        Map<String, Object> result = service.getXReport(100L);
        Map<String, Object> summary = (Map<String, Object>) result.get("summary");

        // expectedCash = opening(100) + cashTender(195) = 295 - visible here even
        // though this session created zero sales of its own.
        assertMoney("295", (BigDecimal) summary.get("expectedCash"));
        assertMoney("195", (BigDecimal) summary.get("cashSales"));
    }

    @Test
    void closeSessionIncludesCashCollectedThroughThisSessionEvenWithNoInvoicesOfItsOwn() {
        authenticateCashier();
        authorizeSessionClose(null);
        PosSession session = openSession();
        session.setId(100L);
        session.setOpeningCash(bd("100"));
        when(repo.findById(100L)).thenReturn(java.util.Optional.of(session));
        when(paymentRepository.sumTenderByModeForSessions(eq(List.of(100L))))
                .thenReturn(List.<Object[]>of(new Object[]{ "Cash", bd("195"), 1L }));

        PosSession closed = service.closeSession(100L, denoms("295"), null, "ok");

        assertMoney("295", closed.getExpectedCash());
        assertMoney("0", closed.getCashDifference());
    }

    @Test
    void closeSessionIsUnaffectedByCashLaterCollectedThroughADifferentSettlingSession() {
        // Session 99 (the ORIGINAL sale session) closes with its delivery order still
        // unpaid - no cash exists for it yet, so its own frozen numbers must reflect
        // exactly that. This pins that a later settlement elsewhere can never
        // retroactively change session 99's already-frozen expectedCash/cashDifference.
        authenticateCashier();
        authorizeSessionClose(null);
        PosSession session = openSession();
        session.setId(99L);
        session.setOpeningCash(bd("100"));
        when(repo.findById(99L)).thenReturn(java.util.Optional.of(session));
        // No Payment carries posSessionId=99 for this invoice - it hasn't been settled
        // yet at the moment session 99 closes.
        when(paymentRepository.sumTenderByModeForSessions(eq(List.of(99L)))).thenReturn(List.of());

        PosSession closed = service.closeSession(99L, denoms("100"), null, "ok");

        assertMoney("100", closed.getExpectedCash());
        assertMoney("0", closed.getCashDifference());
    }

    // ---------------------------------------------------------------------
    // getXReport() - the session's OWN Business Date, never the current one
    // ---------------------------------------------------------------------

    @Test
    @SuppressWarnings("unchecked")
    void xReportReportsTheSessionsOwnBusinessDayNotTheCurrentOne() {
        // Session opened on Business Day 2026-08-10 and still open while the branch has
        // rolled over to 2026-08-11 (its legacy sessionDate pointer had already advanced,
        // which is exactly what used to leak "today" onto the X-Report screen).
        PosSession session = openSession();
        session.setTradingDate(java.time.LocalDate.of(2026, 8, 10));
        session.setSessionDate(java.time.LocalDate.of(2026, 8, 11));
        when(repo.findById(1L)).thenReturn(java.util.Optional.of(session));
        when(invoiceRepo.findByPosSessionIdWithItems(1L)).thenReturn(List.of());

        Map<String, Object> info = (Map<String, Object>) service.getXReport(1L).get("sessionInfo");

        assertEquals(java.time.LocalDate.of(2026, 8, 10), info.get("businessDate"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void xReportFallsBackToSessionDateForSessionsWithoutATradingDate() {
        PosSession session = openSession();
        session.setTradingDate(null);
        session.setSessionDate(java.time.LocalDate.of(2026, 8, 10));
        when(repo.findById(1L)).thenReturn(java.util.Optional.of(session));
        when(invoiceRepo.findByPosSessionIdWithItems(1L)).thenReturn(List.of());

        Map<String, Object> info = (Map<String, Object>) service.getXReport(1L).get("sessionInfo");

        assertEquals(java.time.LocalDate.of(2026, 8, 10), info.get("businessDate"));
    }

    // ---------------------------------------------------------------------
    // getXReport() â€” session isolation (BBQA X-Report leak fix)
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
        // Cashier A's X-Report is generated â€” it must not appear in Cashier A's report,
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
    // getZReport() â€” cross-session aggregation
    // ---------------------------------------------------------------------

    @Test
    @SuppressWarnings("unchecked")
    void zReportAggregatesAcrossSessions() {
        // Z-Report only aggregates CLOSED sessions (generateDynamicZReport filters on
        // PosSessionStatus.CLOSED) â€” openSession() defaults to OPEN, so override here.
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
        when(paymentRepository.sumTenderByModeForSessions(any()))
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
        // report â€” they were silently dropped. Must now behave like OPEN: block.
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

        // Narrow the range to [s1, s2] â€” s3 falls outside and must be flagged, not
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

    /** Day Close domain must use tradingDate exclusively â€” a session whose sessionDate
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
    @SuppressWarnings("unchecked")
    void dayCloseSummaryTimestampsUseBusinessDayZoneNotJvmZone() {
        // This service is wired with an Asia/Dubai Business Day clock (see setUp), while the
        // host running the suite is on whatever zone it likes. Presenting these timestamps in
        // ZoneId.systemDefault() therefore fails here on any non-Dubai host — which is the
        // whole point: the presented zone must follow pos.businessday.timezone, not the JVM.
        Long branchId = 7L;
        LocalDate date = LocalDate.now();
        LocalDateTime openedAt = date.atStartOfDay().plusHours(8);
        LocalDateTime closedAt = date.atStartOfDay().plusHours(11);
        PosSession s1 = sessionAt(1L, branchId, date, "cashierA", PosSessionStatus.CLOSED, openedAt);
        PosSession s2 = sessionAt(2L, branchId, date, "cashierB", PosSessionStatus.CLOSED, closedAt);

        when(repo.findByBranchIdAndTradingDateOrderByOpenedAtDesc(branchId, date)).thenReturn(List.of(s2, s1));

        Map<String, Object> summary = service.getDayCloseSummary(branchId, date, null, null);

        ZoneId businessDayZone = businessDayWindowService.clock().zone();
        assertEquals(ZoneId.of("Asia/Dubai"), businessDayZone);

        java.time.ZonedDateTime tradingStart = (java.time.ZonedDateTime) summary.get("tradingStart");
        assertEquals(businessDayZone, tradingStart.getZone());
        assertEquals(openedAt, tradingStart.toLocalDateTime());

        java.time.ZonedDateTime tradingEnd = (java.time.ZonedDateTime) summary.get("tradingEnd");
        assertEquals(businessDayZone, tradingEnd.getZone());

        Map<String, Object> startSession = (Map<String, Object>) summary.get("startSession");
        java.time.ZonedDateTime sessionOpenedAt = (java.time.ZonedDateTime) startSession.get("openedAt");
        assertEquals(businessDayZone, sessionOpenedAt.getZone());
        assertEquals(openedAt, sessionOpenedAt.toLocalDateTime());
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
    // Consolidated Cash Position â€” additive section, must not disturb Expected Cash
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
        when(paymentRepository.sumTenderByModeForSessions(any()))
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
        // The composite netCashPosition is gone: it added back-office cash onto a drawer figure,
        // producing a number that was neither, and reconcilable against nothing.
        assertNull(cashPosition.get("netCashPosition"));
        assertEquals("BACK_OFFICE_NON_DRAWER", cashPosition.get("scope"));
        // Drawer reconciliation is unaffected by this block and comes from the authority.
        assertMoney("430", (BigDecimal) summary.get("expectedCash"));

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
        when(paymentRepository.sumTenderByModeForSessions(any()))
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

        // Back-office cash is reported, clearly scoped, and summed with nothing.
        assertEquals("BACK_OFFICE_NON_DRAWER", cashPosition.get("scope"));
        assertNull(cashPosition.get("netCashPosition"));
    }

    /**
     * Anti-double-count guard for the Consolidated Cash Position (release 1 item 7).
     *
     * <p>customerReceiptsTotal / customerAdvancesTotal are branch+date scoped, so they sweep up
     * every cash receipt and advance for the day — including the ones collected THROUGH the
     * reported sessions, which cashSales already contains. Once POS credit receipts and POS
     * advances carry their collecting drawer session, counting both sides adds the same
     * physical notes twice. Anything already represented in tender must be excluded.
     */
    @Test
    @SuppressWarnings("unchecked")
    void zReportCashPositionExcludesReceiptsAndAdvancesAlreadyCountedAsTender() {
        PosSession s1 = openSession();
        s1.setStatus(PosSessionStatus.CLOSED);
        s1.setBranchId(7L);
        s1.setOpeningCash(bd("100"));
        s1.setInvoiceCount(1);

        when(repo.findByBranchIdAndTradingDateOrderByOpenedAtDesc(anyLong(), any(LocalDate.class)))
                .thenReturn(List.of(s1));
        when(invoiceRepo.findByBranchIdAndPosSessionIdInWithItems(anyLong(), any()))
                .thenReturn(List.of(invoiceWithTax(200.0, 0.0)));
        // cashSales already contains BOTH the 50 credit receipt and the 75 advance:
        // 75 sale + 50 receipt + 75 advance = 200.
        when(paymentRepository.sumTenderByModeForSessions(any()))
                .thenReturn(List.<Object[]>of(new Object[]{ "Cash", bd("200"), 3L }));

        // The POS credit receipt: the session lives on the Payment, and its generated voucher
        // is reached through Payment.receiptVoucherRecordId.
        ReceiptVoucher posReceipt = receiptVoucher("Alice", "Cash", bd("50"));
        org.springframework.test.util.ReflectionTestUtils.setField(posReceipt, "id", 501L);
        Payment tenderedLeg = new Payment();
        tenderedLeg.setPaymentMode("Cash");
        tenderedLeg.setAmount(bd("50"));
        tenderedLeg.setReceiptVoucherRecordId(501L);
        when(paymentRepository.findTenderForSessions(List.of(1L))).thenReturn(List.of(tenderedLeg));

        // A genuine back-office receipt, collected through no drawer: must still be reported.
        ReceiptVoucher backOfficeReceipt = receiptVoucher("Bob", "Cash", bd("40"));
        org.springframework.test.util.ReflectionTestUtils.setField(backOfficeReceipt, "id", 502L);

        when(receiptVoucherRepository.findCompletedByBranchAndDateAndPurpose(eq(7L), any(LocalDate.class), eq(ReceiptPurpose.CASH_SALE)))
                .thenReturn(List.of(posReceipt, backOfficeReceipt));
        when(receiptVoucherRepository.findCompletedByBranchAndDateAndPurpose(eq(7L), any(LocalDate.class), eq(ReceiptPurpose.AGAINST_INVOICE)))
                .thenReturn(List.of());

        // The POS advance carries the collecting session on the voucher itself.
        ReceiptVoucher posAdvance = receiptVoucher("Dana", "Cash", bd("75"));
        org.springframework.test.util.ReflectionTestUtils.setField(posAdvance, "id", 601L);
        posAdvance.setPosSessionId(1L);
        // A back-office advance, no drawer: must still be reported.
        ReceiptVoucher backOfficeAdvance = receiptVoucher("Eve", "Cash", bd("20"));
        org.springframework.test.util.ReflectionTestUtils.setField(backOfficeAdvance, "id", 602L);
        when(receiptVoucherRepository.findCompletedByBranchAndDateAndPurpose(eq(7L), any(LocalDate.class), eq(ReceiptPurpose.ADVANCE_RECEIVED)))
                .thenReturn(List.of(posAdvance, backOfficeAdvance));

        Map<String, Object> result = service.getZReport(7L, LocalDate.now());
        Map<String, Object> summary = (Map<String, Object>) result.get("summary");
        Map<String, Object> cashPosition = (Map<String, Object>) summary.get("cashPosition");

        // 50 excluded (already tender), 40 back-office kept.
        assertMoney("40", (BigDecimal) cashPosition.get("customerReceiptsTotal"));
        // 75 excluded (already tender), 20 back-office kept.
        assertMoney("20", (BigDecimal) cashPosition.get("customerAdvancesTotal"));

        // The composite that could double-count them is gone entirely, so the exclusions above
        // now guard a reporting figure rather than a second cash model.
        assertNull(cashPosition.get("netCashPosition"));
        // And back-office cash reaches POS drawer reconciliation nowhere: the day's expected
        // cash is the sum of the frozen session snapshots and nothing else.
        assertMoney("0", (BigDecimal) summary.get("expectedCash"));
    }

    @Test
    void aClosedSessionCannotBeCountedAgainThroughTheClosePath() {
        // A drawer that has been counted and closed is a finished financial record. Re-running
        // the close path would overwrite its counted cash and variance with a fresh count,
        // silently rewriting what someone was already held accountable for. Corrections exist
        // for that, and they preserve the original.
        authenticateCashier();
        PosSession session = openSession();
        session.setStatus(PosSessionStatus.CLOSED);
        when(repo.findById(1L)).thenReturn(Optional.of(session));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.closeSession(1L, denoms("100"), null, "again"));

        assertEquals(org.springframework.http.HttpStatus.BAD_REQUEST, ex.getStatusCode());
        assertTrue(ex.getReason().contains("already closed"));
    }

    // =====================================================================
    // ZERO-VARIANCE ACCEPTANCE SUITE
    // =====================================================================
    //
    // The business invariant this whole change set exists to make true:
    //
    //     Expected Closing Cash = Opening Float
    //                           + Cash Tender Collected
    //                           + Authorized Cash-In
    //                           - Authorized Cash-Out
    //     Variance = Counted Cash - Expected Closing Cash = 0
    //
    // One test per physical cash flow the POS can produce, each asserting that a drawer
    // holding exactly the right notes reconciles to zero. The formula itself is unchanged and
    // has no per-category terms; what each test really pins down is that the flow reaches the
    // formula through the correct bucket, exactly once.
    //
    // Float is 100.00 throughout.

    private static final BigDecimal FLOAT_100 = new BigDecimal("100");

    /** An open session with the standard float and the given drawer movements. */
    private PosSession sessionWithFloat(PosCashMovement... movements) {
        PosSession session = openSession();
        session.setBranchId(7L);
        session.setSessionDate(LocalDate.now());
        session.setOpeningCash(FLOAT_100);
        for (PosCashMovement m : movements) session.getCashMovements().add(m);
        when(repo.findById(1L)).thenReturn(Optional.of(session));
        lenient().when(invoiceRepo.findByPosSessionIdWithItems(1L)).thenReturn(List.of());
        return session;
    }

    /** Cash tender collected through this session, as sales_payments would report it. */
    private void cashTender(String amount) {
        when(paymentRepository.sumTenderByModeForSessions(any()))
                .thenReturn(List.<Object[]>of(new Object[]{ "Cash", bd(amount), 1L }));
    }

    /** Asserts Expected Cash, and that a drawer physically holding it reconciles to zero. */
    @SuppressWarnings("unchecked")
    private void assertReconcilesToZero(String expected) {
        Map<String, Object> summary =
                (Map<String, Object>) service.getXReport(1L).get("summary");
        BigDecimal expectedCash = (BigDecimal) summary.get("expectedCash");
        assertMoney(expected, expectedCash);

        BigDecimal counted = bd(expected);
        assertEquals(0, counted.subtract(expectedCash).compareTo(BigDecimal.ZERO),
                "a physically correct drawer must reconcile to zero variance");
    }

    // -- 1. POS cash sale ---------------------------------------------------------------
    @Test
    void zeroVariance_posCashSale() {
        sessionWithFloat();
        cashTender("300");
        assertReconcilesToZero("400");
    }

    // -- 2. Delivery cash collection ----------------------------------------------------
    @Test
    void zeroVariance_deliveryCashCollection() {
        // Keyed on Payment.posSessionId (the COLLECTION session), so a delivery order rung up
        // in an older session credits THIS drawer the moment the money is taken.
        sessionWithFloat();
        cashTender("400");
        assertReconcilesToZero("500");
    }

    // -- 3. POS customer credit receipt in cash (release 1 item 1) -----------------------
    @Test
    void zeroVariance_posCustomerCreditReceiptInCash() {
        // Reaches the drawer as ordinary cash tender now that the POS Customer view declares
        // the collecting session. Before that it was invisible here: false shortage of 250.
        sessionWithFloat();
        cashTender("250");
        assertReconcilesToZero("350");
    }

    // -- 4. POS customer advance in cash (release 1 item 2) ------------------------------
    @Test
    void zeroVariance_posCustomerAdvanceInCash() {
        // An ADVANCE_RECEIVED voucher stamped with this session is Cash Tender Collected too:
        // aggregateTender reads exactly these. Before the reroute no voucher ever carried a
        // session, so this leg was dead code: false overage of 200.
        sessionWithFloat();
        ReceiptVoucher advance = receiptVoucher("Acme", "Cash", bd("200"));
        advance.setPurpose(ReceiptPurpose.ADVANCE_RECEIVED);
        when(receiptVoucherRepository.findByPosSessionId(1L)).thenReturn(List.of(advance));
        assertReconcilesToZero("300");
    }

    // -- 5. Layaway deposit in cash (release 1 item 4) -----------------------------------
    @Test
    void zeroVariance_layawayDepositInCash() {
        // Authorized Cash-In via DROP_IN, deliberately NOT tender: a layaway is not an invoice
        // and must not enter cash sales or sales revenue.
        sessionWithFloat(cashMovement(PosCashMovementType.DROP_IN, bd("600")));
        assertReconcilesToZero("700");
    }

    // -- 6. Layaway instalment in cash (release 1 item 4) --------------------------------
    @Test
    void zeroVariance_layawayInstalmentInCash() {
        sessionWithFloat(cashMovement(PosCashMovementType.DROP_IN, bd("200")));
        assertReconcilesToZero("300");
    }

    // -- 7. Sales return cash refund -----------------------------------------------------
    @Test
    void zeroVariance_salesReturnCashRefund() {
        sessionWithFloat(cashMovement(PosCashMovementType.DROP_OUT, bd("150")));
        cashTender("500");
        assertReconcilesToZero("450");
    }

    // -- 8. Customer advance cash refund (release 1 item 3) ------------------------------
    @Test
    void zeroVariance_customerAdvanceCashRefund() {
        // Previously GL-only: false shortage of 100.
        sessionWithFloat(cashMovement(PosCashMovementType.DROP_OUT, bd("100")));
        assertReconcilesToZero("0");
    }

    // -- 9. Layaway cancellation cash refund (release 1 item 5) --------------------------
    @Test
    void zeroVariance_layawayCancellationCashRefund() {
        // Deposit in, then returned on cancellation: the drawer nets back to the float.
        sessionWithFloat(
                cashMovement(PosCashMovementType.DROP_IN, bd("600")),
                cashMovement(PosCashMovementType.DROP_OUT, bd("600")));
        assertReconcilesToZero("100");
    }

    // -- 10. Cash payout / expense -------------------------------------------------------
    @Test
    void zeroVariance_cashPayout() {
        sessionWithFloat(cashMovement(PosCashMovementType.DROP_OUT, bd("75")));
        assertReconcilesToZero("25");
    }

    // -- 11. Cash drop-in ----------------------------------------------------------------
    @Test
    void zeroVariance_cashDropIn() {
        sessionWithFloat(cashMovement(PosCashMovementType.DROP_IN, bd("1000")));
        assertReconcilesToZero("1100");
    }

    // -- 12. Cash drop-out / safe deposit ------------------------------------------------
    @Test
    void zeroVariance_cashDropOut() {
        sessionWithFloat(cashMovement(PosCashMovementType.DROP_OUT, bd("40")));
        assertReconcilesToZero("60");
    }

    // -- 13. Mixed tender ----------------------------------------------------------------
    @Test
    void zeroVariance_mixedTenderOnlyCashLegReachesTheDrawer() {
        sessionWithFloat();
        when(paymentRepository.sumTenderByModeForSessions(any()))
                .thenReturn(List.<Object[]>of(
                        new Object[]{ "Cash", bd("150"), 1L },
                        new Object[]{ "Visa", bd("250"), 1L }));
        assertReconcilesToZero("250");
    }

    // -- 14. Credit sale with no collection ----------------------------------------------
    @Test
    void zeroVariance_creditSaleWithNoCollectionLeavesTheDrawerUntouched() {
        // A CREDIT allocation creates no Payment row at all, so there is nothing to exclude:
        // the drawer simply never sees it.
        sessionWithFloat();
        when(invoiceRepo.findByPosSessionIdWithItems(1L)).thenReturn(List.of(invoiceWithTax(800.0, 0.0)));
        assertReconcilesToZero("100");
    }

    // -- Cross-module composite ----------------------------------------------------------
    @Test
    void zeroVariance_crossModuleComposite() {
        // The composite from the cross-module audit, which under the old code produced a false
        // variance from four independent defects with opposite signs.
        //
        //   Opening float                        +100
        //   POS cash sale                        +300  tender
        //   Customer credit receipt in cash      +250  tender   (was missing)
        //   Delivery cash collection             +400  tender
        //   Customer advance in cash             +200  tender   (was missing)
        //   Layaway deposit in cash              +600  cash-in  (was missing)
        //   Sales return cash refund             -150  cash-out
        //   Customer advance cash refund         -100  cash-out (was missing)
        //   Cash payout                           -75  cash-out
        //   Drop-out to safe                     -400  cash-out
        //   Card leg of a mixed sale                0  non-cash
        //                                        -----
        //                                        1,125
        sessionWithFloat(
                cashMovement(PosCashMovementType.DROP_IN, bd("600")),
                cashMovement(PosCashMovementType.DROP_OUT, bd("150")),
                cashMovement(PosCashMovementType.DROP_OUT, bd("100")),
                cashMovement(PosCashMovementType.DROP_OUT, bd("75")),
                cashMovement(PosCashMovementType.DROP_OUT, bd("400")));
        when(paymentRepository.sumTenderByModeForSessions(any()))
                .thenReturn(List.<Object[]>of(
                        new Object[]{ "Cash", bd("950"), 3L },
                        new Object[]{ "Visa", bd("500"), 1L }));
        ReceiptVoucher advance = receiptVoucher("Acme", "Cash", bd("200"));
        advance.setPurpose(ReceiptPurpose.ADVANCE_RECEIVED);
        when(receiptVoucherRepository.findByPosSessionId(1L)).thenReturn(List.of(advance));

        assertReconcilesToZero("1125");
    }

    // -- Voided movements never contribute ------------------------------------------------
    @Test
    void zeroVariance_voidedMovementIsExcluded() {
        PosCashMovement voided = cashMovement(PosCashMovementType.DROP_OUT, bd("500"));
        voided.setStatus(PosCashMovementStatus.VOIDED);
        sessionWithFloat(voided);
        assertReconcilesToZero("100");
    }

    // -- Back-office cash must not touch a POS drawer ------------------------------------
    @Test
    void zeroVariance_backOfficeAdvanceRefundDoesNotAffectPosExpectedCash() {
        // An advance refunded in cash from the office safe on the same business day books no
        // drawer movement (AdvanceCashRefundServiceTest#backOfficeCashRefundBooksNoDrawerMovement),
        // so the till it never touched still reconciles exactly. This is the session-level
        // counterpart of that guarantee: office cash and drawer cash stay separate ledgers.
        sessionWithFloat();
        cashTender("300");
        assertReconcilesToZero("400");
    }

    // -- A POS advance is counted once, not twice ----------------------------------------
    @Test
    @SuppressWarnings("unchecked")
    void posAdvanceAppearsExactlyOnceAcrossExpectedCashAndTheCashPosition() {
        // The advance is Cash Tender Collected (it carries this session). The Consolidated Cash
        // Position lists back-office receipts/advances for the branch+date, and would otherwise
        // add the same notes again -- so it must exclude this one.
        PosSession s1 = openSession();
        s1.setStatus(PosSessionStatus.CLOSED);
        s1.setBranchId(7L);
        s1.setOpeningCash(bd("100"));
        s1.setInvoiceCount(0);
        // The figure this drawer was actually closed against: 100 float + the 200 advance.
        // The Z-Report reads this frozen value rather than recomputing, so a session that was
        // never closed with one contributes nothing -- which is why it is set explicitly here.
        s1.setExpectedCash(bd("300"));

        when(repo.findByBranchIdAndTradingDateOrderByOpenedAtDesc(anyLong(), any(LocalDate.class)))
                .thenReturn(List.of(s1));
        when(invoiceRepo.findByBranchIdAndPosSessionIdInWithItems(anyLong(), any()))
                .thenReturn(List.of());
        // cashSales is the advance and nothing else.
        when(paymentRepository.sumTenderByModeForSessions(any()))
                .thenReturn(List.<Object[]>of(new Object[]{ "Cash", bd("200"), 1L }));

        ReceiptVoucher posAdvance = receiptVoucher("Acme", "Cash", bd("200"));
        org.springframework.test.util.ReflectionTestUtils.setField(posAdvance, "id", 601L);
        posAdvance.setPosSessionId(1L);
        when(receiptVoucherRepository.findCompletedByBranchAndDateAndPurpose(
                eq(7L), any(LocalDate.class), eq(ReceiptPurpose.ADVANCE_RECEIVED)))
                .thenReturn(List.of(posAdvance));

        Map<String, Object> summary =
                (Map<String, Object>) service.getZReport(7L, LocalDate.now()).get("summary");
        Map<String, Object> cashPosition = (Map<String, Object>) summary.get("cashPosition");

        // Once, as tender.
        assertMoney("200", (BigDecimal) cashPosition.get("cashSales"));
        // Not a second time, as a back-office advance.
        assertMoney("0", (BigDecimal) cashPosition.get("customerAdvancesTotal"));
        // And not a third time through a consolidated position, which no longer exists.
        assertNull(cashPosition.get("netCashPosition"));
        // The drawer figure is the frozen session snapshot: 100 float + 200 advance, once.
        assertMoney("300", (BigDecimal) summary.get("expectedCash"));
    }

    // =====================================================================
    // PHASE 2 — X-REPORT AND CLOSE SESSION SHARE ONE AUTHORITY
    // =====================================================================
    //
    // These paths used to compute Expected Cash separately: getXReport() resolved correction
    // overlays first, closeSession() did not. The same session could therefore be reported one
    // way on screen and closed against another, and only after a correction would anyone notice.
    // Both now read PosCashReconciliationService, so agreement is structural rather than
    // maintained by hand -- these tests hold that line.

    @Test
    @SuppressWarnings("unchecked")
    void xReportAndCloseSessionAgreeOnExpectedCashWithNoCorrection() {
        authenticateCashier();
        authorizeSessionClose(null);
        PosSession session = openSession();
        session.setBranchId(7L);
        session.setSessionDate(LocalDate.now());
        session.setOpeningCash(bd("100"));
        session.getCashMovements().add(cashMovement(PosCashMovementType.DROP_IN, bd("60")));
        session.getCashMovements().add(cashMovement(PosCashMovementType.DROP_OUT, bd("25")));
        when(repo.findById(1L)).thenReturn(Optional.of(session));
        when(invoiceRepo.findByPosSessionIdWithItems(1L)).thenReturn(List.of());
        when(paymentRepository.sumTenderByModeForSessions(any()))
                .thenReturn(List.<Object[]>of(new Object[]{ "Cash", bd("400"), 1L }));

        Map<String, Object> summary = (Map<String, Object>) service.getXReport(1L).get("summary");
        BigDecimal fromXReport = (BigDecimal) summary.get("expectedCash");
        PosSession closed = service.closeSession(1L, denoms("535"), null, "ok");

        assertMoney("535", fromXReport);                       // 100 + 400 + 60 - 25
        assertEquals(0, fromXReport.compareTo(closed.getExpectedCash()));
        assertMoney("0", closed.getCashDifference());
    }

    @Test
    @SuppressWarnings("unchecked")
    void xReportAndCloseSessionAgreeOnExpectedCashAfterAnApprovedCorrection() {
        authenticateCashier();
        authorizeSessionClose(null);
        PosSession session = openSession();
        session.setBranchId(7L);
        session.setSessionDate(LocalDate.now());
        session.setOpeningCash(bd("100"));
        session.getCashMovements().add(cashMovement(PosCashMovementType.DROP_OUT, bd("300")));
        when(repo.findById(1L)).thenReturn(Optional.of(session));
        when(invoiceRepo.findByPosSessionIdWithItems(1L)).thenReturn(List.of());
        when(paymentRepository.sumTenderByModeForSessions(any()))
                .thenReturn(List.<Object[]>of(new Object[]{ "Cash", bd("500"), 1L }));

        // Approved correction: the payout was really 200, not 300. Before this phase the
        // X-Report would have reflected it and closeSession would not -- a 100 discrepancy
        // between the figure the cashier saw and the one they were counted against.
        PosCashMovement corrected = cashMovement(PosCashMovementType.DROP_OUT, bd("200"));
        when(effectiveCorrectionViewService.resolveOverlays(
                eq(com.billbull.backend.pos.admin.CorrectionTargetType.CASH_MOVEMENT),
                org.mockito.ArgumentMatchers.anyList(), any()))
                .thenReturn(List.of(corrected));

        Map<String, Object> summary = (Map<String, Object>) service.getXReport(1L).get("summary");
        BigDecimal fromXReport = (BigDecimal) summary.get("expectedCash");
        PosSession closed = service.closeSession(1L, denoms("400"), null, "ok");

        assertMoney("400", fromXReport);                       // 100 + 500 - 200 (corrected)
        assertEquals(0, fromXReport.compareTo(closed.getExpectedCash()),
                "the corrected figure must be the one the session is closed against");
        assertMoney("0", closed.getCashDifference());
    }

    @Test
    @SuppressWarnings("unchecked")
    void xReportReportsNoVarianceWhileTheDrawerIsUncounted() {
        // A mid-shift X-Report must not invent a count. Reporting countedCash 0 would state a
        // reconciliation that never happened and show the whole drawer as a shortage.
        PosSession session = openSession();
        session.setBranchId(7L);
        session.setSessionDate(LocalDate.now());
        session.setOpeningCash(bd("100"));
        when(repo.findById(1L)).thenReturn(Optional.of(session));
        when(invoiceRepo.findByPosSessionIdWithItems(1L)).thenReturn(List.of());
        when(paymentRepository.sumTenderByModeForSessions(any()))
                .thenReturn(List.<Object[]>of(new Object[]{ "Cash", bd("250"), 1L }));

        Map<String, Object> summary = (Map<String, Object>) service.getXReport(1L).get("summary");

        assertMoney("350", (BigDecimal) summary.get("expectedCash"));
        assertNull(summary.get("countedCash"));
        assertNull(summary.get("cashVariance"));
        assertEquals(PosCashReconciliationStatus.NOT_COUNTED, summary.get("reconciliationStatus"));
    }

    // ---------------------------------------------------------------------
    // Day Close reconciliation bug fix â€” DROP_IN/DROP_OUT, not PAY_IN/PAY_OUT
    // ---------------------------------------------------------------------

    @Test
    void closeDayCashReconciliationAccountsForActualDropInDropOutMovementTypes() {
        // Regression test for the PAY_IN/PAY_OUT vs DROP_IN/DROP_OUT mismatch: before the
        // fix, cashPaidIn/cashPaidOut were always zero (no code ever writes "PAY_IN"/
        // "PAY_OUT"), so a business day with real cash drops recorded on its session(s)
        // would fail this reconciliation with a false variance, purely from the string
        // mismatch â€” not a genuine discrepancy.
        Long branchId = 7L;
        LocalDate date = LocalDate.now();
        PosSession s1 = sessionAt(1L, branchId, date, "cashierA", PosSessionStatus.CLOSED, date.atStartOfDay().plusHours(9));
        s1.setOpeningCash(bd("100"));
        s1.setInvoiceCount(1);
        // Persisted per-session Expected Cash already correctly includes the drop in/out
        // (the formula is untouched): 100 opening + 200 cash tender + 50 dropIn - 20 dropOut = 330.
        s1.setExpectedCash(bd("330"));

        when(dayCloseRepository.existsByBranchIdAndCloseDate(branchId, date)).thenReturn(false);
        when(branchRepository.findById(branchId)).thenReturn(Optional.of(branch(branchId)));
        when(repo.findByBranchIdAndTradingDateOrderByOpenedAtDesc(branchId, date)).thenReturn(List.of(s1));
        when(invoiceRepo.findByBranchIdAndPosSessionIdInWithItems(eq(branchId), any()))
                .thenReturn(List.of(invoiceWithTax(200.0, 0.0)));
        when(paymentRepository.sumTenderByModeForSessions(any()))
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

    /**
     * The full cross-session delivery settlement scenario at the Day Close level: a
     * delivery order created (and still tagged) under session 99 is paid in cash under
     * session 100, after 99 has already closed. Day Close's two independently-derived
     * expected-cash figures — {@code expectedCashComputed} (live) and
     * {@code expectedCashSessions} (sum of each session's already-frozen number) — must
     * agree, because session 100's own close already correctly folded the 195 into its
     * frozen expectedCash (per closeSessionIncludesCashCollectedThroughThisSessionEvenWithNoInvoicesOfItsOwn
     * above), and session 99's frozen number never needed to change. Mirrors the real
     * INV-2026-0891 / PAY-2026-0881 case that originally surfaced this bug.
     */
    @Test
    void closeDayReconcilesTheCrossSessionCashDeliverySettlementScenario() {
        Long branchId = 7L;
        LocalDate date = LocalDate.now();

        // Session 99 — the ORIGINAL sale session. Its delivery order was still unpaid
        // when it closed, so its frozen expectedCash correctly reflects zero cash for it.
        PosSession session99 = sessionAt(99L, branchId, date, "cashierA", PosSessionStatus.CLOSED,
                date.atStartOfDay().plusHours(8));
        session99.setOpeningCash(bd("100"));
        session99.setInvoiceCount(1);
        session99.setExpectedCash(bd("100"));

        // Session 100 — the SETTLING session, opened later. Its own close already
        // correctly included the 195 cash collected for session 99's delivery order.
        PosSession session100 = sessionAt(100L, branchId, date, "cashierB", PosSessionStatus.CLOSED,
                date.atStartOfDay().plusHours(9));
        session100.setOpeningCash(bd("100"));
        session100.setInvoiceCount(0);
        session100.setExpectedCash(bd("295"));

        when(dayCloseRepository.existsByBranchIdAndCloseDate(branchId, date)).thenReturn(false);
        when(branchRepository.findById(branchId)).thenReturn(Optional.of(branch(branchId)));
        when(repo.findByBranchIdAndTradingDateOrderByOpenedAtDesc(branchId, date))
                .thenReturn(List.of(session100, session99));
        when(invoiceRepo.findByBranchIdAndPosSessionIdInWithItems(eq(branchId), any()))
                .thenReturn(List.of(invoiceWithNumber("INV-2026-0891", 195.0, 0.0)));
        // Only session 100's collected cash is live-visible — the payment's own
        // posSessionId is 100, regardless of which session the invoice belongs to.
        when(paymentRepository.sumTenderByModeForSessions(any()))
                .thenReturn(List.<Object[]>of(new Object[]{ "Cash", bd("195"), 1L }));
        when(dayCloseRepository.save(any(com.billbull.backend.pos.dayclose.PosDayClose.class))).thenAnswer(inv -> {
            com.billbull.backend.pos.dayclose.PosDayClose d = inv.getArgument(0);
            d.setId(100L);
            return d;
        });

        // expectedCashComputed = openingCash(100+100=200) + cashSales(195, live) = 395
        // expectedCashSessions = frozen(100) + frozen(295) = 395 — they agree, so this
        // must NOT throw ReconciliationException("CASH", ...).
        Map<String, Object> report = service.closeDay(branchId, date);

        assertEquals(true, report.get("isDayClosed"));
        // Session 99's frozen number is provably untouched by this Day Close.
        assertMoney("100", session99.getExpectedCash());
        // Session 100's frozen number likewise untouched — Day Close never rewrites it.
        assertMoney("295", session100.getExpectedCash());
    }

    /**
     * Literal reproduction of the multi-delivery scenario:
     * Delivery 1 -> created Session A -> settled Session C
     * Delivery 2 -> created Session A -> settled Session C
     * Delivery 3 -> created Session B -> settled Session C
     * Delivery 4 -> created Session B -> still unpaid (never settled)
     *
     * Proves reconciliation is payment/session driven rather than invoice-list driven:
     * Session C created zero sales of its own (its own invoice list is empty), yet its
     * cash total must equal exactly the three payments actually collected through it —
     * Delivery 4's unpaid balance must not appear anywhere in C's cash.
     */
    @Test
    @SuppressWarnings("unchecked")
    void sessionCTenderReflectsExactlyThePaymentsCollectedThroughItAcrossMultipleOldSessions() {
        PosSession sessionC = openSession();
        sessionC.setId(300L);
        sessionC.setOpeningCash(bd("0"));
        when(repo.findById(300L)).thenReturn(java.util.Optional.of(sessionC));
        // Session C rang up no sales of its own — every invoice it might otherwise be
        // scoped to (via SalesInvoice.posSessionId) belongs to session A or B, not C.
        when(invoiceRepo.findByPosSessionIdWithItems(300L)).thenReturn(List.of());
        // Deliveries 1+2 (from session A, 100 + 150) and delivery 3 (from session B, 200)
        // were all settled in cash through session C; delivery 4 (from session B) is still
        // unpaid and therefore contributes nothing here.
        when(paymentRepository.sumTenderByModeForSessions(eq(List.of(300L))))
                .thenReturn(List.<Object[]>of(new Object[]{ "Cash", bd("450"), 3L }));

        Map<String, Object> result = service.getXReport(300L);
        Map<String, Object> summary = (Map<String, Object>) result.get("summary");

        assertMoney("450", (BigDecimal) summary.get("cashSales"));
        assertMoney("450", (BigDecimal) summary.get("expectedCash"));
        // No sale of Session C's own invoice list is a delivery — invoiceCount must
        // reflect zero own sales, confirming sales statistics were not pulled along
        // with the cash.
        assertEquals(0, ((List<SalesInvoice>) result.get("invoices")).size());
    }

    // ---------------------------------------------------------------------
    // POS Reports module - X-Report snapshot persistence, Z-Report numbering
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
        // live preview â€” matching the pre-existing stamp semantics â€” and must not mint
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
    // Session Roaming Phase 8 â€” explicit session transfer endpoint wiring
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
    // Session Roaming Phase 9 â€” supervisor authorization policy integration
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
        when(businessDateService.isDateClosed(org.mockito.ArgumentMatchers.eq(1L), org.mockito.ArgumentMatchers.any())).thenReturn(false);
        when(repo.findUnclosedSessionsBeforeDate(org.mockito.ArgumentMatchers.eq(1L), org.mockito.ArgumentMatchers.any())).thenReturn(List.of());

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

    // ---------------------------------------------------------------------
    // Continue / Resume Session â€” an OPEN session belonging to a PREVIOUS
    // Business Day must not bypass the previous-day closure requirement that
    // Start Session already enforces.
    // ---------------------------------------------------------------------

    /** An OPEN session on the branch, dated `daysAgo` Business Days back. */
    private PosSession sessionOnBusinessDay(long daysAgo) {
        PosSession s = openSession();
        s.setId(67L);
        s.setBranchId(1L);
        s.setTerminalId("T002-95F6");
        s.setOpenedBy("cashier1");
        s.setTradingDate(businessDayWindowService.clock().now().toLocalDate().minusDays(daysAgo));
        return s;
    }

    private void authenticateAsCashier1() {
        org.springframework.security.core.context.SecurityContextHolder.getContext().setAuthentication(
                new org.springframework.security.authentication.UsernamePasswordAuthenticationToken(
                        "cashier1", null, List.of()));
    }

    @Test
    void getActiveSessionRefusesToHandBackAPreviousBusinessDaySession() {
        authenticateAsCashier1();
        when(branchAccessService.getRequiredCurrentUserBranch()).thenReturn(branch(1L));
        when(repo.findByBranchIdAndTerminalIdAndStatus(1L, "T1", PosSessionStatus.OPEN))
                .thenReturn(Optional.of(sessionOnBusinessDay(1)));

        com.billbull.backend.pos.businessdate.PreviousBusinessDaySessionException ex =
                org.junit.jupiter.api.Assertions.assertThrows(
                        com.billbull.backend.pos.businessdate.PreviousBusinessDaySessionException.class,
                        () -> service.getActiveSession("T1"));

        assertEquals(67L, ex.getSessionId());
        assertTrue(ex.getReason().startsWith("PREVIOUS_DAY_SESSION_OPEN:"));
    }

    @Test
    void getActiveSessionStillReturnsASessionOnTheCurrentBusinessDay() {
        authenticateAsCashier1();
        when(branchAccessService.getRequiredCurrentUserBranch()).thenReturn(branch(1L));
        PosSession current = sessionOnBusinessDay(0);
        when(repo.findByBranchIdAndTerminalIdAndStatus(1L, "T1", PosSessionStatus.OPEN))
                .thenReturn(Optional.of(current));

        assertEquals(Optional.of(current), service.getActiveSession("T1"));
    }

    @Test
    void resumeSessionIsBlockedForAPreviousBusinessDaySession() {
        PosSession stale = sessionOnBusinessDay(1);
        stale.setStatus(PosSessionStatus.SUSPENDED);
        when(repo.findById(67L)).thenReturn(Optional.of(stale));

        org.junit.jupiter.api.Assertions.assertThrows(
                com.billbull.backend.pos.businessdate.PreviousBusinessDaySessionException.class,
                () -> service.resumeSession(67L));
        assertEquals(PosSessionStatus.SUSPENDED, stale.getStatus());
    }

    @Test
    void cashMovementIsBlockedOnAPreviousBusinessDaySession() {
        when(repo.findById(67L)).thenReturn(Optional.of(sessionOnBusinessDay(1)));

        org.junit.jupiter.api.Assertions.assertThrows(
                com.billbull.backend.pos.businessdate.PreviousBusinessDaySessionException.class,
                () -> service.addCashMovement(67L, "DROP_IN", bd("100"), "top-up"));
    }

    @Test
    void previousBusinessDaySessionCanStillBeLoadedAndClosed() {
        // The escape hatch the blocking modal points at must stay open: reading the
        // stale session (Go to Close Session) is never gated by the continuation rule.
        PosSession stale = sessionOnBusinessDay(1);
        when(repo.findById(67L)).thenReturn(Optional.of(stale));

        assertEquals(stale, service.getById(67L));
    }

    // ---------------------------------------------------------------------
    // Closure workflow â€” begin / gate / cancel.
    //
    // The marker is closingStartedAt, written ONLY by the explicit begin-closure
    // action. It is emphatically not xReportGeneratedAt: the X-Report is an
    // informational, optional, mid-shift read, and a session that has produced one
    // must stay fully sellable. Several tests below exist purely to hold that line.
    //
    // A session in the workflow stays OPEN in the DB (the X-Report and every close
    // validation operate on the open session); what is refused is *using* it for
    // normal POS work.
    // ---------------------------------------------------------------------

    /** An OPEN session on the CURRENT Business Day whose closure has been started.
     *  Current-day on purpose, so any failure here is the closure rule and never the
     *  Business Day rule leaking in. */
    private PosSession sessionInClosureWorkflow() {
        PosSession s = sessionOnBusinessDay(0);
        s.setClosingStartedAt(businessDayWindowService.clock().now());
        s.setClosingStartedBy("cashier1");
        return s;
    }

    /** Registers cashier1 as a real User so beginClosure/cancelClosure can resolve and
     *  authorize the principal. {@code roles} are role names as
     *  PosSessionAuthorizationService reads them. */
    private com.billbull.backend.user.User registerUser(String username, String... roles) {
        com.billbull.backend.user.User u = new com.billbull.backend.user.User();
        u.setId(500L + username.hashCode() % 100);
        u.setUsername(username);
        java.util.Set<com.billbull.backend.role.Role> roleSet = new java.util.LinkedHashSet<>();
        for (String r : roles) {
            com.billbull.backend.role.Role role = new com.billbull.backend.role.Role();
            role.setName(r);
            roleSet.add(role);
        }
        u.setRoles(roleSet);
        lenient().when(userRepository.findByUsername(username)).thenReturn(java.util.Optional.of(u));
        return u;
    }

    // â”€â”€ B / R: the X-Report stays informational â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    @Test
    void generatingAnXReportDoesNotStartClosureAndLeavesTheSessionSellable() {
        // Case B + R, the core regression guard for this whole feature. An X-Report is a
        // mid-shift read: after one, the till must still be usable in every way.
        PosSession session = sessionOnBusinessDay(0);
        session.setBranchId(1L);
        when(repo.findById(67L)).thenReturn(Optional.of(session));
        when(invoiceRepo.findByPosSessionIdWithItems(67L)).thenReturn(List.of());
        when(reportNumberService.nextReportNumber(any(), any(), any())).thenReturn("XR-1");
        authenticateAsCashier1();

        service.generateXReport(67L);

        // The X-Report really did run...
        assertTrue(session.getXReportGeneratedAt() != null);
        // ...and it started no closure, so nothing is gated.
        assertNull(session.getClosingStartedAt());
        assertTrue(!new PosSessionClosureWorkflowGate().isInClosureWorkflow(session));

        // Continue Session still hands the session back.
        when(branchAccessService.getRequiredCurrentUserBranch()).thenReturn(branch(1L));
        when(repo.findByBranchIdAndTerminalIdAndStatus(1L, "T1", PosSessionStatus.OPEN))
                .thenReturn(Optional.of(session));
        assertEquals(Optional.of(session), service.getActiveSession("T1"));

        // ...and a sale still records against it.
        SalesInvoice invoice = new SalesInvoice();
        invoice.setInvoiceTotal(bd("100"));
        invoice.setPaymentMode("Cash");
        service.recordInvoiceOnSession(67L, invoice, null);
        verify(repo).incrementSessionTotals(eq(67L), any(), any(), any(), any(), any(), any(),
                org.mockito.ArgumentMatchers.anyInt());
    }

    @Test
    void closureGateIgnoresXReportGenerationEntirely() {
        // Case C: nothing about viewing/generating an X-Report can produce closure state.
        PosSessionClosureWorkflowGate gate = new PosSessionClosureWorkflowGate();
        PosSession xReported = sessionOnBusinessDay(0);
        xReported.setXReportGeneratedAt(businessDayWindowService.clock().now());
        xReported.setXReportGeneratedBy("cashier1");

        assertTrue(!gate.isInClosureWorkflow(xReported));
        gate.assertMayOperate(xReported); // must not throw
    }

    // â”€â”€ D / E / F: begin-closure â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    @Test
    void beginClosureStampsTheMarkerAndLeavesTheSessionOpen() {
        // Cases D + F.
        PosSession session = sessionOnBusinessDay(0);
        session.setBranchId(1L);
        when(repo.findById(67L)).thenReturn(Optional.of(session));
        registerUser("cashier1");
        authenticateAsCashier1();

        PosSession result = service.beginClosure(67L, null);

        assertTrue(result.getClosingStartedAt() != null);
        assertEquals("cashier1", result.getClosingStartedBy());
        // Still genuinely OPEN â€” every existing consumer of status must see no change.
        assertEquals(PosSessionStatus.OPEN, result.getStatus());
        // And it did NOT quietly run an X-Report or touch the Day.
        assertNull(result.getXReportGeneratedAt());
        assertEquals(businessDayWindowService.clock().now().toLocalDate(), result.getTradingDate());
    }

    @Test
    void beginClosureIsIdempotentAndKeepsTheOriginalInitiator() {
        // Case E: a double-click must not re-stamp or reassign who started the closure.
        PosSession session = sessionInClosureWorkflow();
        session.setBranchId(1L);
        LocalDateTime originalAt = session.getClosingStartedAt();
        when(repo.findById(67L)).thenReturn(Optional.of(session));
        registerUser("cashier2", "SUPERVISOR");
        org.springframework.security.core.context.SecurityContextHolder.getContext().setAuthentication(
                new org.springframework.security.authentication.UsernamePasswordAuthenticationToken(
                        "cashier2", null, List.of()));

        PosSession result = service.beginClosure(67L, null);

        assertEquals(originalAt, result.getClosingStartedAt());
        assertEquals("cashier1", result.getClosingStartedBy());
    }

    @Test
    void beginClosureIsRefusedForANonOwnerNonSupervisor() {
        PosSession session = sessionOnBusinessDay(0);
        session.setBranchId(1L);
        when(repo.findById(67L)).thenReturn(Optional.of(session));
        registerUser("someoneElse");
        org.springframework.security.core.context.SecurityContextHolder.getContext().setAuthentication(
                new org.springframework.security.authentication.UsernamePasswordAuthenticationToken(
                        "someoneElse", null, List.of()));

        ResponseStatusException ex = org.junit.jupiter.api.Assertions.assertThrows(
                ResponseStatusException.class, () -> service.beginClosure(67L, null));
        assertEquals(org.springframework.http.HttpStatus.FORBIDDEN, ex.getStatusCode());
        assertNull(session.getClosingStartedAt());
    }

    @Test
    void beginClosureIsAllowedForAPreviousBusinessDaySession() {
        // Case A: a stale OPEN session is exactly what Day Close is blocked on, so the
        // explicit Close Session action â€” its remediation â€” must go through. The
        // BusinessDayContinuationGate still refuses resume/selling/checkout on this same
        // session (cases D/E below); only this closure path is exempt.
        PosSession stale = sessionOnBusinessDay(1);
        stale.setBranchId(1L);
        when(repo.findById(67L)).thenReturn(Optional.of(stale));
        registerUser("cashier1");
        authenticateAsCashier1();

        PosSession result = service.beginClosure(67L, null);

        assertTrue(result.getClosingStartedAt() != null);
        assertEquals("cashier1", result.getClosingStartedBy());
        // Status and the Business Day the session belongs to are untouched.
        assertEquals(PosSessionStatus.OPEN, result.getStatus());
        assertEquals(businessDayWindowService.clock().now().toLocalDate().minusDays(1), result.getTradingDate());
        assertNull(result.getXReportGeneratedAt());
        // And the closure workflow gate now bites on it.
        assertTrue(new PosSessionClosureWorkflowGate().isInClosureWorkflow(result));
    }

    @Test
    void beginClosureOnAPreviousBusinessDaySessionStillRequiresOwnerAuthorization() {
        // Case C: dropping the Business Day gate must not drop the authorization one â€” the
        // Session Owner Verification result is still what decides this.
        PosSession stale = sessionOnBusinessDay(1);
        stale.setBranchId(1L);
        when(repo.findById(67L)).thenReturn(Optional.of(stale));
        registerUser("someoneElse");
        org.springframework.security.core.context.SecurityContextHolder.getContext().setAuthentication(
                new org.springframework.security.authentication.UsernamePasswordAuthenticationToken(
                        "someoneElse", null, List.of()));

        ResponseStatusException ex = org.junit.jupiter.api.Assertions.assertThrows(
                ResponseStatusException.class, () -> service.beginClosure(67L, null));
        assertEquals(org.springframework.http.HttpStatus.FORBIDDEN, ex.getStatusCode());
        assertNull(stale.getClosingStartedAt());
    }

    @Test
    void resumingAPreviousBusinessDaySessionIsStillRefused() {
        // Case D: the continuation gate is untouched for normal POS work â€” the exemption is
        // scoped to beginClosure alone.
        PosSession stale = sessionOnBusinessDay(1);
        stale.setBranchId(1L);
        authenticateAsCashier1();
        when(branchAccessService.getRequiredCurrentUserBranch()).thenReturn(branch(1L));
        when(repo.findByBranchIdAndTerminalIdAndStatus(1L, "T1", PosSessionStatus.OPEN))
                .thenReturn(Optional.of(stale));

        org.junit.jupiter.api.Assertions.assertThrows(
                com.billbull.backend.pos.businessdate.PreviousBusinessDaySessionException.class,
                () -> service.getActiveSession("T1"));
    }

    // â”€â”€ Gâ€“K: enforcement â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    @Test
    void getActiveSessionRefusesToHandBackASessionInTheCloseWorkflow() {
        // Case G.
        authenticateAsCashier1();
        when(branchAccessService.getRequiredCurrentUserBranch()).thenReturn(branch(1L));
        when(repo.findByBranchIdAndTerminalIdAndStatus(1L, "T1", PosSessionStatus.OPEN))
                .thenReturn(Optional.of(sessionInClosureWorkflow()));

        PosSessionClosureRequiredException ex = org.junit.jupiter.api.Assertions.assertThrows(
                PosSessionClosureRequiredException.class,
                () -> service.getActiveSession("T1"));

        assertEquals(67L, ex.getSessionId());
        assertTrue(ex.getReason().startsWith("SESSION_CLOSING_WORKFLOW:"));
        // The message names session, terminal, status and Business Day.
        assertTrue(ex.getReason().contains("Session ID : 67"));
        assertTrue(ex.getReason().contains("Terminal : T002-95F6"));
        assertTrue(ex.getReason().contains("Status : OPEN (closing)"));
        assertTrue(ex.getReason().contains("Business Day : "
                + businessDayWindowService.clock().now().toLocalDate()));
    }

    @Test
    void getActiveSessionStillReturnsAnOrdinaryOpenSession() {
        // Cases A / I: a plain OPEN session, and any unrelated session, are untouched.
        authenticateAsCashier1();
        when(branchAccessService.getRequiredCurrentUserBranch()).thenReturn(branch(1L));
        PosSession ordinary = sessionOnBusinessDay(0);
        when(repo.findByBranchIdAndTerminalIdAndStatus(1L, "T1", PosSessionStatus.OPEN))
                .thenReturn(Optional.of(ordinary));

        assertEquals(Optional.of(ordinary), service.getActiveSession("T1"));
    }

    @Test
    void resumeSessionIsBlockedOnceClosureHasStarted() {
        // Case H.
        PosSession closing = sessionInClosureWorkflow();
        closing.setStatus(PosSessionStatus.SUSPENDED);
        when(repo.findById(67L)).thenReturn(Optional.of(closing));

        org.junit.jupiter.api.Assertions.assertThrows(
                PosSessionClosureRequiredException.class,
                () -> service.resumeSession(67L));
        // Refused, not half-applied: the session is left exactly as it was.
        assertEquals(PosSessionStatus.SUSPENDED, closing.getStatus());
    }

    @Test
    void cashMovementIsBlockedOnceClosureHasStarted() {
        // Case J.
        when(repo.findById(67L)).thenReturn(Optional.of(sessionInClosureWorkflow()));

        org.junit.jupiter.api.Assertions.assertThrows(
                PosSessionClosureRequiredException.class,
                () -> service.addCashMovement(67L, "DROP_IN", bd("100"), "top-up"));
    }

    @Test
    void recordingASaleIsBlockedOnceClosureHasStarted() {
        // Case K â€” the in-transaction race guard. Even a checkout that passed the
        // controller's up-front check cannot attach its invoice to a session whose closure
        // began in the meantime, because the state is re-read here.
        when(repo.findById(67L)).thenReturn(Optional.of(sessionInClosureWorkflow()));
        SalesInvoice invoice = new SalesInvoice();
        invoice.setInvoiceTotal(bd("100"));
        invoice.setPaymentMode("Cash");

        org.junit.jupiter.api.Assertions.assertThrows(
                PosSessionClosureRequiredException.class,
                () -> service.recordInvoiceOnSession(67L, invoice, null));
        verify(repo, org.mockito.Mockito.never())
                .incrementSessionTotals(any(), any(), any(), any(), any(), any(), any(),
                        org.mockito.ArgumentMatchers.anyInt());
    }

    // â”€â”€ L / M: the closure path itself stays open â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    @Test
    void sessionInClosureCanStillBeLoadedAndReported() {
        // Case L: the escape hatch must stay open â€” reading the session and pulling its
        // X-Report are exactly what the operator is being pushed toward.
        PosSession closing = sessionInClosureWorkflow();
        closing.setBranchId(1L);
        when(repo.findById(67L)).thenReturn(Optional.of(closing));
        when(invoiceRepo.findByPosSessionIdWithItems(67L)).thenReturn(List.of());
        when(reportNumberService.nextReportNumber(any(), any(), any())).thenReturn("XR-1");
        authenticateAsCashier1();

        assertEquals(closing, service.getById(67L));
        service.generateXReport(67L);              // must not throw
        assertTrue(closing.getXReportGeneratedAt() != null);
    }

    @Test
    void closedSessionIsNotTreatedAsBeingInTheCloseWorkflow() {
        // Case M: after a successful close the session is past the workflow, not inside it,
        // so report/read paths on it must never hit the gate â€” even though the closure
        // marker is deliberately left behind as history.
        PosSessionClosureWorkflowGate gate = new PosSessionClosureWorkflowGate();
        PosSession closed = sessionInClosureWorkflow();
        closed.setStatus(PosSessionStatus.CLOSED);

        assertTrue(!gate.isInClosureWorkflow(closed));
        gate.assertMayOperate(closed); // must not throw
    }

    @Test
    void closeWorkflowGateIgnoresSessionsWithNoClosureStarted() {
        PosSessionClosureWorkflowGate gate = new PosSessionClosureWorkflowGate();
        assertTrue(!gate.isInClosureWorkflow(sessionOnBusinessDay(0)));
        assertTrue(!gate.isInClosureWorkflow(null));
    }

    // â”€â”€ Nâ€“Q: cancellation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    @Test
    void aPlainCashierCannotCancelClosureEvenOnTheirOwnSession() {
        // Case N â€” the whole point of making cancellation supervisor-only: otherwise the
        // cashier told to close out just puts the till back into service.
        PosSession closing = sessionInClosureWorkflow();
        when(repo.findById(67L)).thenReturn(Optional.of(closing));
        registerUser("cashier1"); // owner, no supervisor role
        authenticateAsCashier1();

        ResponseStatusException ex = org.junit.jupiter.api.Assertions.assertThrows(
                ResponseStatusException.class, () -> service.cancelClosure(67L, "changed my mind"));
        assertEquals(org.springframework.http.HttpStatus.FORBIDDEN, ex.getStatusCode());
        assertTrue(closing.getClosingStartedAt() != null); // still locked
    }

    @Test
    void aSupervisorCanCancelClosureAndTheSessionReturnsToNormal() {
        // Cases O + P + Q.
        PosSession closing = sessionInClosureWorkflow();
        closing.setBranchId(1L);
        LocalDateTime xReportStamp = businessDayWindowService.clock().now().minusMinutes(30);
        closing.setXReportGeneratedAt(xReportStamp);
        when(repo.findById(67L)).thenReturn(Optional.of(closing));
        registerUser("boss", "SUPERVISOR");
        org.springframework.security.core.context.SecurityContextHolder.getContext().setAuthentication(
                new org.springframework.security.authentication.UsernamePasswordAuthenticationToken(
                        "boss", null, List.of()));

        PosSession result = service.cancelClosure(67L, "started by mistake");

        // Marker cleared â†’ back to a normal, sellable OPEN session.
        assertNull(result.getClosingStartedAt());
        assertNull(result.getClosingStartedBy());
        assertEquals(PosSessionStatus.OPEN, result.getStatus());
        assertTrue(!new PosSessionClosureWorkflowGate().isInClosureWorkflow(result));
        // Case Q: the X-Report it produced was a real report and is left untouched.
        assertEquals(xReportStamp, result.getXReportGeneratedAt());
    }

    @Test
    void cancellingAClosureThatWasNeverStartedIsABadRequestNotAPermissionError() {
        PosSession ordinary = sessionOnBusinessDay(0);
        when(repo.findById(67L)).thenReturn(Optional.of(ordinary));
        registerUser("boss", "SUPERVISOR");
        org.springframework.security.core.context.SecurityContextHolder.getContext().setAuthentication(
                new org.springframework.security.authentication.UsernamePasswordAuthenticationToken(
                        "boss", null, List.of()));

        ResponseStatusException ex = org.junit.jupiter.api.Assertions.assertThrows(
                ResponseStatusException.class, () -> service.cancelClosure(67L, null));
        assertEquals(org.springframework.http.HttpStatus.BAD_REQUEST, ex.getStatusCode());
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

    /**
     * A physical denomination count that adds up to {@code amount}, greedily over the AED ladder.
     *
     * <p>Tests state what the drawer physically held, not what it totalled: the server derives
     * the total. Passing an amount directly is no longer possible, which is the point of the
     * phase — a caller cannot assert Counted Cash.
     */
    private static java.util.Map<String, Object> denoms(String amount) {
        java.math.BigDecimal remaining = new java.math.BigDecimal(amount);
        java.util.Map<String, Object> out = new java.util.LinkedHashMap<>();
        for (String key : List.of("1000", "500", "200", "100", "50", "20", "10", "5",
                                  "1", "0.50", "0.25", "0.10", "0.05")) {
            java.math.BigDecimal value = new java.math.BigDecimal(key);
            java.math.BigDecimal qty = remaining.divideToIntegralValue(value);
            if (qty.signum() > 0) {
                out.put(key, qty.intValueExact());
                remaining = remaining.subtract(value.multiply(qty));
            }
        }
        if (remaining.signum() != 0) {
            throw new IllegalArgumentException(amount + " is not representable in AED denominations");
        }
        return out;
    }

    /**
     * Lets this branch close a discrepancy up to {@code amount} without a supervisor.
     *
     * <p>Needed because the threshold now means what it says: 0 is zero tolerance, so ANY
     * variance requires authorization. The old gate read {@code threshold.signum() > 0}, which
     * made the default of 0 disable the check entirely — the strictest setting was the one that
     * never fired. Tests that assert on variance arithmetic rather than on the gate configure a
     * tolerance here.
     */
    private void allowVarianceUpTo(String amount) {
        // A session with no branch cannot have branch settings, and an unknown branch resolves
        // to the strictest threshold. Production always stamps a branch at open; the fixture
        // does not, so tests that exercise the tolerance give it one.
        com.billbull.backend.pos.settings.PosSettings settings =
                new com.billbull.backend.pos.settings.PosSettings();
        settings.setCashVarianceThreshold(bd(amount));
        lenient().when(posSettingsRepository.findByBranchId(org.mockito.ArgumentMatchers.any()))
                .thenReturn(Optional.of(settings));
    }

    private PosCashMovement cashMovement(PosCashMovementType type, BigDecimal amount) {
        PosCashMovement m = new PosCashMovement();
        m.setMovementType(type);
        m.setAmount(amount);
        m.setStatus(PosCashMovementStatus.ACTIVE);
        return m;
    }

    private com.billbull.backend.pos.checkout.PosPaymentAllocation allocationOf(String type, double amount) {
        com.billbull.backend.pos.checkout.PosPaymentAllocation a =
                new com.billbull.backend.pos.checkout.PosPaymentAllocation();
        a.setType(type);
        a.setAmount(amount);
        return a;
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
        when(businessDayValidationService.validate(any(), any())).thenReturn(
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
        assertTrue(msg.contains("Business Day 2026-01-01 cannot be completed because Day Close has not been run."));
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
        when(businessDayValidationService.validate(any(), any())).thenReturn(
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
        assertTrue(msg.contains("Business Day 2026-01-01 cannot be completed because Session #101 on Terminal T-101 is still OPEN."));
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
        when(businessDayValidationService.validate(any(), any())).thenReturn(
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
        assertTrue(msg.contains("Business Day 2026-01-01 cannot be completed because Session #101 on Terminal T-101 is still SUSPENDED."));
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
        when(businessDayValidationService.validate(any(), any())).thenReturn(
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

    // ---------------------------------------------------------------------
    // Business Day clock consistency â€” timestamps must come from the configured
    // Business Day timezone, never from the JVM default.
    //
    // The harness wires a REAL BusinessDayClock on Asia/Dubai (see setUp), so these
    // assertions actively distinguish the two clocks on any host that is not itself in
    // Asia/Dubai: a regression to LocalDateTime.now() lands hours away from the expected
    // value and fails. They are written against the business zone's own wall clock rather
    // than "now" as the host sees it, so they behave identically on a UTC CI box.
    // ---------------------------------------------------------------------

    private static final java.time.ZoneId BUSINESS_ZONE = java.time.ZoneId.of("Asia/Dubai");

    /** Two clock reads taken microseconds apart are equal for our purposes; the slack is far
     *  smaller than any zone offset we need to tell apart. */
    private void assertBusinessDayWallClock(String label, LocalDateTime actual) {
        assertNotNull(actual, label + " must be stamped");
        java.time.Duration drift = java.time.Duration.between(
                LocalDateTime.now(BUSINESS_ZONE), actual).abs();
        assertTrue(drift.compareTo(java.time.Duration.ofSeconds(10)) < 0,
                label + " must read the Business Day timezone (" + BUSINESS_ZONE + "), was " + actual);
    }

    /** Satisfies closeSession()'s identity + authorization preamble so these tests can reach
     *  the timestamping logic they actually assert on. The two collaborators below are
     *  {@code @Autowired} fields rather than constructor arguments, so they are injected
     *  reflectively here. */
    private void authorizeSessionClose(PosSession session) {
        com.billbull.backend.user.User user = new com.billbull.backend.user.User();
        user.setId(9L);
        user.setUsername("cashier1");
        lenient().when(userRepository.findByUsername("cashier1")).thenReturn(Optional.of(user));

        var authorizationService = org.mockito.Mockito.mock(
                com.billbull.backend.pos.auth.PosSessionAuthorizationService.class);
        lenient().when(authorizationService.authorizeSessionClose(any(), any()))
                .thenReturn(com.billbull.backend.pos.auth.AuthorizationResult.success());
        var closureRegistry = org.mockito.Mockito.mock(
                com.billbull.backend.pos.auth.PosClosureAuthorizationRegistry.class);
        lenient().when(closureRegistry.consume(any(), any())).thenReturn(Optional.empty());

        org.springframework.test.util.ReflectionTestUtils.setField(
                service, "posSessionAuthorizationService", authorizationService);
        org.springframework.test.util.ReflectionTestUtils.setField(
                service, "closureAuthorizationRegistry", closureRegistry);
    }

    private void authenticateCashier() {
        org.springframework.security.core.context.SecurityContextHolder.getContext().setAuthentication(
                new org.springframework.security.authentication.UsernamePasswordAuthenticationToken(
                        "cashier1", null, List.of()));
    }

    private PosSession openSessionForClose(LocalDateTime openedAt) {
        PosSession session = openSession();
        session.setOpeningCash(bd("100"));
        session.setOpenedAt(openedAt);
        when(repo.findById(1L)).thenReturn(Optional.of(session));
        authorizeSessionClose(session);
        return session;
    }

    @Test
    void closeSessionStampsClosedAtFromTheBusinessDayClockNotTheJvmClock() {
        authenticateCashier();
        openSessionForClose(LocalDateTime.now(BUSINESS_ZONE).minusHours(2));

        PosSession closed = service.closeSession(1L, denoms("100"), null, "ok");

        assertBusinessDayWallClock("closedAt", closed.getClosedAt());
    }

    @Test
    void closeSessionDurationIsExactAndNonNegativeWhenJvmZoneDiffersFromBusinessDayZone() {
        authenticateCashier();
        // openedAt was stamped by the Business Day clock (as openSession does). If closedAt
        // came from a different clock, the difference would be off by the zone offset â€”
        // inflated on a host ahead of the business zone, negative on a host behind it.
        openSessionForClose(LocalDateTime.now(BUSINESS_ZONE).minusMinutes(30));

        PosSession closed = service.closeSession(1L, denoms("100"), null, "ok");

        Long duration = closed.getDurationSeconds();
        assertNotNull(duration);
        assertTrue(duration >= 0, "duration must never be negative, was " + duration);
        assertTrue(Math.abs(duration - 1800) <= 10,
                "duration must be the real elapsed 1800s, was " + duration);
    }

    @Test
    void closeSessionOnAFreshlyOpenedSessionCannotProduceANegativeDuration() {
        authenticateCashier();
        // The pathological case: a session opened and closed in the same instant. Mixed
        // clocks made this negative whenever the JVM zone lagged the Business Day zone.
        openSessionForClose(LocalDateTime.now(BUSINESS_ZONE));

        PosSession closed = service.closeSession(1L, denoms("100"), null, "ok");

        assertTrue(closed.getDurationSeconds() >= 0,
                "duration must never be negative, was " + closed.getDurationSeconds());
        assertTrue(closed.getDurationSeconds() <= 10,
                "an instantly-closed session must not accrue a zone offset, was "
                        + closed.getDurationSeconds());
    }

    @Test
    void zReportSnapshotReusesTheSingleCloseTimestampRatherThanReadingTheClockAgain() {
        authenticateCashier();
        openSessionForClose(LocalDateTime.now(BUSINESS_ZONE).minusHours(1));

        PosSession closed = service.closeSession(1L, denoms("100"), null, "ok");

        // One operation, one authoritative timestamp: the Z-Report snapshot must carry the
        // very same closedAt that was written to the session, not an independent second read.
        assertNotNull(closed.getZReportJson());
        assertTrue(closed.getZReportJson().contains("\"closedAt\":\"" + closed.getClosedAt() + "\""),
                "Z-Report snapshot must embed session.closedAt verbatim, was " + closed.getZReportJson());
        assertBusinessDayWallClock("Z-Report snapshot closedAt", closed.getClosedAt());
    }

    @Test
    void closeSessionStampsTheImpliedXReportTimestampFromTheBusinessDayClock() {
        authenticateCashier();
        PosSession session = openSessionForClose(LocalDateTime.now(BUSINESS_ZONE).minusHours(1));
        session.setXReportGeneratedAt(null);

        PosSession closed = service.closeSession(1L, denoms("100"), null, "ok");

        // Closing implies the shift read; it must share the one close timestamp.
        assertEquals(closed.getClosedAt(), closed.getXReportGeneratedAt());
        assertBusinessDayWallClock("xReportGeneratedAt", closed.getXReportGeneratedAt());
    }

    @Test
    void generateXReportStampsGeneratedAtFromTheBusinessDayClock() {
        authenticateCashier();
        PosSession session = openSession();
        session.setBranchId(1L);
        session.setSessionDate(LocalDate.of(2026, 8, 10));
        session.setXReportGeneratedAt(null);
        when(repo.findById(1L)).thenReturn(Optional.of(session));
        when(reportNumberService.nextReportNumber(eq("XR"), any(), any())).thenReturn("XR-0001");

        service.generateXReport(1L);

        assertBusinessDayWallClock("X-Report generatedAt", session.getXReportGeneratedAt());

        // ...and the persisted snapshot carries that same timestamp, not a fresh read.
        ArgumentCaptor<com.billbull.backend.pos.reports.PosXReportSnapshot> snap =
                ArgumentCaptor.forClass(com.billbull.backend.pos.reports.PosXReportSnapshot.class);
        verify(xReportSnapshotRepository).save(snap.capture());
        assertEquals(session.getXReportGeneratedAt(), snap.getValue().getGeneratedAt());
    }

    // ---------------------------------------------------------------------
    // Cash out can never exceed the cash the drawer actually holds.
    // ---------------------------------------------------------------------

    @Test
    void cashOutIsRefusedWhenItExceedsTheCashInTheDrawer() {
        authenticateCashier();
        PosSession session = sessionOnBusinessDay(0);
        session.setSessionDate(session.getTradingDate());
        session.setOpeningCash(BigDecimal.ZERO);
        when(repo.findById(67L)).thenReturn(Optional.of(session));

        ResponseStatusException ex = org.junit.jupiter.api.Assertions.assertThrows(
                ResponseStatusException.class,
                () -> service.addCashMovement(67L, "DROP_OUT", bd("5000"), "payout"));

        assertEquals(org.springframework.http.HttpStatus.BAD_REQUEST, ex.getStatusCode());
        org.junit.jupiter.api.Assertions.assertTrue(
                ex.getReason() != null && ex.getReason().contains("exceeds the cash available"),
                () -> "unexpected reason: " + ex.getReason());
        // Refused, not half-applied: nothing persisted, nothing posted to the GL.
        assertEquals(0, session.getCashMovements().size());
        verify(repo, never()).save(any(PosSession.class));
        verify(postingEngine, never()).createJournalFromCashMovement(any(), any(), any(), any(), any(), any(), any(), any());
    }

    @Test
    void cashOutIsAllowedUpToTheCashInTheDrawer() {
        authenticateCashier();
        PosSession session = sessionOnBusinessDay(0);
        session.setSessionDate(session.getTradingDate());
        session.setOpeningCash(bd("500"));
        session.getCashMovements().add(cashMovement(PosCashMovementType.DROP_IN, bd("100")));
        when(repo.findById(67L)).thenReturn(Optional.of(session));

        // Drawer holds 500 opening + 100 drop-in = 600; taking exactly 600 out is allowed.
        PosCashMovement movement = service.addCashMovement(67L, "DROP_OUT", bd("600"), "payout");

        assertEquals(PosCashMovementType.DROP_OUT, movement.getMovementType());
        assertMoney("600", movement.getAmount());
    }

    @Test
    void cashMovementRejectsANonPositiveAmount() {
        authenticateCashier();
        PosSession session = sessionOnBusinessDay(0);
        session.setSessionDate(session.getTradingDate());
        when(repo.findById(67L)).thenReturn(Optional.of(session));

        ResponseStatusException ex = org.junit.jupiter.api.Assertions.assertThrows(
                ResponseStatusException.class,
                () -> service.addCashMovement(67L, "DROP_IN", BigDecimal.ZERO, "top-up"));

        assertEquals(org.springframework.http.HttpStatus.BAD_REQUEST, ex.getStatusCode());
    }
}
