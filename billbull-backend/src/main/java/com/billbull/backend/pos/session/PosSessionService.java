package com.billbull.backend.pos.session;

import com.billbull.backend.financials.generalledger.postingengine.PostingEngineService;
import com.billbull.backend.pos.businessdate.PosBusinessDateService;
import com.billbull.backend.pos.businessdate.BusinessDayBlockingReason;
import com.billbull.backend.pos.businessdate.BusinessDayFeatureFlagService;
import com.billbull.backend.pos.businessdate.BusinessDayInfrastructureException;
import com.billbull.backend.pos.businessdate.BusinessDayClosedException;
import com.billbull.backend.pos.businessdate.BusinessDayContinuationGate;
import com.billbull.backend.pos.businessdate.BusinessDayPhase;
import com.billbull.backend.pos.businessdate.BusinessDayResolver;
import com.billbull.backend.pos.businessdate.BusinessDaySettings;
import com.billbull.backend.pos.businessdate.BusinessDayState;
import com.billbull.backend.pos.businessdate.BusinessDayStateService;
import com.billbull.backend.pos.businessdate.BusinessDayWindowService;
import com.billbull.backend.pos.businessdate.BusinessDayValidationResult;
import com.billbull.backend.pos.businessdate.BusinessDayValidationService;
import com.billbull.backend.pos.businessdate.PosOperatingHoursCalculator;
import com.billbull.backend.pos.businessdate.PreviousBusinessDaySessionException;
import com.billbull.backend.financials.receiptvoucher.ReceiptPurpose;
import com.billbull.backend.financials.receiptvoucher.ReceiptVoucher;
import com.billbull.backend.financials.receiptvoucher.ReceiptVoucherRepository;
import com.billbull.backend.pos.audit.PosAuditAction;
import com.billbull.backend.pos.audit.PosAuditLog;
import com.billbull.backend.pos.audit.PosAuditLogRepository;
import com.billbull.backend.pos.admin.PosCashMovementCategory;
import com.billbull.backend.pos.admin.PosCashMovementCategoryService;
import com.billbull.backend.financials.chartofaccounts.Account;
import com.billbull.backend.pos.audit.PosAuditService;
import com.billbull.backend.pos.settings.PosSettings;
import com.billbull.backend.pos.settings.PosSettingsRepository;
import com.billbull.backend.pos.terminal.PosTerminal;
import com.billbull.backend.pos.terminal.PosTerminalActivityService;
import com.billbull.backend.pos.terminal.PosTerminalHostingService;
import com.billbull.backend.pos.terminal.PosTerminalRepository;
import com.billbull.backend.pos.checkout.PosPaymentAllocationType;
import com.billbull.backend.sales.payment.TenderBucket;
import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceItem;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;
import com.billbull.backend.sales.payment.Payment;
import com.billbull.backend.sales.payment.PaymentRepository;
import com.billbull.backend.sales.returns.SalesReturn;
import com.billbull.backend.sales.returns.SalesReturnItem;
import com.billbull.backend.sales.returns.SalesReturnRepository;
import com.billbull.backend.sales.returns.SalesReturnStatus;
import com.billbull.backend.settings.branch.Branch;
import com.billbull.backend.settings.branch.BranchAccessService;
import com.billbull.backend.settings.branch.BranchRepository;
import com.billbull.backend.pos.dayclose.PosDayClose;
import com.billbull.backend.pos.dayclose.PosDayCloseRepository;
import com.billbull.backend.pos.reports.PosReportNumberService;
import com.billbull.backend.pos.reports.PosXReportSnapshot;
import com.billbull.backend.pos.reports.PosXReportSnapshotRepository;
import com.billbull.backend.sales.invoice.SalesInvoiceStatus;
import com.billbull.backend.sales.payment.PaymentStatus;
import com.billbull.backend.user.UserRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

import com.billbull.backend.exception.VarianceApprovalRequiredException;
import com.billbull.backend.pos.session.denomination.PosDenominationCount;

@Service
public class PosSessionService {

    private static final org.slf4j.Logger log =
            org.slf4j.LoggerFactory.getLogger(PosSessionService.class);

    private final PosSessionRepository repo;
    private final SalesInvoiceRepository invoiceRepo;
    private final BranchAccessService branchAccessService;
    private final BranchRepository branchRepository;
    private final PostingEngineService postingEngine;
    private final PosSettingsRepository posSettingsRepository;
    private final PosAuditService auditService;
    private final PaymentRepository paymentRepository;
    private final PosAuditLogRepository auditLogRepository;
    private final PosTerminalRepository terminalRepository;
    private final SalesReturnRepository returnRepository;
    private final PosDayCloseRepository dayCloseRepository;
    private final ObjectMapper objectMapper;
    private final PosTerminalActivityService terminalActivityService;
    private final PosBusinessDateService businessDateService;
    private final BusinessDayStateService businessDayStateService;
    private final BusinessDayValidationService businessDayValidationService;
    private final BusinessDayFeatureFlagService businessDayFeatureFlagService;
    private final BusinessDayWindowService businessDayWindowService;
    private final BusinessDayContinuationGate businessDayContinuationGate;
    private final PosSessionClosureWorkflowGate closureWorkflowGate;
    private final PosCashMovementRepository cashMovementRepository;
    private final ReceiptVoucherRepository receiptVoucherRepository;
    private final PosXReportSnapshotRepository xReportSnapshotRepository;
    private final PosReportNumberService reportNumberService;
    private final UserRepository userRepository;
    private final PosCashMovementCategoryService cashMovementCategoryService;
    private final PosSessionResolutionStrategy sessionResolutionStrategy;
    private final PosSessionOwnershipService sessionOwnershipService;
    private final PosTerminalHostingService terminalHostingService;
    private final PosSessionDiscoveryService sessionDiscoveryService;
    private final PosSessionTransferService sessionTransferService;
    private final PosSessionTransferLogRepository transferLogRepository;
    private final PosSessionTransferPolicy sessionTransferPolicy;
    private final jakarta.persistence.EntityManager entityManager;
    private final com.billbull.backend.pos.admin.EffectiveCorrectionViewService effectiveCorrectionViewService;

    /** The single authority for Expected Cash. This class no longer computes it. */
    @org.springframework.beans.factory.annotation.Autowired
    private PosCashReconciliationService cashReconciliationService;

    /** The single authority for Counted Cash. This class no longer accepts one from a client. */
    @org.springframework.beans.factory.annotation.Autowired
    private com.billbull.backend.pos.session.denomination.PosDenominationCountService denominationCountService;

    /** Decides whether a discrepancy needs authorization; owns the threshold semantics. */
    @org.springframework.beans.factory.annotation.Autowired
    private PosVariancePolicy variancePolicy;

    /** Single-use variance grants, bound to the exact reconciliation they authorize. */
    @org.springframework.beans.factory.annotation.Autowired
    private PosVarianceApprovalRegistry varianceApprovalRegistry;

    @org.springframework.beans.factory.annotation.Autowired
    private com.billbull.backend.pos.auth.PosSessionAuthorizationService posSessionAuthorizationService;

    @org.springframework.beans.factory.annotation.Autowired
    private com.billbull.backend.pos.auth.PosClosureAuthorizationRegistry closureAuthorizationRegistry;

    /** Verifies a second user's credentials at the till — the same service the Session Owner
     *  Verification modal uses. Only consulted by {@code cancelClosure}. */
    @org.springframework.beans.factory.annotation.Autowired
    private com.billbull.backend.pos.auth.PosCredentialVerificationService credentialVerificationService;

    /** Null-safe view of a monetary field: treats {@code null} as zero (preserves the
     *  legacy {@code x != null ? x : 0} coalescing the {@code double} code relied on). */
    private static BigDecimal nz(BigDecimal v) { return v != null ? v : BigDecimal.ZERO; }

    /** Bridges a still-{@code Double} amount from {@link SalesInvoice} (converted in a
     *  later slice) into {@code BigDecimal}, null-safe. */
    private static BigDecimal nz(Double v) { return v != null ? BigDecimal.valueOf(v) : BigDecimal.ZERO; }

    public PosSessionService(PosSessionRepository repo,
                             SalesInvoiceRepository invoiceRepo,
                             BranchAccessService branchAccessService,
                             BranchRepository branchRepository,
                             PostingEngineService postingEngine,
                             PosSettingsRepository posSettingsRepository,
                             PosAuditService auditService,
                             PaymentRepository paymentRepository,
                             PosAuditLogRepository auditLogRepository,
                             PosTerminalRepository terminalRepository,
                             SalesReturnRepository returnRepository,
                             PosDayCloseRepository dayCloseRepository,
                             ObjectMapper objectMapper,
                             PosTerminalActivityService terminalActivityService,
                             PosBusinessDateService businessDateService,
                             BusinessDayStateService businessDayStateService,
                             BusinessDayValidationService businessDayValidationService,
                             BusinessDayFeatureFlagService businessDayFeatureFlagService,
                             BusinessDayWindowService businessDayWindowService,
                             PosCashMovementRepository cashMovementRepository,
                             ReceiptVoucherRepository receiptVoucherRepository,
                             PosXReportSnapshotRepository xReportSnapshotRepository,
                             PosReportNumberService reportNumberService,
                             UserRepository userRepository,
                             PosCashMovementCategoryService cashMovementCategoryService,
                             PosSessionResolutionStrategy sessionResolutionStrategy,
                             PosSessionOwnershipService sessionOwnershipService,
                             PosTerminalHostingService terminalHostingService,
                             PosSessionDiscoveryService sessionDiscoveryService,
                             PosSessionTransferService sessionTransferService,
                             PosSessionTransferLogRepository transferLogRepository,
                             PosSessionTransferPolicy sessionTransferPolicy,
                             jakarta.persistence.EntityManager entityManager,
                             com.billbull.backend.pos.admin.EffectiveCorrectionViewService effectiveCorrectionViewService,
                             BusinessDayContinuationGate businessDayContinuationGate,
                             PosSessionClosureWorkflowGate closureWorkflowGate) {
        this.repo = repo;
        this.invoiceRepo = invoiceRepo;
        this.branchAccessService = branchAccessService;
        this.branchRepository = branchRepository;
        this.postingEngine = postingEngine;
        this.posSettingsRepository = posSettingsRepository;
        this.auditService = auditService;
        this.paymentRepository = paymentRepository;
        this.auditLogRepository = auditLogRepository;
        this.terminalRepository = terminalRepository;
        this.returnRepository = returnRepository;
        this.dayCloseRepository = dayCloseRepository;
        this.objectMapper = objectMapper;
        this.terminalActivityService = terminalActivityService;
        this.businessDateService = businessDateService;
        this.businessDayStateService = businessDayStateService;
        this.businessDayValidationService = businessDayValidationService;
        this.businessDayFeatureFlagService = businessDayFeatureFlagService;
        this.businessDayWindowService = businessDayWindowService;
        this.cashMovementRepository = cashMovementRepository;
        this.receiptVoucherRepository = receiptVoucherRepository;
        this.xReportSnapshotRepository = xReportSnapshotRepository;
        this.reportNumberService = reportNumberService;
        this.userRepository = userRepository;
        this.cashMovementCategoryService = cashMovementCategoryService;
        this.sessionResolutionStrategy = sessionResolutionStrategy;
        this.sessionOwnershipService = sessionOwnershipService;
        this.terminalHostingService = terminalHostingService;
        this.sessionDiscoveryService = sessionDiscoveryService;
        this.sessionTransferService = sessionTransferService;
        this.transferLogRepository = transferLogRepository;
        this.sessionTransferPolicy = sessionTransferPolicy;
        this.entityManager = entityManager;
        this.effectiveCorrectionViewService = effectiveCorrectionViewService;
        this.businessDayContinuationGate = businessDayContinuationGate;
        this.closureWorkflowGate = closureWorkflowGate;
    }

    /** Keeps a failure message inside its column without losing the useful head of it. */
    private static String truncate(String value, int max) {
        if (value == null) return null;
        return value.length() <= max ? value : value.substring(0, max);
    }

    private String currentUser() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return auth != null ? auth.getName() : "system";
    }

    /** Display-only resolution of a username to the employee's full name, via
     *  User.getResolvedDisplayName() (Employee first+last name -> User.fullName -> username).
     *  Never used for identity/ownership/locking/audit — those keep using the raw username.
     *  Called only at write-time (session open/close, X-Report generation, Day Close) so
     *  reports never re-resolve names on later reads. */
    private String resolveDisplayName(String username) {
        if (username == null || username.isBlank()) return username;
        return userRepository.findByUsername(username)
                .map(com.billbull.backend.user.User::getResolvedDisplayName)
                .orElse(username);
    }

    /** ACTIVE-only sum — voided movements never contribute to Expected Cash or any other
     *  reconciliation/report total (see Cash Drop / Outs Management §8). */
    private static BigDecimal sumCashMovements(PosSession session, PosCashMovementType movementType) {
        return session.getCashMovements().stream()
                .filter(m -> movementType.equals(m.getMovementType()))
                .filter(m -> m.getStatus() == null || m.getStatus() == PosCashMovementStatus.ACTIVE)
                .map(m -> nz(m.getAmount()))
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }
    
    private BigDecimal sumCashMovements(List<PosCashMovement> movements, PosCashMovementType movementType) {
        return movements.stream()
                .filter(m -> movementType.equals(m.getMovementType()))
                .filter(m -> m.getStatus() == null || m.getStatus() == PosCashMovementStatus.ACTIVE)
                .map(m -> nz(m.getAmount()))
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    /** Cash physically in the drawer right now for an open session — the same authoritative
     *  Expected Cash the X-Report and Close Session read, evaluated mid-shift. Used to refuse a
     *  cash out larger than the drawer holds. */
    private BigDecimal availableCashInDrawer(PosSession session) {
        return cashReconciliationService.reconcile(session).expectedCash();
    }

    /** SUM(amount) grouped by movementType (DROP_IN / DROP_OUT) across a set of sessions.
     *  Now fetches entities, detaches them, resolves overlays, and sums in-memory to ensure
     *  corrections are accurately reflected. */
    private Map<String, BigDecimal> sumCashMovementsByType(List<Long> sessionIds) {
        Map<String, BigDecimal> totals = new java.util.HashMap<>();
        if (sessionIds == null || sessionIds.isEmpty()) return totals;
        
        List<PosCashMovement> movements = cashMovementRepository.findByPosSession_IdInOrderByPerformedAtAsc(sessionIds)
                .stream().map(PosCashMovement::detachedCopy).toList();
        if (!movements.isEmpty()) {
            movements = effectiveCorrectionViewService.resolveOverlays(
                    com.billbull.backend.pos.admin.CorrectionTargetType.CASH_MOVEMENT, movements, PosCashMovement::getId);
        }
        
        // ACTIVE only — voided drops/outs are excluded from every reconciliation/report total.
        for (PosCashMovement m : movements) {
            if (m.getStatus() != null && m.getStatus() != PosCashMovementStatus.ACTIVE) continue;
            String type = m.getMovementType().name();
            BigDecimal amount = nz(m.getAmount());
            totals.merge(type, amount, BigDecimal::add);
        }
        return totals;
    }

    /** Free-text payment-mode check for "cash only" filtering on back-office vouchers
     *  (ReceiptVoucher.paymentMode has no enum) — same "contains cash" convention as
     *  {@link #tenderBucket} / {@code recordInvoiceOnSession}. */
    private static boolean isCashMode(String paymentMode) {
        return paymentMode != null && paymentMode.toLowerCase(java.util.Locale.ROOT).contains("cash");
    }

    @Transactional
    public PosSession openSession(String terminalId, String counterName, BigDecimal openingCash) {
        Branch branch = branchAccessService.getRequiredCurrentUserBranch();
        Long branchId = branch.getId();
        LocalDate businessDate = businessDateService.getCurrentBusinessDate(branchId);

        // Settings are loaded ONCE here — the Business Day gate itself now needs the
        // configured window (see gateBusinessDate below), and every later consumer
        // (shadow validation, enforcement, idle/hard-limit timeouts, tradingDate)
        // reuses this same snapshot instead of re-reading. A settings-datasource
        // failure must never blow up session opening: it is recorded as a SETTINGS
        // Infrastructure Failure and degrades to an unconfigured window, which
        // leaves the gate on the legacy pointer — i.e. exactly the pre-existing
        // behavior. `settingsAvailable` is false in that case, so the Business Day
        // engine is skipped rather than run against fabricated settings.
        // The failure is NOT recorded here — it is handed to whichever path runs
        // below (shadow validation or enforcement) so each still records it under
        // exactly the same metric it always did.
        PosSettings settings;
        BusinessDayInfrastructureException settingsFailure = null;
        try {
            settings = loadSettingsOrFail(branchId);
        } catch (BusinessDayInfrastructureException failure) {
            settings = new PosSettings();
            settingsFailure = failure;
        }
        BusinessDaySettings businessDaySettings = BusinessDaySettings.from(settings);
        // The Business Day clock, never LocalDateTime.now(): every phase, Trading
        // Date and closure comparison in this method must be made against the
        // configured Business Day timezone, and against ONE reading of it, so two
        // decisions in the same request can never land either side of a boundary.
        LocalDateTime now = businessDayWindowService.clock().now();

        // The authoritative Business Day state — window phase and closure time —
        // resolved once, from the settings snapshot already loaded above (no extra
        // settings query).
        BusinessDayState businessDayState = businessDayWindowService.resolveAt(branchId, now, settings);

        // ── Candidate Business Day, resolved ONCE for the whole open flow ────────
        // Every Business-Day comparison below (the legacy gate's "is there a PRIOR
        // unclosed day", the already-closed check, and the persisted tradingDate)
        // must be made against the same value. Mixing the legacy Business Date
        // pointer with Business-Day-domain data is what produced the reported bug:
        // findUnclosedBusinessDay() answers from tradingDate (Business Day domain)
        // and returns the CURRENT, still-in-progress day when Day Close has not run
        // yet, while `businessDate` is the persisted legacy pointer, which
        // advanceBusinessDate() had already moved to the next calendar day. With a
        // 09:00–21:00 window on 2026-08-04 16:42 that made the comparison
        // 2026-08-04.isBefore(2026-08-05) → true, so the current Business Day was
        // misreported as an unclosed PREVIOUS one and every further session on the
        // same Business Day was blocked.
        LocalDate candidateBusinessDay = businessDayState.window().tradingDate();
        // The gate ALWAYS compares against the Candidate Business Day — including
        // for branches with no configured window, where BusinessDayResolver already
        // returns now.toLocalDate() and the pointer was the only remaining way for
        // the two domains to diverge. Keeping the legacy pointer here (as an earlier
        // pass did) left the same bug alive for exactly those branches: resolving a
        // backlog of pending Day Closes advances the pointer once per close
        // (advanceBusinessDate is unconditionally +1), so it can end up AHEAD of the
        // calendar — pointer 2026-08-05 while the unclosed tradingDate is today,
        // 2026-08-04 — and today's own Business Day is again read as an unclosed
        // PRIOR one. A genuinely stale prior day still blocks: it is strictly before
        // the Candidate too (BBQA-5.3-013 unaffected).
        LocalDate gateBusinessDate = candidateBusinessDay;

        // ── Business Day window closure gate ─────────────────────────────────────
        // Deliberately its OWN guard, evaluated before and independently of the
        // login-gate-v2 flag below. The two answer unrelated questions — "has this
        // branch's Business Day closed for the night" versus "is a previous Business
        // Day still unclosed" — and are governed by separate per-branch switches so
        // they can be rolled out and rolled back independently.
        //
        // A branch with no configured window resolves to UNRESTRICTED and is never
        // blocked here, which is every branch that has not opted in.
        if (businessDayState.blocksNormalOperation()) {
            throw BusinessDayClosedException.of(businessDayState);
        }

        // Stage 3B.2B — per-branch enforcement switch. A failure to even read the
        // flag is itself an infrastructure concern and must fail open to the
        // already-proven legacy gate, same philosophy as everything below.
        boolean enforcementEnabled;
        try {
            enforcementEnabled = businessDayFeatureFlagService.isLoginGateV2Enabled(branchId);
        } catch (Exception flagLookupFailure) {
            enforcementEnabled = false;
            businessDayStateService.recordInfrastructureFailure(branchId,
                    BusinessDayInfrastructureException.FailureCategory.UNEXPECTED, flagLookupFailure);
        }
        businessDayStateService.recordFeatureFlagRequest(branchId, enforcementEnabled);

        ResponseStatusException blockingException;
        if (!enforcementEnabled) {
            // Flag OFF (the default for every branch): behavior is byte-identical to
            // Stage 3B.2A.6 — legacy gate is authoritative, Shadow Validation runs
            // purely for observation afterward, its result never consulted here.
            blockingException = runLegacyGate(branchId, gateBusinessDate);
            boolean legacyAllowed = blockingException == null;
            runShadowValidation(branchId, businessDayState, settingsFailure, legacyAllowed);
        } else {
            // Flag ON: BusinessDayValidationService becomes authoritative. An
            // Infrastructure Failure (categorized or not) falls back to the exact
            // same legacy gate, for this request only — never blocks a cashier
            // because the new engine itself couldn't run.
            try {
                if (settingsFailure != null) throw settingsFailure;
                BusinessDayValidationResult result = businessDayValidationService.validate(
                        branchId, businessDayState);
                businessDayStateService.recordEnforcementDecision(branchId, result);
                blockingException = toEnforcementException(branchId, result);
            } catch (BusinessDayInfrastructureException infra) {
                businessDayStateService.recordEnforcementFallback(branchId, infra.getCategory(), infra);
                blockingException = runLegacyGate(branchId, gateBusinessDate);
            } catch (Exception unclassified) {
                // A bug in the new engine must never block a real cashier — same
                // fail-open guarantee, for a failure mode too unexpected to have
                // already been wrapped as a BusinessDayInfrastructureException.
                businessDayStateService.recordEnforcementFallback(branchId,
                        BusinessDayInfrastructureException.FailureCategory.UNEXPECTED, unclassified);
                blockingException = runLegacyGate(branchId, gateBusinessDate);
            }
        }

        if (blockingException != null) {
            throw blockingException;
        }

        // Session Roaming Phase 7 — controlled discovery. NO_SESSION/TERMINAL_SESSION/SAME_SESSION
        // fall through to the pre-existing terminal-first duplicate check below, unchanged;
        // OWNER_SESSION/CONFLICT/MULTIPLE_OWNER_SESSIONS are surfaced as a structured response
        // instead of silently opening a second concurrent session for the same owner. Nothing is
        // moved, hosted, or transferred here — this only reports what discovery found.
        Long ownerUserId = sessionOwnershipService.currentPrincipalUserId();
        PosSessionDiscoveryResult discovery = sessionDiscoveryService.discover(branchId, terminalId, ownerUserId);
        switch (discovery.status()) {
            case OWNER_SESSION -> throw new PosSessionDiscoveryBlockedException(
                    PosSessionDiscoveryResponse.ownerSessionElsewhere(discovery.ownerSession().orElseThrow(),
                            evaluateTransferToTerminal(discovery.ownerSession().orElseThrow(), terminalId)));
            case CONFLICT -> throw new PosSessionDiscoveryBlockedException(
                    PosSessionDiscoveryResponse.conflict(
                            discovery.terminalSession().orElseThrow(), discovery.ownerSession().orElseThrow(),
                            evaluateTransferToTerminal(discovery.ownerSession().orElseThrow(), terminalId)));
            case MULTIPLE_OWNER_SESSIONS -> throw new PosSessionDiscoveryBlockedException(
                    PosSessionDiscoveryResponse.multipleOwnerSessions(discovery.ownerSessionCount()));
            default -> { /* NO_SESSION, TERMINAL_SESSION, SAME_SESSION: continue existing flow below */ }
        }

        // App-level duplicate check: if same user returns to their own session, hand it back
        // (terminal-first resolution — same terminalSession discovery already looked up above).
        Optional<PosSession> existing = discovery.terminalSession();
        if (existing.isPresent()) {
            if (!currentUser().equals(existing.get().getOpenedBy())) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Terminal is already in use by active cashier: " + existing.get().getOpenedBy());
            }
            return existing.get();
        }

        // `settings` / `now` / `candidateBusinessDay` were resolved once at the top
        // of this method (the gate needs them too) — deliberately NOT re-derived
        // here, so the value that was validated is the value that gets persisted.
        PosSession session = new PosSession();
        session.setBranchId(branchId);
        session.setBranchName(branch.getName());
        session.setTerminalId(terminalId);
        session.setCounterName(counterName);
        session.setOpenedBy(currentUser());
        session.setOpenedByDisplayName(resolveDisplayName(session.getOpenedBy()));
        session.setOwnerUserId(ownerUserId);
        session.setSessionDate(businessDate);
        session.setOpenedAt(now);
        // Business Day persistence (Phase 3A) — Day Close domain only; immutable,
        // set once here, never re-derived or updated afterward. Resolved via the
        // Business Day Engine (BusinessDayResolver + this branch's configured
        // operating hours) rather than a raw calendar-date stamp, so an overnight
        // window is correctly honored. For any branch without operating hours
        // configured (the default), this is byte-identical to now.toLocalDate().
        // See PosSession#getTradingDate() / PosPendingDayCloseResolver /
        // docs/business-day-architecture.md.
        session.setTradingDate(candidateBusinessDay);
        session.setLastActivityAt(now);
        session.setDurationSeconds(null);
        session.setStatus(PosSessionStatus.OPEN);
        session.setOpeningCash(openingCash != null ? openingCash : BigDecimal.ZERO);
        session.setTotalSales(BigDecimal.ZERO);
        session.setTotalCashSales(BigDecimal.ZERO);
        session.setTotalCardSales(BigDecimal.ZERO);
        session.setTotalCreditSales(BigDecimal.ZERO);
        session.setTotalMixedSales(BigDecimal.ZERO);
        session.setInvoiceCount(0);

        // Resolve terminal entity for the DB-level lock (terminal-first hosting lookup —
        // same terminalRepository.findByTerminalId call PosTerminalHostingService wraps).
        PosTerminal terminal = terminalHostingService.resolveHostingTerminal(session).orElse(null);
        if (terminal != null) {
            session.setTerminalPk(terminal.getId());
            if (terminal.getCounterId() != null) session.setCounterId(terminal.getCounterId());
        }
        Integer idleTimeout = settings.getSessionIdleTimeoutMinutes();
        if (idleTimeout != null && idleTimeout > 0) session.setIdleTimeoutMinutes(idleTimeout);
        Integer maxHours = settings.getSessionMaxDurationHours();
        if (maxHours != null && maxHours > 0) session.setSessionTimeoutAt(now.plusHours(maxHours));

        PosSession saved = repo.save(session);

        // Phase 3A shadow validation — diagnostics only, recorded after persistence,
        // never influences anything above or below. Compares the legacy Business
        // Date pointer against the now-persisted Business Day (tradingDate).
        boolean overnightWindowConfigured = businessDaySettings.isConfigured()
                && PosOperatingHoursCalculator.isOvernightWindow(settings.getOperatingStartTime(), settings.getOperatingEndTime());
        businessDayStateService.recordShadowValidation(branchId, businessDate, candidateBusinessDay, overnightWindowConfigured);

        // Atomically acquire terminal lock (DB partial unique index is the concurrency safety net)
        if (terminal != null) {
            int acquired = terminalRepository.setOpenSession(terminal.getId(), saved.getId());
            if (acquired == 0) {
                repo.delete(saved);
                throw new ResponseStatusException(HttpStatus.CONFLICT,
                        "Terminal is already occupied by another session.");
            }
        }

        // Hosting history: this terminal becomes the session's host from open onward.
        terminalHostingService.ensureHostingSegment(saved, terminal);

        // The opening float entering the drawer: Dr Cash in Hand / Cr Petty Cash. Without this
        // the float was physically in the till but never in the ledger, so every session left a
        // negative Cash-in-Hand residual exactly equal to its float and the close swept out
        // money the books said had never arrived.
        if (nz(saved.getOpeningCash()).signum() > 0) {
            try {
                Branch openBranch = saved.getBranchId() != null
                        ? branchRepository.findById(saved.getBranchId()).orElse(null) : null;
                postingEngine.createJournalFromSessionOpen(
                        saved.getId(), nz(saved.getOpeningCash()),
                        saved.getTradingDate() != null ? saved.getTradingDate() : saved.getSessionDate(),
                        openBranch);
            } catch (Exception e) {
                // Recorded, never swallowed. The session opens either way -- refusing to open a
                // till because the ledger is unavailable would stop the shop -- but the failure
                // is visible rather than silently leaving the float unbooked.
                log.error("[PosSession] Session {} opened but its opening-float journal FAILED to "
                                + "post (float={}). Cash in Hand will under-report until this is "
                                + "reposted.", saved.getId(), saved.getOpeningCash(), e);
                auditService.logSessionEvent(saved.getId(), saved.getTerminalId(), saved.getBranchId(),
                        "GL_POSTING_FAILED",
                        "operation=SESSION_OPEN float=" + saved.getOpeningCash()
                                + " error=" + truncate(e.getMessage(), 300));
            }
        }

        auditService.logSessionOpened(saved.getId(), saved.getTerminalId(), saved.getBranchId());
        terminalActivityService.recordActivity(saved.getTerminalId(), "SESSION_OPEN");
        return saved;
    }

    /**
     * The complete legacy Business Date pointer gate — byte-identical logic to
     * every phase through Stage 3B.2A.6, extracted into its own method so it can
     * be reused both as the primary path (flag OFF) and as the Stage 3B.2B
     * fail-open fallback (flag ON, but the new engine hit an Infrastructure
     * Failure for this request). Returns the {@link ResponseStatusException} to
     * throw, or {@code null} if the legacy gate allows the session to proceed.
     */
    /*
     * NOTE on the {@code businessDate} parameter: callers pass the RESOLVED
     * Candidate Business Day when the branch has a Business Day window
     * configured, and the legacy Business Date pointer only when it does not.
     * The comparisons below are unchanged; what changed is that both sides of
     * {@code isBefore} now come from the same Business Day domain.
     */
    private ResponseStatusException runLegacyGate(Long branchId, LocalDate businessDate) {
        try {
            // 0. Verify day is not already closed
            if (businessDateService.isDateClosed(branchId, businessDate)) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Cannot open session: The business day has already been closed.");
            }

            // 0b. Guard against silently rolling into a new day while a prior Business
            // Day remains unclosed (BBQA-5.3-013). Phase 3B.1: detection source is
            // BusinessDayStateService (session-driven Business Day data) instead of the
            // legacy sessionDate<pointer scan — the decision path, exception type, HTTP
            // status, and message format are unchanged; only where "does an unclosed
            // prior day exist" is answered from. Mirrors the legacy query's strict
            // "< businessDate" condition: an unclosed day equal to (or after) today's
            // pointer is today's own still-in-progress day, not a prior one — it must
            // never block additional sessions opening on the same Business Day.
            Optional<LocalDate> unclosedBusinessDay = businessDayStateService.findUnclosedBusinessDay(branchId);
            boolean isPriorUnclosedDay = unclosedBusinessDay.isPresent() && unclosedBusinessDay.get().isBefore(businessDate);
            List<PosSession> legacyStaleCheck = repo.findUnclosedSessionsBeforeDate(branchId, businessDate);
            businessDayStateService.logPreviousUnclosedDayDisagreement(branchId, !legacyStaleCheck.isEmpty(),
                    isPriorUnclosedDay ? unclosedBusinessDay : Optional.empty());
            if (isPriorUnclosedDay) {
                PosSession oldest = oldestSessionOnUnclosedDay(branchId, unclosedBusinessDay.get());
                if (oldest != null) {
                    throw new ResponseStatusException(HttpStatus.CONFLICT,
                            PreviousBusinessDaySessionException.buildMessage(oldest.getId(), oldest.getTerminalId(),
                                    String.valueOf(oldest.getStatus()), oldest.getTradingDate()));
                } else {
                    throw new ResponseStatusException(HttpStatus.CONFLICT,
                            PreviousBusinessDaySessionException.buildDayNotClosedMessage(unclosedBusinessDay.get()));
                }
            }
        } catch (ResponseStatusException legacyException) {
            return legacyException;
        }
        return null;
    }

    /** Stage 3B.2A Shadow Validation — unchanged since Stage 3B.2A.6. Runs only on
     *  the flag-OFF path now (Stage 3B.2B): its result never participates in any
     *  if/throw/return; wrapped so a bug in the new engine can never prevent a
     *  real cashier from opening a session. */
    private void runShadowValidation(Long branchId, BusinessDayState shadowState,
                                     BusinessDayInfrastructureException settingsFailure, boolean legacyAllowed) {
        try {
            // Settings are now loaded once by openSession(); a failure there is
            // rethrown here so it is recorded under the same metric as before.
            if (settingsFailure != null) throw settingsFailure;
            BusinessDayValidationResult shadowResult = businessDayValidationService.validate(
                    branchId, shadowState);
            businessDayStateService.recordValidationOutcome(branchId, legacyAllowed, shadowResult);
        } catch (BusinessDayInfrastructureException infrastructureFailure) {
            businessDayStateService.recordInfrastructureFailure(branchId, infrastructureFailure.getCategory(), infrastructureFailure);
        } catch (Exception unexpectedShadowError) {
            businessDayStateService.recordInfrastructureFailure(branchId,
                    BusinessDayInfrastructureException.FailureCategory.UNEXPECTED, unexpectedShadowError);
        }
    }

    /** Shared by shadow validation and enforcement — loads the branch's
     *  {@code PosSettings}, classifying a repository failure as a
     *  {@link BusinessDayInfrastructureException} (category {@code SETTINGS}) so
     *  both callers' fail-open handling can react uniformly. */
    private PosSettings loadSettingsOrFail(Long branchId) {
        try {
            // Shared row lock, not a plain read: for the duration of the opening
            // transaction this pins the Business Day schedule the Trading Date is about
            // to be resolved from. PosSettingsService.save() takes the conflicting
            // exclusive lock on the same row, so a Start/End change can never interleave
            // between this read and the session being persisted with its tradingDate.
            // Concurrent session opens are unaffected — shared locks do not conflict.
            return posSettingsRepository.findByBranchIdForShare(branchId).orElse(new PosSettings());
        } catch (RuntimeException settingsFailure) {
            throw new BusinessDayInfrastructureException(BusinessDayInfrastructureException.FailureCategory.SETTINGS,
                    "Failed to load PosSettings for Business Day validation", settingsFailure);
        }
    }

    /** The earliest-opened session on the branch's oldest unclosed Business Day —
     *  shared by the legacy gate and Stage 3B.2B enforcement's {@code BLOCK}/
     *  {@code PREVIOUS_BUSINESS_DAY_OPEN} message, so both produce an identical
     *  "Session #X on Y (terminal Z) is still STATUS" message. */
    private PosSession oldestSessionOnUnclosedDay(Long branchId, LocalDate unclosedBusinessDay) {
        List<PosSession> sessionsOnUnclosedDay =
                repo.findByBranchIdAndTradingDateOrderByOpenedAtDesc(branchId, unclosedBusinessDay);
        return sessionsOnUnclosedDay.stream()
                .filter(s -> s.getStatus() == PosSessionStatus.OPEN || s.getStatus() == PosSessionStatus.SUSPENDED)
                .min(Comparator.comparing(PosSession::getOpenedAt, Comparator.nullsLast(Comparator.naturalOrder())))
                .orElse(null);
    }

    /**
     * Stage 3B.2B — translates an authoritative {@link BusinessDayValidationResult}
     * into the exact exception shape the legacy gate would have thrown for the
     * equivalent situation, per the approved enforcement policy:
     * <ul>
     *   <li>{@code ALLOW} → {@code null} (proceed)
     *   <li>{@code BLOCK}/{@code BUSINESS_DAY_ALREADY_CLOSED} → same 403 message as the legacy "already closed" check
     *   <li>{@code BLOCK}/{@code PREVIOUS_BUSINESS_DAY_OPEN} → same 409 "PREVIOUS_DAY_SESSION_OPEN" message as the legacy gate
     *   <li>{@code UNEXPECTED_STATE} → fails closed, 409, a new message (no legacy equivalent existed for this case)
     * </ul>
     */
    private ResponseStatusException toEnforcementException(Long branchId, BusinessDayValidationResult result) {
        return switch (result.verdict()) {
            case ALLOW -> null;
            case BLOCK -> {
                if (result.blockingReason() == BusinessDayBlockingReason.BUSINESS_DAY_ALREADY_CLOSED) {
                    yield new ResponseStatusException(HttpStatus.FORBIDDEN, "Cannot open session: The business day has already been closed.");
                }
                LocalDate unclosedDay = result.previousUnclosedBusinessDay().orElse(result.candidateBusinessDay());
                PosSession oldest = oldestSessionOnUnclosedDay(branchId, unclosedDay);
                if (oldest == null) {
                    // Data changed between validate() and here (e.g. the blocking
                    // session closed in the interim) — fail closed generically
                    // rather than silently allow.
                    yield new ResponseStatusException(HttpStatus.CONFLICT,
                            PreviousBusinessDaySessionException.buildDayNotClosedMessage(unclosedDay));
                }
                yield new ResponseStatusException(HttpStatus.CONFLICT,
                        PreviousBusinessDaySessionException.buildMessage(oldest.getId(), oldest.getTerminalId(),
                                String.valueOf(oldest.getStatus()), oldest.getTradingDate()));
            }
            case UNEXPECTED_STATE -> new ResponseStatusException(HttpStatus.CONFLICT,
                    "BUSINESS_DAY_UNEXPECTED_STATE: Candidate Business Day " + result.candidateBusinessDay()
                            + " precedes an unclosed Business Day (" + result.previousUnclosedBusinessDay().orElse(null)
                            + "). Contact support before opening a new session.");
        };
    }

    /**
     * Reassigns the open session on a terminal to a new cashier after a supervisor-authorized
     * shift handover, so the incoming cashier can resume the existing session (its cash drawer,
     * invoices, etc.) instead of being forced into "Start Session".
     */
    @Transactional
    public void reassignSessionOwner(String terminalId, String newOwnerUsername) {
        if (terminalId == null || terminalId.isBlank() || newOwnerUsername == null || newOwnerUsername.isBlank()) {
            return;
        }
        Branch branch = branchAccessService.getRequiredCurrentUserBranch();
        sessionResolutionStrategy.resolveByTerminal(branch.getId(), terminalId)
                .ifPresent(session -> {
                    session.setOpenedBy(newOwnerUsername);
                    session.setOpenedByDisplayName(resolveDisplayName(newOwnerUsername));
                    repo.save(session);
                });
    }

    /**
     * The branch's sessions that lock the Business Day schedule: still OPEN, or with a started
     * closure workflow that has not finished. All terminals, all Trading Dates.
     *
     * <p>The single definition consumed by {@code PosSettingsService}'s Business Day schedule
     * guard — declared here, next to every other session-state authority, rather than being
     * re-derived there. See
     * {@link PosSessionRepository#findBusinessDayScheduleLockingSessions(Long)}.
     *
     * <p>Note for callers inside a settings-save transaction: this reads sessions only. The
     * exclusion of a concurrently opening session comes from the {@code PosSettings} row lock
     * that {@code openSession()} and the settings save contend on, not from this query.
     */
    @Transactional(readOnly = true)
    public List<PosSession> findBusinessDayScheduleLockingSessions(Long branchId) {
        if (branchId == null) return List.of();
        return repo.findBusinessDayScheduleLockingSessions(branchId);
    }

    @Transactional(readOnly = true)
    public Optional<PosSession> getActiveSession(String terminalId) {
        if (terminalId != null && !terminalId.isBlank()) {
            Branch branch = branchAccessService.getRequiredCurrentUserBranch();
            Long branchId = branch.getId();
            Optional<PosSession> sessionOpt = sessionResolutionStrategy.resolveByTerminal(branchId, terminalId);
            if (sessionOpt.isPresent()) {
                PosSession session = sessionOpt.get();
                if (!currentUser().equals(session.getOpenedBy())) {
                    throw new ResponseStatusException(HttpStatus.CONFLICT, "Terminal is locked by active cashier: " + session.getOpenedBy());
                }
                // Business Day continuation gate — the "Continue Session" counterpart to
                // the Start Session gate in openSession(). A session left OPEN on a
                // Business Day that has since rolled over must not be handed back for
                // normal trading just because it exists; the previous Business Day has
                // to be closed first, exactly as a terminal with no session is told.
                // The session itself stays reachable through getById()/close so the
                // operator can still close it and run Day Close.
                businessDayContinuationGate.assertMayContinue(session);
                // Close-workflow gate — composed after the Business Day gate, never merged
                // with it. A session whose closure workflow an operator has started must not
                // be handed back for "Continue Session". The session stays reachable through
                // getById()/x-report/close, which is exactly where the POS is pushed next.
                closureWorkflowGate.assertMayOperate(session);
                return Optional.of(session);
            }
            // No open session under this branch+terminalId — if the terminalId exists but belongs
            // to a different branch (e.g. a stale cached ID from before per-branch terminal
            // identity, or a genuine cross-branch mismatch), say so explicitly instead of a bare
            // "no session", so the caller can re-register for the current branch rather than
            // silently treating a mismatch as "never had a session".
            terminalRepository.findByTerminalId(terminalId).ifPresent(t -> {
                if (!branchId.equals(t.getBranchId())) {
                    throw new ResponseStatusException(HttpStatus.CONFLICT,
                            "Terminal " + terminalId + " is registered to a different branch");
                }
            });
            return Optional.empty();
        }
        return Optional.empty();
    }

    @Transactional(readOnly = true)
    public PosSession getById(Long id) {
        return repo.findById(id).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "POS session not found: " + id));
    }

    @Transactional
    public PosSession closeSession(Long sessionId, Map<String, Object> closingDenominations,
                                   String currencyCode, String notes) {
        return closeSession(sessionId, closingDenominations, currencyCode, notes,
                null, null, null, null, null, null, null);
    }

    /**
     * Closes a session against a physically counted drawer.
     *
     * @param closingDenominations the counted quantities per denomination, or {@code null} when
     *        no count was taken. This is the ONLY input to Counted Cash: the total is computed
     *        server-side by {@link com.billbull.backend.pos.session.denomination.PosDenominationCountService}
     *        so a client can no longer assert what the drawer held. A client-supplied
     *        {@code closingCash} is dropped at the controller and never reaches this method.
     * @param currencyCode optional declared currency, validated against the drawer's own.
     * @param closureAuthToken optional single-use grant from POST /sessions/{id}/authorize-closure.
     *        Day Close lets any authenticated user initiate a normal close of another cashier's
     *        session; the owner's credentials typed into the Session Owner Verification modal are
     *        what authorize it, and this token is the proof of that verification. The logged-in
     *        user is still recorded as the operator who performed the close.
     */
    @Transactional
    public PosSession closeSession(Long sessionId, Map<String, Object> closingDenominations,
                                   String currencyCode, String notes,
                                   String cardBatchNo, Boolean cardSettlementVerified, BigDecimal cardClosingCash,
                                   String closingCashierName, String closingSupervisorName,
                                   String closingRemarks, String closureAuthToken) {
        return closeSession(sessionId, closingDenominations, currencyCode, notes,
                cardBatchNo, cardSettlementVerified, cardClosingCash, closingCashierName,
                closingSupervisorName, closingRemarks, closureAuthToken, null);
    }

    /**
     * @param varianceApprovalToken single-use grant from POST /sessions/{id}/authorize-variance,
     *        proving a supervisor authorized this exact expected/counted pair. Required only when
     *        the discrepancy exceeds the branch threshold.
     */
    @Transactional
    public PosSession closeSession(Long sessionId, Map<String, Object> closingDenominations,
                                   String currencyCode, String notes,
                                   String cardBatchNo, Boolean cardSettlementVerified, BigDecimal cardClosingCash,
                                   String closingCashierName, String closingSupervisorName,
                                   String closingRemarks, String closureAuthToken,
                                   String varianceApprovalToken) {
        // Locked for the whole close: the status check, the single-use grant, the snapshot
        // freeze, the journal and the audit completion all happen inside it. Two simultaneous
        // closes therefore serialise, and the loser sees a CLOSED session and gets the
        // deterministic "already closed" refusal below rather than interleaving through the
        // finalization.
        PosSession session = repo.findByIdForUpdate(sessionId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "POS session not found: " + sessionId));
        if (session.getStatus() == PosSessionStatus.CLOSED) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Session is already closed.");
        }
        if (session.getStatus() != PosSessionStatus.OPEN && session.getStatus() != PosSessionStatus.SUSPENDED) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Session cannot be closed from status: " + session.getStatus());
        }

        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated");
        }
        String currentUsername = auth.getName();
        com.billbull.backend.user.User currentUser = userRepository.findByUsername(currentUsername)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found"));
        
        // A closure grant redeems to the user whose credentials were verified in the Session
        // Owner Verification modal — that is the identity the close is authorized against.
        // Without one, fall back to the logged-in user (the cashier closing their own session).
        com.billbull.backend.user.User authorizingUser = closureAuthorizationRegistry
                .consume(sessionId, closureAuthToken)
                .flatMap(userRepository::findById)
                .orElse(currentUser);

        com.billbull.backend.pos.auth.AuthorizationResult authResult = posSessionAuthorizationService.authorizeSessionClose(session, authorizingUser);
        if (!authResult.authorized()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, authResult.message());
        }

        // Expected cash comes from the reconciliation service, exactly as the X-Report gets it,
        // so the Close Session modal and the X-Report page cannot diverge — including after a
        // correction, which this path used to ignore while the X-Report applied it.
        BigDecimal expectedCash = cashReconciliationService.reconcile(session).expectedCash();

        // Counted Cash, derived from the submitted quantities and nothing else. Validation
        // happens here, before anything is written, so an invalid count fails the close rather
        // than half-persisting one.
        //
        // A null count is not a zero count: closing without submitting denominations leaves the
        // drawer UNCOUNTED, and the session records no counted cash and no variance. Treating
        // the absence of a count as "counted zero" would report the whole drawer as a shortage.
        PosDenominationCount count = denominationCountService.count(closingDenominations, currencyCode);
        BigDecimal countedCash = count != null ? count.countedCash() : null;
        BigDecimal variance = countedCash != null
                ? countedCash.subtract(expectedCash).abs() : BigDecimal.ZERO;

        // ── Variance authorization ───────────────────────────────────────────────────────
        //
        // The client-supplied `supervisorApproved` boolean is deliberately ignored. It used to
        // be the sole input to this gate: no credentials, no approver identity, no record of
        // what was approved — so any caller could close an arbitrarily large shortage by
        // sending one JSON field, while the UI, which never sent it, could not close a
        // legitimately over-threshold session at all.
        //
        // Authorization now comes from a server-issued grant, minted only after a supervisor's
        // credentials were verified, and bound to this session AND these exact figures. A
        // recount after approval no longer matches the grant, so an approval obtained for a
        // small discrepancy cannot be spent on a large one.
        BigDecimal signedDifference = countedCash != null ? countedCash.subtract(expectedCash) : null;
        String varianceApprovalStatus = "NOT_REQUIRED";
        PosVarianceApprovalRegistry.Approval approval = null;

        if (variancePolicy.requiresApproval(session.getBranchId(), signedDifference)) {
            approval = varianceApprovalRegistry
                    .consume(sessionId, expectedCash, countedCash, varianceApprovalToken)
                    .orElse(null);
            if (approval == null) {
                auditService.logSessionEvent(sessionId, session.getTerminalId(), session.getBranchId(),
                        "VARIANCE_APPROVAL_REQUIRED",
                        "expected=" + expectedCash + " counted=" + countedCash
                                + " variance=" + signedDifference
                                + " threshold=" + variancePolicy.thresholdFor(session.getBranchId()));
                throw new VarianceApprovalRequiredException(sessionId, expectedCash, countedCash,
                        signedDifference, variancePolicy.thresholdFor(session.getBranchId()),
                        "Cash variance of " + signedDifference.abs() + " exceeds the allowed threshold of "
                                + variancePolicy.thresholdFor(session.getBranchId())
                                + ". A supervisor must authorize this exact count before the session can "
                                + "be closed. If the drawer was recounted, the authorization must be "
                                + "obtained again for the new figure.");
            }
            varianceApprovalStatus = "APPROVED";
        }

        // One reading of the Business Day clock for the whole close operation. It must be
        // the SAME clock that stamped openedAt (see openSession) — mixing a UTC JVM clock
        // here with an Asia/Kolkata openedAt produced durations short by the zone offset,
        // and a negative duration for any session shorter than that offset.
        LocalDateTime closeTime = businessDayWindowService.clock().now();
        session.setClosedBy(currentUser());
        session.setClosedByDisplayName(resolveDisplayName(session.getClosedBy()));
        session.setClosedAt(closeTime);
        if (session.getOpenedAt() != null) {
            session.setDurationSeconds(Math.max(0, ChronoUnit.SECONDS.between(session.getOpenedAt(), closeTime)));
        }
        session.setStatus(PosSessionStatus.CLOSED);
        session.setExpectedCash(expectedCash);
        session.setNotes(notes);
        // The closing snapshot is written as one coherent set: the denominations, the total
        // derived from exactly those denominations, and the variance derived from exactly that
        // total. There is no path by which they can disagree, because none of them is supplied.
        if (count != null) {
            session.setClosingDenominationsJson(denominationCountService.toJson(count));
            session.setClosingCash(count.countedCash());
            session.setCashDifference(count.countedCash().subtract(expectedCash));
            session.setCountedAt(closeTime);
            session.setCountedCurrencyCode(count.currencyCode());
        } else {
            // Uncounted: no total, no variance. Distinct from a counted-empty drawer, which
            // records 0.00 and a real countedAt.
            session.setClosingCash(null);
            session.setCashDifference(null);
        }
        if (cardBatchNo != null) session.setCardBatchNo(cardBatchNo);
        if (cardClosingCash != null) {
            // Server is authoritative on whether the card settlement actually matches —
            // don't trust a client-computed boolean once we have the real counted amount.
            session.setCardClosingCash(cardClosingCash);
            BigDecimal cardVariance = cardClosingCash.subtract(nz(session.getTotalCardSales()));
            session.setCardDifference(cardVariance);
            session.setCardSettlementVerified(cardVariance.abs().compareTo(new BigDecimal("0.01")) <= 0);
        } else if (cardSettlementVerified != null) {
            session.setCardSettlementVerified(cardSettlementVerified);
        }
        session.setVarianceApprovalStatus(varianceApprovalStatus);
        if (approval != null) {
            // Identity from the verified grant, never from a client-supplied name.
            session.setVarianceApprovedBy(approval.approverUsername());
            session.setVarianceApprovedByUserId(approval.approverUserId());
            session.setVarianceApprovedAt(closeTime);
            session.setVarianceApprovalReason(approval.reason());
        }
        if (closingCashierName != null) session.setClosingCashierName(closingCashierName);
        if (closingSupervisorName != null) session.setClosingSupervisorName(closingSupervisorName);
        if (closingRemarks != null) session.setClosingRemarks(closingRemarks);

        // Closing a session implies its X-Report shift read is complete — stamp it so
        // a terminal that closes out without explicitly running X-Report still satisfies
        // the Z-Report end-of-day gate (closed terminals are no longer "active" anyway).
        if (session.getXReportGeneratedAt() == null) {
            session.setXReportGeneratedAt(closeTime);
            session.setXReportGeneratedBy(currentUser());
            session.setXReportGeneratedByDisplayName(resolveDisplayName(session.getXReportGeneratedBy()));
        }
        session.setXReportPrinted(true);

        // Capture immutable Z-Report snapshot at close time. An uncounted close has no
        // variance to record, so it reports as such rather than as a zero difference.
        BigDecimal countedForSnapshot = countedCash != null ? countedCash : BigDecimal.ZERO;
        String varianceStr = countedCash != null
                ? countedCash.subtract(expectedCash).toPlainString() : "NOT_COUNTED";
        session.setZReportJson(buildZReportSnapshot(session, expectedCash, countedForSnapshot, closeTime));

        PosSession closed = repo.save(session);

        // Release terminal lock so the terminal can accept a new session
        if (closed.getTerminalPk() != null) {
            terminalRepository.clearOpenSession(closed.getTerminalPk(), closed.getId());
        }

        // Hosting history: the session is no longer hosted anywhere once closed.
        terminalHostingService.endOpenHostingSegment(closed.getId());

        // §3.7 Session-close GL: settle the counted cash and name any discrepancy.
        try {
            Branch branch = closed.getBranchId() != null
                    ? branchRepository.findById(closed.getBranchId()).orElse(null) : null;
            // Post the cash-pickup JE against the session's Business Day, not the
            // calendar date: with an overnight window a session opened 2026-08-04
            // 22:00 and closed 2026-08-05 02:00 belongs to Business Day 08-04, and
            // its GL must land there too or the Z-Report and the GL disagree. The
            // date is used only as the JournalEntry posting date (see
            // PostingEngineService#createJournalFromSessionClose) — nothing
            // downstream depends on it being the calendar date. tradingDate is null
            // only for sessions opened before Phase 3A, hence the fallback.
            LocalDate glDate = closed.getTradingDate() != null
                    ? closed.getTradingDate() : businessDayWindowService.clock().now().toLocalDate();
            // Dr Bank (counted) [+ Dr Cash Short] / Cr Cash in Hand (EXPECTED) [+ Cr Cash Over].
            // Crediting Cash by the EXPECTED position rather than the counted one is what makes
            // a discrepancy visible: the old entry used counted on both sides, so it balanced
            // whatever the drawer held and the shortage disappeared into Cash in Hand.
            var journal = countedCash != null
                    ? postingEngine.createJournalFromSessionClose(
                            closed.getId(), countedCash, expectedCash, glDate, branch)
                    : null;

            if (countedCash == null) {
                // Nothing was counted, so there is nothing to settle and no variance to
                // recognise. Explicitly not a failure.
                closed.setGlPostingStatus("NOT_REQUIRED");
            } else {
                closed.setGlPostingStatus("POSTED");
                closed.setGlPostingReference("SCL-" + closed.getId());
                closed.setGlPostedAt(closeTime);
                closed.setGlPostingError(null);
                if (signedDifference != null && variancePolicy.isVariance(signedDifference)) {
                    auditService.logSessionEvent(closed.getId(), closed.getTerminalId(), closed.getBranchId(),
                            signedDifference.signum() < 0 ? "CASH_SHORT_POSTED" : "CASH_OVER_POSTED",
                            "expected=" + expectedCash + " counted=" + countedCash
                                    + " variance=" + signedDifference
                                    + " journalRef=SCL-" + closed.getId());
                }
            }
            repo.save(closed);
        } catch (Exception e) {
            // A failed posting must never look like a successful one. The close itself stands --
            // the cash has physically moved and the count is recorded -- but the accounting is
            // explicitly marked FAILED with the reason kept, so it is visible, queryable and
            // retryable instead of silently absent. The previous empty catch let a session
            // report itself fully reconciled while no journal existed at all.
            log.error("[PosSession] Session {} closed but its close journal FAILED to post. "
                            + "expected={} counted={} variance={}. The session is closed; its "
                            + "accounting is not.",
                    closed.getId(), expectedCash, countedCash, signedDifference, e);
            closed.setGlPostingStatus("FAILED");
            closed.setGlPostingReference("SCL-" + closed.getId());
            closed.setGlPostingError(truncate(e.getMessage(), 1000));
            repo.save(closed);
            auditService.logSessionEvent(closed.getId(), closed.getTerminalId(), closed.getBranchId(),
                    "GL_POSTING_FAILED",
                    "expected=" + expectedCash + " counted=" + countedCash
                            + " variance=" + signedDifference + " error=" + truncate(e.getMessage(), 300));
        }

        if (signedDifference != null && variancePolicy.isVariance(signedDifference)) {
            auditService.logSessionEvent(closed.getId(), closed.getTerminalId(), closed.getBranchId(),
                    "VARIANCE_DETECTED",
                    "expected=" + expectedCash + " counted=" + countedCash
                            + " variance=" + signedDifference
                            + " direction=" + (signedDifference.signum() < 0 ? "SHORT" : "OVER")
                            + " approval=" + varianceApprovalStatus);
        }
        if (approval != null) {
            auditService.logSessionEvent(closed.getId(), closed.getTerminalId(), closed.getBranchId(),
                    "VARIANCE_APPROVED",
                    "approver=" + approval.approverUsername() + " userId=" + approval.approverUserId()
                            + " expected=" + expectedCash + " counted=" + countedCash
                            + " variance=" + signedDifference + " reason=" + approval.reason());
        }

        // Async audit: session closed with variance info
        auditService.logSessionClosed(
                closed.getId(), closed.getTerminalId(), closed.getBranchId(), varianceStr);
        terminalActivityService.recordActivity(closed.getTerminalId(), "SESSION_CLOSE");

        return closed;
    }



    /**
     * Verifies that a supervisor may authorize this session's variance, and mints the grant.
     *
     * <p>The figures are derived here, never accepted: expected cash from the reconciliation
     * authority, counted cash from the submitted denominations via the count service. A client
     * cannot obtain a grant for numbers it made up, and cannot obtain one at all unless the
     * discrepancy genuinely exceeds the branch threshold.
     */
    @Transactional
    public Map<String, Object> authorizeVariance(Long sessionId, Map<String, Object> closingDenominations,
                                                  String currencyCode,
                                                  com.billbull.backend.user.User approver,
                                                  String reason) {
        PosSession session = getById(sessionId);
        if (session.getStatus() == PosSessionStatus.CLOSED) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Session is already closed; its variance cannot be authorized retroactively.");
        }

        // The approver must be entitled to close this session. Reusing the existing closure
        // authorization keeps one answer to "who may act on this drawer" rather than inventing a
        // second, weaker one for variances.
        com.billbull.backend.pos.auth.AuthorizationResult auth =
                posSessionAuthorizationService.authorizeSessionClose(session, approver);
        if (!auth.authorized()) {
            return Map.of("authorized", false, "code", "NOT_AUTHORIZED", "message", auth.message());
        }

        BigDecimal expectedCash = cashReconciliationService.reconcile(session).expectedCash();
        PosDenominationCount count = denominationCountService.count(closingDenominations, currencyCode);
        if (count == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "A variance can only be authorized against a physical count. Submit the counted "
                            + "denominations with the authorization request.");
        }
        BigDecimal countedCash = count.countedCash();
        BigDecimal signedDifference = countedCash.subtract(expectedCash);

        if (!variancePolicy.requiresApproval(session.getBranchId(), signedDifference)) {
            // Nothing to authorize. Minting a grant anyway would create a token that could be
            // held and spent later against a different count.
            return Map.of("authorized", true, "approvalRequired", false,
                    "expectedCash", expectedCash, "countedCash", countedCash,
                    "cashDifference", signedDifference,
                    "message", "This variance is within the allowed threshold; no authorization is needed.");
        }

        String token = varianceApprovalRegistry.issue(sessionId, expectedCash, countedCash,
                approver.getId(), approver.getUsername(), reason);

        auditService.logSessionEvent(sessionId, session.getTerminalId(), session.getBranchId(),
                "VARIANCE_APPROVED",
                "approver=" + approver.getUsername() + " userId=" + approver.getId()
                        + " expected=" + expectedCash + " counted=" + countedCash
                        + " variance=" + signedDifference + " reason=" + reason);

        Map<String, Object> result = new java.util.LinkedHashMap<>();
        result.put("authorized", true);
        result.put("approvalRequired", true);
        result.put("varianceApprovalToken", token);
        result.put("expectedCash", expectedCash);
        result.put("countedCash", countedCash);
        result.put("cashDifference", signedDifference);
        result.put("varianceAmount", signedDifference.abs());
        result.put("varianceDirection", signedDifference.signum() < 0 ? "SHORT" : "OVER");
        result.put("approver", approver.getUsername());
        return result;
    }

    // -------------------------------------------------------------------------
    // Closure workflow — begin / cancel
    //
    // The middle state between "trading" and CLOSED. The session stays genuinely OPEN
    // (the X-Report and every close validation operate on the open session), but
    // PosSessionClosureWorkflowGate refuses normal POS work on it from this point.
    // -------------------------------------------------------------------------

    /**
     * Starts the closure workflow for a session: stamps {@code closingStartedAt} /
     * {@code closingStartedBy} so the session is locked to closure operations only.
     *
     * <p>This is the <b>only</b> writer of that marker, and it is reached from exactly one
     * user action — the dashboard's "Close Session". Viewing or generating an X-Report
     * never calls it: the X-Report is an informational, optional, mid-shift read, and a
     * cashier who looks at one must be able to carry on selling.
     *
     * <p>Deliberately does NOT: close the session, change its status, generate an X-Report,
     * touch {@code xReportGeneratedAt}, move the Business Day or Trading Date, or create a
     * Day Close. It writes two columns and audits the fact.
     *
     * <p>Idempotent: calling it again on a session already in the workflow returns the
     * session unchanged — the original timestamp and initiating user survive, so the audit
     * trail keeps naming whoever actually started the closure.
     *
     * @param closureAuthToken optional grant from {@code POST /sessions/{id}/authorize-closure},
     *        verified but NOT consumed here — the close call that follows still has to spend
     *        it. Present when someone other than the logged-in user (the session's owner,
     *        verified in the Session Owner Verification modal) is the identity the closure is
     *        authorized against; absent when a cashier closes their own session.
     */
    @Transactional
    public PosSession beginClosure(Long sessionId, String closureAuthToken) {
        PosSession session = getById(sessionId);

        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated");
        }
        com.billbull.backend.user.User currentUser = userRepository.findByUsername(auth.getName())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found"));

        // Same identity resolution as closeSession(), so "may I start this closure?" and
        // "may I complete it?" can never disagree — verify() rather than consume() because
        // the grant is single-use and belongs to the close itself.
        com.billbull.backend.user.User authorizingUser = closureAuthorizationRegistry
                .verify(sessionId, closureAuthToken)
                .flatMap(userRepository::findById)
                .orElse(currentUser);

        // Already in the workflow — idempotent no-op. Checked before the status/Business Day
        // guards so a repeated click can never surface an error about a state this call was
        // going to reach anyway.
        if (session.getClosingStartedAt() != null) {
            return session;
        }

        if (session.getStatus() != PosSessionStatus.OPEN) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Only an OPEN session can begin closure. Current status: " + session.getStatus());
        }

        // Existing session-close authorization rules, reused verbatim.
        com.billbull.backend.pos.auth.AuthorizationResult authResult =
                posSessionAuthorizationService.authorizeSessionClose(session, authorizingUser);
        if (!authResult.authorized()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, authResult.message());
        }

        // Deliberately NOT gated by businessDayContinuationGate. That gate refuses to let a
        // previous-Business-Day session keep being *used* — resume, selling, checkout, cash
        // movements — and it stays enforced at every one of those call sites. Closure is the
        // opposite kind of operation: it is the remediation the gate is pushing the operator
        // toward, and Day Close cannot complete until the stale OPEN session is closed. Gating
        // it here deadlocked the flow ("close this session" → "you cannot, the day is stale").
        session.setClosingStartedAt(businessDayWindowService.clock().now());
        session.setClosingStartedBy(authorizingUser.getUsername());
        PosSession saved = repo.save(session);

        auditService.logSessionClosureStarted(saved.getId(), saved.getTerminalId(), saved.getBranchId(),
                saved.getClosingStartedBy());
        return saved;
    }

    /**
     * Cancels a started closure workflow, returning the session to normal operation.
     *
     * <p><b>Supervisor-only</b>, via {@code authorizeClosureCancellation} — owning the
     * session is not enough. Otherwise a cashier told to close out could simply un-start the
     * closure and put the till back into service, which is the bypass this whole workflow
     * exists to prevent.
     *
     * <p>Clears only {@code closingStartedAt}/{@code closingStartedBy}. Status,
     * {@code xReportGeneratedAt}, Trading Date, and Business Day are all left exactly as
     * they were — in particular, an X-Report generated while the closure was in progress
     * stays generated, because it was a real report that really ran.
     */
    @Transactional
    public PosSession cancelClosure(Long sessionId, String reason,
                                    String supervisorUsernameOrEmail, String supervisorPassword) {
        PosSession session = getById(sessionId);

        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated");
        }
        com.billbull.backend.user.User currentUser = userRepository.findByUsername(auth.getName())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found"));

        // A supervisor standing at a till the cashier is logged into verifies with their own
        // credentials — the same PosCredentialVerificationService flow the Session Owner
        // Verification modal already uses, so no parallel authentication is introduced. With
        // no credentials supplied, the logged-in user is the one authorized (a supervisor
        // working on their own device).
        com.billbull.backend.user.User authorizingUser = currentUser;
        if (supervisorUsernameOrEmail != null && !supervisorUsernameOrEmail.isBlank()) {
            com.billbull.backend.pos.auth.CredentialVerificationResult cred =
                    credentialVerificationService.verifyCredentials(supervisorUsernameOrEmail, supervisorPassword);
            if (!cred.valid()) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, cred.message());
            }
            authorizingUser = cred.user();
        }

        com.billbull.backend.pos.auth.AuthorizationResult authResult =
                posSessionAuthorizationService.authorizeClosureCancellation(session, authorizingUser);
        if (!authResult.authorized()) {
            // CLOSURE_NOT_STARTED is a state problem, not a permission problem — reporting it
            // as 403 would tell a supervisor they lack rights they actually have.
            HttpStatus status = "CLOSURE_NOT_STARTED".equals(authResult.reasonCode())
                    ? HttpStatus.BAD_REQUEST : HttpStatus.FORBIDDEN;
            throw new ResponseStatusException(status, authResult.message());
        }

        String previousStartedBy = session.getClosingStartedBy();
        String previousStartedAt = String.valueOf(session.getClosingStartedAt());

        session.setClosingStartedAt(null);
        session.setClosingStartedBy(null);
        PosSession saved = repo.save(session);

        auditService.logSessionClosureCancelled(saved.getId(), saved.getTerminalId(), saved.getBranchId(),
                previousStartedBy, previousStartedAt, reason);
        return saved;
    }

    /** Overload for callers with no supervisor credentials to hand — the logged-in user is
     *  the one authorized, and must themselves hold a supervisor role. */
    @Transactional
    public PosSession cancelClosure(Long sessionId, String reason) {
        return cancelClosure(sessionId, reason, null, null);
    }

    // -------------------------------------------------------------------------
    // Session suspend / resume / supervisor takeover
    // -------------------------------------------------------------------------

    @Transactional
    public PosSession suspendSession(Long sessionId) {
        PosSession session = getById(sessionId);
        if (session.getStatus() != PosSessionStatus.OPEN) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Only OPEN sessions can be suspended.");
        }
        session.setStatus(PosSessionStatus.SUSPENDED);
        return repo.save(session);
    }

    @Transactional
    public PosSession resumeSession(Long sessionId) {
        PosSession session = getById(sessionId);
        if (session.getStatus() != PosSessionStatus.SUSPENDED) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Only SUSPENDED sessions can be resumed.");
        }
        // Same rule as getActiveSession(): resuming is continuation, so a session from
        // a previous Business Day cannot be brought back into normal operation.
        businessDayContinuationGate.assertMayContinue(session);
        // Resuming is continuation, so a session already inside its close workflow cannot
        // be brought back into normal operation either — it can only be closed.
        closureWorkflowGate.assertMayOperate(session);
        session.setStatus(PosSessionStatus.OPEN);
        session.setLastActivityAt(businessDayWindowService.clock().now());
        PosSession resumed = repo.save(session);

        // Hosting history: resuming on the same terminal must not duplicate the open segment;
        // ensureHostingSegment is a no-op when the segment already points at this terminal.
        PosTerminal terminal = terminalHostingService.resolveHostingTerminal(resumed).orElse(null);
        terminalHostingService.ensureHostingSegment(resumed, terminal);

        return resumed;
    }

    /**
     * Supervisor takeover: verifies the supervisor PIN then transfers the session's
     * openedBy to the current user so they become the session owner.
     */
    @Transactional
    public PosSession supervisorTakeover(Long sessionId, String supervisorPin) {
        PosSession session = getById(sessionId);
        if (session.getStatus() == PosSessionStatus.CLOSED) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cannot take over a closed session.");
        }

        // Validate supervisor PIN (BCrypt)
        if (session.getBranchId() != null) {
            PosSettings settings = posSettingsRepository.findByBranchId(session.getBranchId()).orElse(null);
            if (settings != null && settings.isSupervisorPinSet()) {
                org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder encoder =
                        new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder();
                if (supervisorPin == null || !encoder.matches(supervisorPin, settings.getSupervisorPin())) {
                    throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Invalid supervisor PIN.");
                }
            }
        }

        session.setOpenedBy(currentUser());
        session.setStatus(PosSessionStatus.OPEN);
        session.setLastActivityAt(businessDayWindowService.clock().now());
        PosSession updated = repo.save(session);

        // Hosting history: takeover happens on the same terminal, so this is a no-op when a
        // segment is already open there; it only opens one if none existed (e.g. legacy session).
        PosTerminal terminal = terminalHostingService.resolveHostingTerminal(updated).orElse(null);
        terminalHostingService.ensureHostingSegment(updated, terminal);

        auditService.logSessionOpened(updated.getId(), updated.getTerminalId(), updated.getBranchId());
        return updated;
    }

    /**
     * Session Roaming Phase 8 — explicit, operator-confirmed transfer of a session's hosting
     * to another terminal. Ownership ({@code ownerUserId}/{@code openedBy}) is never touched;
     * only the physical terminal hosting the session changes. All validation, the atomic
     * terminal-lock hand-off, the hosting-history update, and the transfer-log write happen
     * inside {@link PosSessionTransferService#transfer} — this method only resolves the
     * initiating user, optionally verifies a supervisor PIN, and shapes the response.
     *
     * <p>Supervisor authorization is optional today (Phase 9 may make it mandatory for certain
     * destinations/roles): if {@code supervisorPin} is blank, the transfer proceeds as an
     * operator-confirmed move with {@code supervisorAuthorized=false}; if provided, it is
     * verified against the session's branch {@link PosSettings#getSupervisorPin()} the same
     * way {@link #supervisorTakeover} does, and a mismatch is rejected outright.
     */
    @Transactional
    public PosSessionTransferResponse transferSession(Long sessionId, String destinationTerminalId,
                                                        String reason, String supervisorPin) {
        PosSession before = getById(sessionId);
        Long sourceTerminalPk = before.getTerminalPk();
        boolean supervisorAuthorized = verifySupervisorPinIfProvided(before, supervisorPin);

        // Session Roaming Phase 9 — evaluate the transfer policy before attempting the move.
        // PosSessionTransferService#transfer stays business-operation only: it never decides
        // whether supervisor authorization is required, only whether an already-authorized
        // move can physically happen.
        PosTerminal destination = terminalRepository.findByTerminalId(destinationTerminalId).orElse(null);
        PosSessionTransferDecision decision = sessionTransferPolicy.evaluate(before, destination);
        if (decision.isDenied()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, decision.getMessage());
        }
        if (decision.isSupervisorRequired() && !supervisorAuthorized) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Supervisor authorization required: " + decision.getMessage());
        }

        Long initiatedByUserId = sessionOwnershipService.currentPrincipalUserId();

        PosSession moved = sessionTransferService.transfer(sessionId, destinationTerminalId,
                initiatedByUserId, supervisorAuthorized);

        PosSessionTransferLog logEntry = transferLogRepository.findBySessionIdOrderByCreatedAtDesc(sessionId)
                .stream().findFirst().orElse(null);
        String sourceTerminalId = sourceTerminalPk != null
                ? terminalRepository.findById(sourceTerminalPk).map(PosTerminal::getTerminalId).orElse(null)
                : null;

        return PosSessionTransferResponse.of(moved, sourceTerminalId, logEntry, reason, decision);
    }

    /** Session Roaming Phase 9 — read-only preview of what {@link #transferSession} would decide
     *  if the caller chose to transfer {@code ownerSession} onto {@code destinationTerminalId}.
     *  Used only to enrich the discovery response; never invoked from the transfer path itself
     *  (which re-evaluates the policy against the live destination lookup there). */
    private PosSessionTransferDecision evaluateTransferToTerminal(PosSession ownerSession, String destinationTerminalId) {
        PosTerminal destination = terminalRepository.findByTerminalId(destinationTerminalId).orElse(null);
        return sessionTransferPolicy.evaluate(ownerSession, destination);
    }

    /** Blank/absent PIN: no supervisor authorization asserted (returns false, transfer still
     *  allowed as an operator-confirmed move). Non-blank PIN: verified against the session's
     *  branch supervisor PIN (BCrypt) exactly like {@link #supervisorTakeover}; a mismatch
     *  throws 403 rather than silently downgrading to unauthorized. */
    private boolean verifySupervisorPinIfProvided(PosSession session, String supervisorPin) {
        if (supervisorPin == null || supervisorPin.isBlank()) {
            return false;
        }
        if (session.getBranchId() == null) {
            return false;
        }
        PosSettings settings = posSettingsRepository.findByBranchId(session.getBranchId()).orElse(null);
        if (settings == null || !settings.isSupervisorPinSet()) {
            return false;
        }
        org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder encoder =
                new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder();
        if (!encoder.matches(supervisorPin, settings.getSupervisorPin())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Invalid supervisor PIN.");
        }
        return true;
    }

    /** Date-range session history for the X-Report history picker (reprint/browse a past
     *  closed session). Filters implemented now: date range (required) + optional
     *  terminalId/status. Counter/cashier filtering deliberately deferred — not indexed
     *  today and not needed by the confirmed use case. Reuses the existing
     *  {@code util.PaginationUtil}/{@code PageResponse} pattern rather than a bespoke list. */
    @Transactional(readOnly = true)
    public com.billbull.backend.util.PageResponse<PosSessionHistoryItem> getSessionHistory(
            Long branchId, LocalDate dateFrom, LocalDate dateTo, String terminalId, String status,
            int page, int size) {
        List<PosSession> sessions = repo.findByBranchIdAndSessionDateBetweenOrderByOpenedAtDesc(branchId, dateFrom, dateTo);
        List<PosSessionHistoryItem> items = sessions.stream()
                .filter(s -> terminalId == null || terminalId.isBlank() || terminalId.equals(s.getTerminalId()))
                .map(s -> new PosSessionHistoryItem(
                        s.getId(),
                        s.getTerminalId(),
                        resolveTerminalName(s.getTerminalId()),
                        s.getCounterName(),
                        s.getOpenedBy(),
                        s.getOpenedAt(),
                        s.getClosedAt(),
                        s.getStatus() != null ? s.getStatus().name() : null,
                        s.getTotalSales(),
                        s.getInvoiceCount()))
                .toList();
        return com.billbull.backend.util.PaginationUtil.paginate(items, page, size, null, status);
    }

    private String resolveTerminalName(String terminalId) {
        if (terminalId == null || terminalId.isBlank()) return null;
        return terminalRepository.findByTerminalId(terminalId)
                .map(com.billbull.backend.pos.terminal.PosTerminal::getTerminalName).orElse(null);
    }

    /** Touch lastActivityAt — called by the sales/payment path to reset the idle clock. */
    @Transactional
    public void touchActivity(Long sessionId) {
        repo.touchLastActivity(sessionId, businessDayWindowService.clock().now());
    }

    /** @param closedAt the close timestamp already captured by the caller — deliberately a
     *  parameter rather than a second clock read, so the snapshot, session.closedAt and the
     *  duration all describe one instant of one operation. */
    private String buildZReportSnapshot(PosSession s, BigDecimal expectedCash, BigDecimal closingCash,
                                        LocalDateTime closedAt) {
        return "{\"sessionId\":" + s.getId()
                + ",\"terminalId\":\"" + safe(s.getTerminalId()) + "\""
                + ",\"closedAt\":\"" + closedAt + "\""
                + ",\"closedBy\":\"" + safe(currentUser()) + "\""
                + ",\"openingCash\":" + nz(s.getOpeningCash())
                + ",\"totalSales\":" + nz(s.getTotalSales())
                + ",\"totalCashSales\":" + nz(s.getTotalCashSales())
                + ",\"totalCardSales\":" + nz(s.getTotalCardSales())
                + ",\"totalCreditSales\":" + nz(s.getTotalCreditSales())
                + ",\"totalOnlineSales\":" + nz(s.getTotalOnlineSales())
                + ",\"invoiceCount\":" + (s.getInvoiceCount() != null ? s.getInvoiceCount() : 0)
                + ",\"expectedCash\":" + expectedCash
                + ",\"closingCash\":" + closingCash
                + ",\"cashVariance\":" + closingCash.subtract(expectedCash)
                + ",\"cardClosingCash\":" + nz(s.getCardClosingCash())
                + ",\"cardVariance\":" + nz(s.getCardDifference())
                + "}";
    }

    private static String safe(String v) { return v != null ? v.replace("\"", "\\\"") : ""; }

    @Transactional
    public PosCashMovement addCashMovement(Long sessionId, String movementType, BigDecimal amount, String description) {
        return addCashMovement(sessionId, movementType, amount, description, null);
    }

    /** {@code reference} is optional free-text (e.g. a supervisor-assigned drop slip
     *  number) — kept separate from description per the Cash Drop / Outs data model. */
    public PosCashMovement addCashMovement(Long sessionId, String movementType, BigDecimal amount,
                                            String description, String reference) {
        return addCashMovement(sessionId, movementType, amount, description, reference, null);
    }

    /**
     * Cash Movement Categories (Phase 2, § POS Integration): {@code categoryId} is optional
     * unless the owning branch's {@code PosSettings.requireCashMovementCategory} toggle is on,
     * in which case it's mandatory for every NEW movement — never retroactive, existing rows
     * are untouched regardless of when the toggle flips. When a category is supplied its
     * movement-type compatibility is validated (a DROP_IN-only category cannot be used on a
     * DROP_OUT, per §7) and, if it carries an optional GL account override, that account is
     * resolved once here and denormalized onto the movement (never re-resolved later) so a
     * future void reversal mirrors the exact original posting even if the category's mapping
     * changes afterward.
     */
    @Transactional
    public PosCashMovement addCashMovement(Long sessionId, String movementType, BigDecimal amount,
                                            String description, String reference, Long categoryId) {
        return addCashMovement(sessionId, movementType, amount, description, reference, categoryId, true);
    }

    /**
     * @param postGlJournal whether this movement should post its own journal.
     *
     *      <p>Almost always {@code true}: a drawer movement is normally the only record of the
     *      money moving, so it owns the posting. Pass {@code false} only when the owning
     *      business operation has <em>already</em> posted a complete journal that includes the
     *      Cash leg — otherwise the same amount is posted twice.
     *
     *      <p>Advance refunds and layaway deposits/refunds are exactly that case. Their
     *      journals ({@code createJournalFromAdvanceRefund},
     *      {@code createJournalFromLayawayDeposit}, {@code reverseLayawayDepositJournal})
     *      already debit or credit Cash in Hand against Customer Advance, so those flows need
     *      the drawer row for reconciliation but must not re-post the accounting. Their GL
     *      behaviour is therefore unchanged by gaining a cash movement.
     *
     *      <p>Contrast Sales Return cash refunds, which pass {@code true}: the return's own
     *      journal posts Dr Revenue + Dr VAT / Cr Accounts Receivable with no cash leg at all,
     *      so the movement's Dr AR / Cr Cash is what completes it.
     *
     *      <p>{@code postedAccountCode}/{@code postedAccountName} are still resolved and stored
     *      either way, so the record of which account the movement belongs to — and any later
     *      void reversal — stays consistent across both modes.
     */
    @Transactional
    public PosCashMovement addCashMovement(Long sessionId, String movementType, BigDecimal amount,
                                            String description, String reference, Long categoryId,
                                            boolean postGlJournal) {
        PosSession session = getById(sessionId);
        if (session.getStatus() != PosSessionStatus.OPEN) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cannot add cash movement to a closed session.");
        }
        // Cash movements are normal session operation — refused on a session that
        // belongs to a previous Business Day (the drawer's remaining legitimate
        // action is closing the session, which is not gated here).
        businessDayContinuationGate.assertMayContinue(session);
        // Likewise refused once closure has been started: a drop/payout added mid-closure
        // would move the drawer away from the figure the cashier is being counted against.
        // (Generating an X-Report does NOT trigger this — only the explicit Close Session
        // action does, so a mid-shift report leaves cash movements working normally.)
        closureWorkflowGate.assertMayOperate(session);

        PosCashMovementType type;
        try {
            type = PosCashMovementType.valueOf(movementType);
        } catch (IllegalArgumentException | NullPointerException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid movement type: " + movementType);
        }

        if (amount == null || amount.signum() <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cash movement amount must be greater than zero.");
        }

        // A cash out can never remove more cash than the drawer actually holds. "Available"
        // is the same Expected Cash figure closeSession()/getXReport() compute, so the POS
        // quick action, the back-office Add New form and the X-Report all agree on one number.
        if (type == PosCashMovementType.DROP_OUT) {
            BigDecimal available = availableCashInDrawer(session);
            if (amount.compareTo(available) > 0) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Cash out of " + amount.toPlainString() + " exceeds the cash available in the drawer ("
                                + available.toPlainString() + ").");
            }
        }

        PosCashMovementCategory category = null;
        if (categoryId != null) {
            category = cashMovementCategoryService.getActiveEntityOrThrow(categoryId);
            cashMovementCategoryService.assertCompatible(category, type);
            if (category.isNotesRequired() && (description == null || description.isBlank())) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Category \"" + category.getName() + "\" requires a description/notes.");
            }
        } else if (isCashMovementCategoryRequired(session.getBranchId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "A cash movement category is required. Select one before saving.");
        }

        PosCashMovement movement = new PosCashMovement();
        movement.setPosSession(session);
        movement.setMovementType(type);
        movement.setAmount(amount);
        movement.setDescription(description);
        movement.setReference(reference);
        movement.setPerformedBy(currentUser());
        movement.setPerformedByUserId(sessionOwnershipService.currentPrincipalUserId());
        movement.setPerformedAt(businessDayWindowService.clock().now());
        movement.setStatus(PosCashMovementStatus.ACTIVE);
        movement.setBusinessDate(session.getSessionDate());
        movement.setBranchId(session.getBranchId());
        movement.setCategoryId(categoryId);

        // Resolve the non-cash GL leg once, at creation — denormalized so a later void
        // reversal always mirrors exactly what was posted (§9), regardless of any later change
        // to the category's mapping.
        String accountCode = type == PosCashMovementType.DROP_IN
                ? PostingEngineService.ACC_PETTY_CASH : PostingEngineService.ACC_EXPENSE_GENERAL;
        String accountName = type == PosCashMovementType.DROP_IN ? "Petty Cash" : "General Expense";
        Account glOverride = cashMovementCategoryService.resolveGlAccount(category);
        if (glOverride != null) {
            accountCode = glOverride.getCode();
            accountName = glOverride.getName();
        }
        movement.setPostedAccountCode(accountCode);
        movement.setPostedAccountName(accountName);

        session.getCashMovements().add(movement);
        repo.save(session);

        // Post GL journal: DROP_IN → Dr Cash / Cr Petty Cash (or category account);
        // DROP_OUT → Dr Expense (or category account) / Cr Cash
        Branch branch = session.getBranchId() != null
                ? branchRepository.findById(session.getBranchId()).orElse(null)
                : null;
        if (postGlJournal) {
            postingEngine.createJournalFromCashMovement(
                    movement.getId(),
                    movementType,
                    amount,
                    description,
                    session.getSessionDate(),
                    branch,
                    accountCode,
                    accountName);
        }

        terminalActivityService.recordActivity(session.getTerminalId(), movementType);
        auditService.logCashMovement(sessionId, session.getTerminalId(), session.getBranchId(), movementType, amount.toPlainString());

        return movement;
    }

    private boolean isCashMovementCategoryRequired(Long branchId) {
        if (branchId == null) return false;
        return posSettingsRepository.findByBranchId(branchId)
                .map(PosSettings::getRequireCashMovementCategory)
                .map(Boolean.TRUE::equals)
                .orElse(false);
    }

    /**
     * Records a settled invoice against the session's running tender counters, splitting the
     * money across buckets by the checkout's actual payment allocations.
     *
     * <p>This used to classify the whole invoice total into a single bucket by pattern-matching
     * {@code invoice.paymentMode} ("does the string contain 'cash' and 'card'?"). That could
     * only ever be wrong for a sale paid more than one way: a 200 Cash+Card sale put 200 into
     * {@code totalMixedSales} and nothing into cash or card, so the drawer expectation the
     * cashier is counted against excluded cash the cashier was actually holding. Allocations
     * carry the per-tender amount, so each bucket now receives exactly what that tender took —
     * and the bucket sum reconciles with the {@code sales_payments} rows the X/Z reports
     * aggregate.
     *
     * @param plan the resolved settlement plan; when null (or empty) the legacy paymentMode
     *             classification is used, which is what historical/replayed callers still need
     */
    @Transactional
    public void recordInvoiceOnSession(Long sessionId, SalesInvoice invoice,
                                       com.billbull.backend.pos.checkout.PosPaymentPlan plan) {
        if (sessionId == null) return;

        // Race guard, and the last line of defence for the close-workflow rule: this is the
        // point inside the checkout transaction where a sale is actually attached to the
        // session, so it is where the session's *current* state has to be re-read. The
        // controller checks the same gate up front, but a cashier who presses Checkout at
        // the same moment the X-Report is generated would slip through a check made only
        // there. Costs one read on a row this transaction is about to touch anyway.
        //
        // findById, not getById: this method is deliberately tolerant of a missing session
        // (the totals update below is a no-op UPDATE in that case, and historical replay
        // relies on it), so the gate must not be the thing that turns an absent row into a
        // 404. A row that isn't there cannot be in a close workflow.
        repo.findById(sessionId).ifPresent(closureWorkflowGate::assertMayOperate);

        BigDecimal total = nz(invoice.getInvoiceTotal());

        BigDecimal cashDelta   = BigDecimal.ZERO;
        BigDecimal cardDelta   = BigDecimal.ZERO;
        BigDecimal creditDelta = BigDecimal.ZERO;
        BigDecimal onlineDelta = BigDecimal.ZERO;
        // Always zero for a new sale: a multi-tender checkout is now split across the real
        // buckets instead of being lumped into the deprecated "mixed" counter.
        BigDecimal mixedDelta  = BigDecimal.ZERO;

        if (plan != null && !plan.getAllocations().isEmpty()) {
            cashDelta   = allocated(plan, PosPaymentAllocationType.CASH);
            cardDelta   = allocated(plan, PosPaymentAllocationType.CARD);
            onlineDelta = allocated(plan, PosPaymentAllocationType.ONLINE);
            creditDelta = allocated(plan, PosPaymentAllocationType.CREDIT);
        } else {
            // Compatibility path — no allocations available (historical replay, or a credit sale
            // that tendered nothing). Falls back to the stored label, as before.
            String mode = invoice.getPaymentMode() != null ? invoice.getPaymentMode().toLowerCase() : "";
            if (mode.contains("cash") && mode.contains("card")) {
                mixedDelta = total;
            } else if (mode.contains("cash")) {
                cashDelta = total;
            } else if (mode.contains("card") || mode.contains("credit card")) {
                cardDelta = total;
            } else if (mode.contains("credit")) {
                creditDelta = total;
            } else if (mode.contains("online") || mode.contains("bank") || mode.contains("transfer")) {
                onlineDelta = total;
            } else {
                cashDelta = total; // default fallback (Voucher, etc.) treated as cash
            }
        }

        // Count voided lines on this invoice for the session's running void tally.
        int voidDelta = 0;
        if (invoice.getItems() != null) {
            for (SalesInvoiceItem it : invoice.getItems()) {
                if (it.isVoided()) voidDelta++;
            }
        }

        // Atomic UPDATE — no SELECT, no optimistic lock, no hot-row contention.
        repo.incrementSessionTotals(sessionId, total, cashDelta, cardDelta, creditDelta, mixedDelta, onlineDelta, voidDelta);
        // Reset the idle clock so a cashier actively ringing sales is never auto-suspended.
        repo.touchLastActivity(sessionId, businessDayWindowService.clock().now());
    }

    /** Backward-compatible overload for callers with no settlement plan to hand. */
    @Transactional
    public void recordInvoiceOnSession(Long sessionId, SalesInvoice invoice) {
        recordInvoiceOnSession(sessionId, invoice, null);
    }

    private static BigDecimal allocated(com.billbull.backend.pos.checkout.PosPaymentPlan plan,
                                        PosPaymentAllocationType type) {
        return BigDecimal.valueOf(plan.amountFor(type)).setScale(2, java.math.RoundingMode.HALF_UP);
    }

    /** Explicit shift X-Report run by an open terminal. Stamps {@code xReportGeneratedAt}
     *  the first time it is called on an OPEN session (idempotent), then returns the same
     *  payload as {@link #getXReport}. This stamp is what the end-of-day Z-Report gate
     *  checks — the read-only {@link #getXReport} preview (used on the dashboard) never
     *  marks completion.
     *
     *  The same first-time-only gate also persists an immutable {@link PosXReportSnapshot}
     *  (POS Reports module — back-office historical X-Report browser), so exactly one
     *  snapshot exists per session, taken at the moment the shift's X-Report was actually
     *  generated. A session that closes without ever having its X-Report explicitly run
     *  (see {@link #closeSession}, which only stamps the timestamp) has no snapshot row —
     *  there is no "report" to have persisted, matching prior behavior for that case. */
    @Transactional
    public Map<String, Object> generateXReport(Long sessionId) {
        PosSession session = getById(sessionId);
        if (session.getStatus() == PosSessionStatus.OPEN && session.getXReportGeneratedAt() == null) {
            LocalDateTime generatedAt = businessDayWindowService.clock().now();
            String generatedBy = currentUser();
            String generatedByDisplayName = resolveDisplayName(generatedBy);
            session.setXReportGeneratedAt(generatedAt);
            session.setXReportGeneratedBy(generatedBy);
            session.setXReportGeneratedByDisplayName(generatedByDisplayName);
            session.setXReportPrinted(true);
            repo.save(session);

            Map<String, Object> report = getXReport(sessionId);
            String reportNumber = reportNumberService.nextReportNumber("XR", session.getBranchId(), session.getSessionDate());
            report.put("reportNumber", reportNumber);
            persistXReportSnapshot(session, report, reportNumber, generatedAt, generatedBy, generatedByDisplayName);
            return report;
        }
        return getXReport(sessionId);
    }

    private void persistXReportSnapshot(PosSession session, Map<String, Object> report, String reportNumber,
                                         LocalDateTime generatedAt, String generatedBy, String generatedByDisplayName) {
        try {
            PosXReportSnapshot snapshot = new PosXReportSnapshot();
            snapshot.setReportNumber(reportNumber);
            snapshot.setSessionId(session.getId());
            snapshot.setBranchId(session.getBranchId());
            snapshot.setBranchName(session.getBranchName());
            snapshot.setTerminalId(session.getTerminalId());
            snapshot.setCounterId(session.getCounterId());
            snapshot.setCounterName(session.getCounterName());
            snapshot.setCashierName(session.getOpenedBy());
            snapshot.setCashierDisplayName(session.getOpenedByDisplayName() != null
                    ? session.getOpenedByDisplayName() : resolveDisplayName(session.getOpenedBy()));
            snapshot.setBusinessDate(session.getSessionDate());
            snapshot.setGeneratedBy(generatedBy);
            snapshot.setGeneratedByDisplayName(generatedByDisplayName);
            snapshot.setGeneratedAt(generatedAt);
            snapshot.setReportJson(objectMapper.writeValueAsString(report));
            xReportSnapshotRepository.save(snapshot);
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to persist X-Report snapshot");
        }
    }

    @Transactional(readOnly = true)
    public Map<String, Object> getXReport(Long sessionId) {
        PosSession session = getById(sessionId);
        // Fetch invoices WITH items in one query — the report streams items for sums
        // and per-line void detail, so a plain fetch would trigger N+1 lazy loads.
        List<SalesInvoice> invoices = invoiceRepo.findByPosSessionIdWithItems(sessionId);
        List<ReceiptVoucher> advances = receiptVoucherRepository.findByPosSessionId(sessionId);
        if (!advances.isEmpty()) {
            advances.forEach(entityManager::detach);
            advances = effectiveCorrectionViewService.resolveOverlays(
                    com.billbull.backend.pos.admin.CorrectionTargetType.RECEIPT_VOUCHER, advances, ReceiptVoucher::getId);
        }

        List<PosCashMovement> cashMovements = session.getCashMovements().stream()
                .map(PosCashMovement::detachedCopy).toList();
        if (!cashMovements.isEmpty()) {
            cashMovements = effectiveCorrectionViewService.resolveOverlays(
                    com.billbull.backend.pos.admin.CorrectionTargetType.CASH_MOVEMENT, cashMovements, PosCashMovement::getId);
        }

        BigDecimal cashDropIn = sumCashMovements(cashMovements, PosCashMovementType.DROP_IN);
        BigDecimal cashDropOut = sumCashMovements(cashMovements, PosCashMovementType.DROP_OUT);

        // Actual tender collected (not invoice value) for this single session — keyed on
        // Payment.posSessionId (the COLLECTION session), so a delivery order created in an
        // older session but settled here shows up as this session's cash the moment it's
        // collected, while `invoices` above (this session's own SALE-session-scoped list)
        // continues to drive gross sales / item stats via buildSalesSummary below.
        TenderTotals tender = aggregateTender(advances, List.of(sessionId));
        // Actual tender refunded (paymentType = MADE) for this session, bucketed the same way.
        TenderTotals refunds = aggregateRefunds(List.of(sessionId));

        Map<String, Object> summary = buildSalesSummary(invoices, tender);
        summary.put("invoiceCount", session.getInvoiceCount() != null ? session.getInvoiceCount() : invoices.size());
        summary.put("sessionCount", 1);
        summary.put("openingCash", nz(session.getOpeningCash()));
        summary.put("cashDropIn", cashDropIn);
        summary.put("cashDropOut", cashDropOut);
        // The authoritative reconciliation — the same call closeSession() makes, so the two can
        // never disagree. cashDropIn/cashDropOut above remain the report's own display rows.
        PosCashReconciliationResult reconciliation = cashReconciliationService.reconcile(session);
        summary.put("expectedCash", reconciliation.expectedCash());
        // Counted cash and variance are reported only when a count actually exists; an
        // uncounted drawer has no variance, and publishing 0 would state a reconciliation that
        // never happened.
        summary.put("countedCash", reconciliation.countedCash());
        summary.put("cashVariance", reconciliation.variance());
        summary.put("reconciliationStatus", reconciliation.status());

        // Consolidated Cash Position — additive, informational only, never feeds the
        // Expected Cash figure above. Customer Receipts/Advances are back-office vouchers
        // with no session linkage yet, so they're omitted here (Z-Report only).
        summary.put("cashPosition", buildCashPosition(session.getBranchId(), session.getSessionDate(),
                List.of(sessionId), session.getOpeningCash(), tender.cash, cashDropIn, cashDropOut, false));

        // Card refund attribution — sourced from actual refund Payment rows for this
        // session's invoices, not the generic (and unrelated) item-void counter.
        summary.put("cardRefundSales", refunds.byBucket.getOrDefault("card", BigDecimal.ZERO));
        summary.put("cardRefundCount", refunds.countByBucket.getOrDefault("card", 0L));

        // Void / refund reporting from the audit trail + persisted voided lines.
        VoidReport voids = buildVoidReport(invoices, List.of(sessionId));
        summary.put("voidItemCount", voids.postedVoids.size() + voids.cartRemovals.size());
        summary.put("postedVoidCount", voids.postedVoids.size());
        summary.put("cartRemovalCount", voids.cartRemovals.size());
        summary.put("voidAmount", voids.voidAmount);
        summary.put("totalRefunds", refunds.total);
        summary.put("totalRefundCount", refunds.countByBucket.values().stream().mapToLong(Long::longValue).sum());

        // Sales Return module figures for THIS session only — same source and shape as
        // the Z-Report's Returns/Refund Summary (buildReturnsSummary), but restricted to
        // returns linked to this session's own invoices. Returns are stored per branch+day
        // with no posSessionId, so without this filter a same-day return made against a
        // different session (another device, or another cashier's concurrent session)
        // would leak into this X-Report. The Z-Report intentionally keeps the unfiltered
        // branch+day view since it aggregates the whole business day.
        ReturnsSummary returns = buildSessionReturnsSummary(session.getBranchId(), session.getSessionDate(), invoices);
        summary.put("salesReturnCount", returns.totalCount);
        summary.put("salesReturnTotal", returns.totalAmount);
        summary.put("creditNoteCount", returns.creditNoteCount);
        summary.put("creditNoteTotal", returns.creditNoteTotal);
        summary.put("refundCount", returns.refundCount);
        summary.put("refundTotal", returns.refundTotal);
        summary.put("exchangeCount", returns.exchangeCount);
        summary.put("exchangeTotal", returns.exchangeTotal);
        summary.put("totalItemsReturned", returns.totalQtyReturned);

        // Reopen tracking: more than one SESSION_OPENED audit entry for this session id
        // means the terminal was reopened after an earlier open (first open isn't a "reopen").
        long sessionOpenedCount = auditLogRepository.countBySessionIdAndAction(sessionId, PosAuditAction.SESSION_OPENED);
        summary.put("sessionReopenedCount", Math.max(0, sessionOpenedCount - 1));

        Map<String, Object> result = new java.util.LinkedHashMap<>();
        result.put("session", session);
        result.put("invoices", invoices);
        result.put("summary", summary);
        result.put("tender", tender.byBucket);
        result.put("tenderLines", tender.lines);
        result.put("voids", voids.postedVoids);
        result.put("cartRemovals", voids.cartRemovals);
        result.put("cashiers", buildCashierAttribution(invoices, tender));
        result.put("sessionInfo", buildSessionInfo(session));
        result.put("topSellingItems", buildTopSellingItems(invoices, 5));
        return result;
    }

    /** Hard gate for the X-Report "print"/"export" actions — as opposed to the on-screen
     *  preview via {@link #getXReport}, which stays available while the session is open
     *  so the cashier can review before closing. ERP rule: the shift report can only be
     *  committed to paper/PDF/Excel once the session is closed. */
    @Transactional(readOnly = true)
    public void assertXReportPrintable(Long sessionId) {
        PosSession session = getById(sessionId);
        if (session.getStatus() != PosSessionStatus.CLOSED) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "X-Report can only be printed or exported after the session is closed.");
        }
    }

    /** Hard gate for the Z-Report "print"/"export" actions. ERP rule: the day-end report
     *  can only be committed to paper/PDF/Excel once the business day has been closed. */
    @Transactional(readOnly = true)
    public void assertZReportPrintable(Long branchId, LocalDate date) {
        if (!dayCloseRepository.existsByBranchIdAndCloseDate(branchId, date)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Z-Report can only be printed or exported after the business day is closed.");
        }
    }

    // ── Day Close session-range resolution (ARCHFIX: single source of truth) ──────
    //
    // Resolved once per operation (Z-Report preview, Day Close summary, or the
    // actual closeDay transaction) and reused throughout — closeDay, the dynamic
    // Z-Report, its validations, and its reconciliation all operate on the exact
    // same session list, eliminating the prior divergence between the open-session
    // check (queried allSessions) and the report aggregation (queried CLOSED-only,
    // separately). "First"/"last" session is by openedAt ascending order (falling
    // back to id for a stable tiebreak when timestamps are equal or null).

    /** Immutable snapshot of a business date's session range resolution. */
    private static final class ResolvedSessionRange {
        final Long branchId;
        final LocalDate date;
        /** Every session for branchId+date, any status, ascending by openedAt/id. */
        final List<PosSession> allSessionsForDate;
        /** The subset between (and including) startSession and endSession. */
        final List<PosSession> resolvedSessions;
        final PosSession startSession;
        final PosSession endSession;
        /** Sessions for the date that fall outside the resolved range. */
        final List<PosSession> excludedSessions;

        ResolvedSessionRange(Long branchId, LocalDate date, List<PosSession> allSessionsForDate,
                              List<PosSession> resolvedSessions, PosSession startSession, PosSession endSession,
                              List<PosSession> excludedSessions) {
            this.branchId = branchId;
            this.date = date;
            this.allSessionsForDate = allSessionsForDate;
            this.resolvedSessions = resolvedSessions;
            this.startSession = startSession;
            this.endSession = endSession;
            this.excludedSessions = excludedSessions;
        }
    }

    /**
     * Resolves the session range for a trading date (Day Close domain — keyed on
     * {@code PosSession.tradingDate}, the real calendar day sessions opened on, never
     * {@code sessionDate}; see {@code PosPendingDayCloseResolver}). With no override,
     * the range is the entire date (first session -> last session by openedAt),
     * matching the pre-existing "every session is included automatically" behavior.
     * With an explicit startSessionId/endSessionId (supervisor override), the range
     * narrows to the sessions between those two boundaries (inclusive), and everything
     * else for the date is reported as excluded rather than silently dropped.
     */
    private ResolvedSessionRange resolveSessionRange(Long branchId, LocalDate date, Long startSessionId, Long endSessionId) {
        List<PosSession> ascending = repo.findByBranchIdAndTradingDateOrderByOpenedAtDesc(branchId, date).stream()
                .sorted(Comparator
                        .comparing(PosSession::getOpenedAt, Comparator.nullsLast(Comparator.naturalOrder()))
                        .thenComparing(PosSession::getId, Comparator.nullsLast(Comparator.naturalOrder())))
                .toList();

        if (ascending.isEmpty()) {
            return new ResolvedSessionRange(branchId, date, ascending, List.of(), null, null, List.of());
        }

        ascending.forEach(entityManager::detach);
        ascending = effectiveCorrectionViewService.resolveOverlays(
                com.billbull.backend.pos.admin.CorrectionTargetType.POS_SESSION, ascending, PosSession::getId);

        PosSession startSession = startSessionId != null
                ? resolveBoundarySession(startSessionId, branchId, date, "Start")
                : ascending.get(0);
        PosSession endSession = endSessionId != null
                ? resolveBoundarySession(endSessionId, branchId, date, "End")
                : ascending.get(ascending.size() - 1);

        int startIdx = indexOfSession(ascending, startSession.getId());
        int endIdx = indexOfSession(ascending, endSession.getId());
        if (startIdx < 0 || endIdx < 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Session range could not be resolved for business date " + date + " — please refresh and retry.");
        }
        if (startIdx > endIdx) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Start session must occur before End session.");
        }

        List<PosSession> resolved = new ArrayList<>(ascending.subList(startIdx, endIdx + 1));
        List<PosSession> excluded = new ArrayList<>();
        excluded.addAll(ascending.subList(0, startIdx));
        excluded.addAll(ascending.subList(endIdx + 1, ascending.size()));

        return new ResolvedSessionRange(branchId, date, ascending, resolved, startSession, endSession, excluded);
    }

    private PosSession resolveBoundarySession(Long sessionId, Long branchId, LocalDate date, String label) {
        PosSession session = getById(sessionId);
        if (!Objects.equals(session.getBranchId(), branchId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    label + " session " + sessionId + " does not belong to branch " + branchId + ".");
        }
        if (!Objects.equals(session.getTradingDate(), date)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    label + " session " + sessionId + " does not belong to business date " + date + ".");
        }
        return session;
    }

    private static int indexOfSession(List<PosSession> sessions, Long id) {
        for (int i = 0; i < sessions.size(); i++) {
            if (id.equals(sessions.get(i).getId())) return i;
        }
        return -1;
    }

    /** Read-only preview of the resolved Day Close session range — backs the Day
     *  Close screen's summary panel (business date, first/last session, cashiers,
     *  counters, terminals, trading time span, session status, exclusion warnings)
     *  shown before the supervisor confirms. */
    @Transactional(readOnly = true)
    public Map<String, Object> getDayCloseSummary(Long branchId, LocalDate date, Long startSessionId, Long endSessionId) {
        ResolvedSessionRange range = resolveSessionRange(branchId, date, startSessionId, endSessionId);
        return buildDayCloseSummary(range);
    }

    private Map<String, Object> buildDayCloseSummary(ResolvedSessionRange range) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("branchId", range.branchId);
        result.put("businessDate", range.date.toString());
        result.put("startSessionId", range.startSession != null ? range.startSession.getId() : null);
        result.put("endSessionId", range.endSession != null ? range.endSession.getId() : null);
        result.put("startSession", range.startSession != null ? buildSessionInfo(range.startSession) : null);
        result.put("endSession", range.endSession != null ? buildSessionInfo(range.endSession) : null);
        result.put("totalSessions", range.resolvedSessions.size());
        result.put("cashiers", range.resolvedSessions.stream().map(PosSession::getOpenedBy)
                .filter(Objects::nonNull).distinct().toList());
        result.put("counters", range.resolvedSessions.stream().map(PosSession::getCounterName)
                .filter(Objects::nonNull).distinct().toList());
        result.put("terminals", range.resolvedSessions.stream().map(PosSession::getTerminalId)
                .filter(Objects::nonNull).distinct().toList());
        result.put("tradingStart", range.resolvedSessions.stream().map(PosSession::getOpenedAt)
                .filter(Objects::nonNull).min(Comparator.naturalOrder())
                .map(t -> t.atZone(ZoneId.systemDefault())).orElse(null));
        result.put("tradingEnd", range.resolvedSessions.stream()
                .map(s -> s.getClosedAt() != null ? s.getClosedAt() : s.getOpenedAt())
                .filter(Objects::nonNull).max(Comparator.naturalOrder())
                .map(t -> t.atZone(ZoneId.systemDefault())).orElse(null));
        result.put("sessions", range.resolvedSessions.stream().map(this::buildSessionInfo).toList());

        long openCount = range.allSessionsForDate.stream().filter(s -> s.getStatus() == PosSessionStatus.OPEN).count();
        long suspendedCount = range.allSessionsForDate.stream().filter(s -> s.getStatus() == PosSessionStatus.SUSPENDED).count();
        result.put("openSessionCount", openCount);
        result.put("suspendedSessionCount", suspendedCount);
        result.put("readyToClose", openCount == 0 && suspendedCount == 0 && !range.resolvedSessions.isEmpty());

        result.put("excludedSessionCount", range.excludedSessions.size());
        result.put("excludedSessions", range.excludedSessions.stream().map(this::buildSessionInfo).toList());
        return result;
    }

    /** Backward-compatible overload — resolves the full-date range automatically. */
    @Transactional(readOnly = true)
    public Map<String, Object> getZReport(Long branchId, LocalDate date) {
        return getZReport(branchId, date, null, null);
    }

    @Transactional(readOnly = true)
    public Map<String, Object> getZReport(Long branchId, LocalDate date, Long startSessionId, Long endSessionId) {
        // 1. Check if day is already closed
        Optional<PosDayClose> dayClose = dayCloseRepository.findByBranchIdAndCloseDate(branchId, date);
        if (dayClose.isPresent()) {
            try {
                @SuppressWarnings("unchecked")
                Map<String, Object> snapshot = objectMapper.readValue(dayClose.get().getzReportJson(), Map.class);
                snapshot.put("isDayClosed", true);
                return snapshot;
            } catch (Exception e) {
                throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to parse Z-Report snapshot", e);
            }
        }

        ResolvedSessionRange range = resolveSessionRange(branchId, date, startSessionId, endSessionId);
        return generateDynamicZReport(range);
    }

    private Map<String, Object> generateDynamicZReport(ResolvedSessionRange range) {
        Long branchId = range.branchId;
        LocalDate date = range.date;
        // End-of-day gate: every terminal that is still OPEN for this branch+date must
        // have generated its X-Report before the consolidated Z-Report can be produced.
        // Any open session without an X-Report stamp is reported as a pending terminal.
        // Scoped to the whole business date (not just the resolved range) — a pending
        // terminal outside a supervisor-narrowed range still owes its X-Report.
        List<PosSession> openSessions = range.allSessionsForDate.stream()
                .filter(s -> s.getStatus() == PosSessionStatus.OPEN)
                .toList();
        List<Map<String, Object>> pendingTerminals = new java.util.ArrayList<>();
        for (PosSession s : openSessions) {
            if (s.getXReportGeneratedAt() != null) continue;
            String terminalName = null;
            if (s.getTerminalId() != null && !s.getTerminalId().isBlank()) {
                terminalName = terminalHostingService.resolveHostingTerminal(s)
                        .map(PosTerminal::getTerminalName).orElse(null);
            }
            Map<String, Object> p = new java.util.LinkedHashMap<>();
            p.put("sessionId", s.getId());
            p.put("terminalId", s.getTerminalId());
            p.put("terminalName", terminalName);
            p.put("counter", s.getCounterName());
            p.put("openedBy", s.getOpenedBy());
            pendingTerminals.add(p);
        }
        boolean eligible = pendingTerminals.isEmpty();

        List<PosSession> sessions = range.resolvedSessions.stream()
                .filter(s -> s.getStatus() == PosSessionStatus.CLOSED)
                .toList();
        List<Long> sessionIds = sessions.stream().map(PosSession::getId).toList();
        List<SalesInvoice> invoices = sessionIds.isEmpty()
                ? List.of()
                : invoiceRepo.findByBranchIdAndPosSessionIdInWithItems(branchId, sessionIds).stream()
                    .filter(inv -> inv.getStatus() != SalesInvoiceStatus.CANCELLED && inv.getStatus() != SalesInvoiceStatus.DRAFT)
                    .toList();

        List<ReceiptVoucher> advances = sessionIds.isEmpty() ? List.of() : receiptVoucherRepository.findByPosSessionIdIn(sessionIds);
        if (!advances.isEmpty()) {
            advances.forEach(entityManager::detach);
            advances = effectiveCorrectionViewService.resolveOverlays(
                    com.billbull.backend.pos.admin.CorrectionTargetType.RECEIPT_VOUCHER, advances, ReceiptVoucher::getId);
        }

        // Keyed on Payment.posSessionId, NOT on the invoice-derived `sessionIds` filter above:
        // a payment collected through one of today's `sessionIds` is included here even when
        // the invoice it settles was created in an older session/business date that falls
        // outside this range entirely (a delivery order settled today, rung up weeks ago).
        // `invoices` continues to drive gross sales / item stats via buildSalesSummary below.
        TenderTotals tender = aggregateTender(advances, sessionIds);
        // Actual tender refunded (paymentType = MADE) across the day's sessions — same
        // source and shape as the X-Report's "Returns" KPI, so the two reports agree.
        TenderTotals refunds = aggregateRefunds(sessionIds);

        int invoiceCount = sessions.stream()
                .mapToInt(s -> s.getInvoiceCount() != null ? s.getInvoiceCount() : 0).sum();
        BigDecimal openingCash = sessions.stream()
                .map(s -> nz(s.getOpeningCash())).reduce(BigDecimal.ZERO, BigDecimal::add);

        Map<String, Object> summary = buildSalesSummary(invoices, tender);
        // invoiceCount derives from session counters across the day; fall back to fetched rows.
        summary.put("invoiceCount", invoiceCount > 0 ? invoiceCount : invoices.size());
        summary.put("sessionCount", sessions.size());
        summary.put("openingCash", openingCash);

        VoidReport voids = buildVoidReport(invoices, sessionIds);
        summary.put("voidItemCount", voids.postedVoids.size() + voids.cartRemovals.size());
        summary.put("postedVoidCount", voids.postedVoids.size());
        summary.put("cartRemovalCount", voids.cartRemovals.size());
        summary.put("voidAmount", voids.voidAmount);
        summary.put("cardRefundSales", refunds.byBucket.getOrDefault("card", BigDecimal.ZERO));
        summary.put("cardRefundCount", refunds.countByBucket.getOrDefault("card", 0L));
        summary.put("totalRefunds", refunds.total);
        summary.put("totalRefundCount", refunds.countByBucket.values().stream().mapToLong(Long::longValue).sum());

        // Returns / Refund Summary — sourced from the Sales Return module for this branch+date
        // (a Sales Return is a separate post-sale transaction, not a session-scoped concept,
        // so it's queried by branch/date like the rest of the Z-Report rather than by session).
        ReturnsSummary returns = buildReturnsSummary(branchId, date);
        summary.put("salesReturnCount", returns.totalCount);
        summary.put("salesReturnTotal", returns.totalAmount);
        summary.put("creditNoteCount", returns.creditNoteCount);
        summary.put("creditNoteTotal", returns.creditNoteTotal);
        summary.put("refundCount", returns.refundCount);
        summary.put("refundTotal", returns.refundTotal);
        summary.put("exchangeCount", returns.exchangeCount);
        summary.put("exchangeTotal", returns.exchangeTotal);
        summary.put("totalItemsReturned", returns.totalQtyReturned);
        // Net quantity sold must net out returns — previously this duplicated totalItemsSold.
        int totalItemsSold = (Integer) summary.getOrDefault("totalItemsSold", 0);
        summary.put("netQuantitySold", Math.max(0, totalItemsSold - returns.totalQtyReturned));

        // Consolidated Cash Position — additive, informational only; never feeds the
        // per-session Expected Cash figure or the Day Close reconciliation above. Cash
        // Drop/Out totals sourced via one grouped query across the resolved session set
        // (no cashDropIn/cashDropOut existed in the Z-Report summary before this).
        Map<String, BigDecimal> cashMovementTotals = sumCashMovementsByType(sessionIds);
        BigDecimal cashDropIn = cashMovementTotals.getOrDefault("DROP_IN", BigDecimal.ZERO);
        BigDecimal cashDropOut = cashMovementTotals.getOrDefault("DROP_OUT", BigDecimal.ZERO);

        // Expected Cash for the day = the sum of the authoritative per-session figures frozen at
        // each close. Deliberately NOT a second formula over the day's aggregates: these values
        // came from the reconciliation service when each drawer was counted, and this is the
        // same quantity Day Close already computes as `expectedCashSessions`.
        //
        // Published because the Z-Report previously emitted no expectedCash at all, which is
        // precisely why the frontend invented `opening + cashSales` — a formula that silently
        // dropped every cash movement, and with it every cash refund. Supplying the real value
        // is what lets that duplicate be deleted rather than merely relocated.
        // The day's drawer reconciliation, aggregated from the frozen per-session snapshots by
        // the single authority. No re-derivation from the day's transactions: that would be a
        // second cash model competing with the one each drawer was closed against.
        PosDayCashReconciliation dayCash = cashReconciliationService.summarizeDay(sessions);
        summary.put("expectedCash", dayCash.expectedCash());
        summary.put("countedCash", dayCash.countedCash());
        summary.put("cashVariance", dayCash.cashVariance());
        summary.put("reconciliationStatus", dayCash.status());
        summary.put("sessionsWithVariance", dayCash.sessionsWithVariance());
        summary.put("uncountedSessionCount", dayCash.uncountedSessionCount());
        summary.put("countedSessionCount", dayCash.countedSessionCount());
        summary.put("fullyCounted", dayCash.isFullyCounted());
        // The comparable halves for a partly counted day: a day variance is withheld when any
        // drawer is uncounted, so this is the honest figure for the drawers actually verified.
        summary.put("countedSessionsExpectedCash", dayCash.countedSessionsExpectedCash());
        summary.put("countedSessionsVariance", dayCash.countedSessionsVariance());
        summary.put("cashPosition", buildCashPosition(branchId, date, sessionIds,
                openingCash, tender.cash, cashDropIn, cashDropOut, true));

        Map<String, Object> result = new java.util.LinkedHashMap<>();
        result.put("eligible", eligible);
        result.put("pendingTerminals", pendingTerminals);
        result.put("sessions", sessions);
        result.put("invoices", invoices);
        result.put("date", date.toString());
        result.put("startSessionId", range.startSession != null ? range.startSession.getId() : null);
        result.put("endSessionId", range.endSession != null ? range.endSession.getId() : null);
        result.put("excludedSessionCount", range.excludedSessions.size());
        result.put("summary", summary);
        result.put("tender", tender.byBucket);
        result.put("tenderLines", tender.lines);
        result.put("voids", voids.postedVoids);
        result.put("cartRemovals", voids.cartRemovals);
        result.put("cashiers", buildCashierAttribution(invoices, tender));
        result.put("sessionInfo", sessions.stream().map(this::buildSessionInfo).toList());
        result.put("topSellingItems", buildTopSellingItems(invoices, 5));
        // Cashier-wise breakdown keyed by the session owner (not the payment processor), with
        // cash/card/credit split from the recorded Payment rows. Aggregating the tender rather
        // than the session's running counters is what makes this reconcile exactly with the
        // X/Z report tender block, whatever the sale's combined mode label happens to read.
        result.put("cashierWiseSummary", buildCashierWiseSummary(invoices, advances, sessions));
        result.put("isDayClosed", false);
        return result;
    }
    
    /** Backward-compatible overload — resolves the full-date range automatically and
     *  fails closed on any exclusion (there can be none without an override). */
    @Transactional
    public Map<String, Object> closeDay(Long branchId, LocalDate date) {
        return closeDay(branchId, date, null, null, false);
    }

    @Transactional
    public Map<String, Object> closeDay(Long branchId, LocalDate date, Long startSessionId, Long endSessionId,
                                        boolean acknowledgeExclusions) {
        // 1. Check lock/duplicate
        if (dayCloseRepository.existsByBranchIdAndCloseDate(branchId, date)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Business day has already been closed.");
        }

        // 2. Lock branch to prevent concurrent closes for the same branch
        Branch branch = branchRepository.findById(branchId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Branch not found"));

        // 3. Resolve the session range ONCE (server-side, never trusting a
        // client-cached range) and reuse it for every validation, the report
        // aggregation, and the reconciliation below — see ResolvedSessionRange.
        ResolvedSessionRange range = resolveSessionRange(branchId, date, startSessionId, endSessionId);

        // Global blockers scoped to the WHOLE business date, not just the resolved
        // range: an OPEN or SUSPENDED session left outside a narrowed range would
        // still block the next business date from opening (findUnclosedSessionsBeforeDate),
        // so it must block Day Close here regardless of range selection.
        long openCount = range.allSessionsForDate.stream().filter(s -> s.getStatus() == PosSessionStatus.OPEN).count();
        if (openCount > 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cannot close day: " + openCount + " POS sessions are still open.");
        }
        long suspendedCount = range.allSessionsForDate.stream().filter(s -> s.getStatus() == PosSessionStatus.SUSPENDED).count();
        if (suspendedCount > 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Cannot close day: " + suspendedCount + " POS session(s) are suspended. Resume and close them before proceeding.");
        }
        if (range.resolvedSessions.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cannot close day: no sessions found for this business date.");
        }
        // Every session inside the resolved range is guaranteed CLOSED at this point —
        // the two checks above already forbid OPEN/SUSPENDED anywhere on the date, and
        // those are the only other statuses.

        // Narrowed range excludes otherwise-eligible sessions for the date: block
        // unless the caller has explicitly confirmed (never silently drop sales/cash
        // from the audit trail).
        if (!range.excludedSessions.isEmpty() && !acknowledgeExclusions) {
            Map<String, Object> details = new LinkedHashMap<>();
            details.put("excludedSessionCount", range.excludedSessions.size());
            details.put("excludedSessions", range.excludedSessions.stream().map(this::buildSessionInfo).toList());
            throw new com.billbull.backend.exception.SessionRangeExclusionException(
                    "The selected session range excludes " + range.excludedSessions.size()
                            + " session(s) for business date " + date + ". Confirm to proceed.",
                    details);
        }

        List<PosSession> sessionsInRange = range.resolvedSessions;

        // Check for pending/failed payments for the resolved range's invoices
        List<Long> sessionIds = sessionsInRange.stream().map(PosSession::getId).toList();
        List<SalesInvoice> invoices = sessionIds.isEmpty() ? List.of() : invoiceRepo.findByBranchIdAndPosSessionIdInWithItems(branchId, sessionIds);
        long draftInvoices = invoices.stream().filter(i -> i.getStatus() == SalesInvoiceStatus.DRAFT).count();
        if (draftInvoices > 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cannot close day: " + draftInvoices + " Draft invoices exist.");
        }

        List<String> invoiceNumbers = invoices.stream().map(SalesInvoice::getInvoiceNumber).toList();
        if (!invoiceNumbers.isEmpty()) {
            List<Payment> payments = paymentRepository.findTenderForInvoices(invoiceNumbers);
            long pendingPayments = payments.stream().filter(p -> p.getStatus() == PaymentStatus.PENDING || p.getStatus() == PaymentStatus.FAILED).count();
            if (pendingPayments > 0) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cannot close day: Pending or failed payment transactions found.");
            }
        }

        // 4. Generate dynamic report from the same resolved range
        Map<String, Object> report = generateDynamicZReport(range);

        // 5. Cash Reconciliation Validation
        @SuppressWarnings("unchecked")
        Map<String, Object> summary = (Map<String, Object>) report.get("summary");
        BigDecimal totalSales = (BigDecimal) summary.getOrDefault("totalSales", BigDecimal.ZERO);
        BigDecimal cashSales = (BigDecimal) summary.getOrDefault("cashSales", BigDecimal.ZERO);
        BigDecimal cardSales = (BigDecimal) summary.getOrDefault("cardSales", BigDecimal.ZERO);
        BigDecimal creditSales = (BigDecimal) summary.getOrDefault("creditSales", BigDecimal.ZERO);
        BigDecimal otherSales = (BigDecimal) summary.getOrDefault("otherSales", BigDecimal.ZERO);
        
        BigDecimal bankTransferSales = (BigDecimal) summary.getOrDefault("bankTransferSales", BigDecimal.ZERO);
        BigDecimal walletSales = (BigDecimal) summary.getOrDefault("walletSales", BigDecimal.ZERO);
        BigDecimal voucherSales = (BigDecimal) summary.getOrDefault("voucherSales", BigDecimal.ZERO);
        BigDecimal onlineSales = bankTransferSales.add(walletSales).add(voucherSales);
        BigDecimal roundOff = (BigDecimal) summary.getOrDefault("roundOff", BigDecimal.ZERO);
        BigDecimal totalRefunds = (BigDecimal) summary.getOrDefault("totalRefunds", BigDecimal.ZERO);
        BigDecimal salesReturnTotal = (BigDecimal) summary.getOrDefault("salesReturnTotal", BigDecimal.ZERO);

        BigDecimal computedTotalSales = cashSales.add(cardSales).add(creditSales).add(otherSales);
        BigDecimal salesVariance = totalSales.subtract(computedTotalSales);
        if (salesVariance.abs().compareTo(new BigDecimal("0.05")) > 0) {
            Map<String, Object> breakdown = new java.util.LinkedHashMap<>();
            breakdown.put("expectedTotalSales", totalSales);
            breakdown.put("computedTotalSales", computedTotalSales);
            breakdown.put("variance", salesVariance);
            breakdown.put("cash", cashSales);
            breakdown.put("card", cardSales);
            breakdown.put("credit", creditSales);
            breakdown.put("online", onlineSales);
            breakdown.put("other", otherSales.subtract(onlineSales));
            breakdown.put("returns", salesReturnTotal);
            breakdown.put("refunds", totalRefunds);
            breakdown.put("rounding", roundOff);
            throw new com.billbull.backend.exception.ReconciliationException(
                "SALES",
                "Cannot close day: Sales reconciliation failed. Variance: " + salesVariance,
                breakdown);
        }

        BigDecimal openingCash = (BigDecimal) summary.getOrDefault("openingCash", BigDecimal.ZERO);
        // BUGFIX: this used to filter on movement types "PAY_IN"/"PAY_OUT", which no code
        // path ever writes (the only types ever recorded are DROP_IN/DROP_OUT — see
        // PosCashMovement/addCashMovement) — so cashPaidIn/cashPaidOut were always zero,
        // silently omitting every cash drop from this check and risking a false "CASH
        // reconciliation failed" on any day that had drawer drops. Also replaces the prior
        // per-session stream (each triggering a lazy load of PosSession.cashMovements, i.e.
        // one query per session) with a single grouped aggregate query.
        Map<String, BigDecimal> cashMovementTotals = sumCashMovementsByType(sessionIds);
        BigDecimal cashPaidIn = cashMovementTotals.getOrDefault("DROP_IN", BigDecimal.ZERO);
        BigDecimal cashPaidOut = cashMovementTotals.getOrDefault("DROP_OUT", BigDecimal.ZERO);
        // An integrity cross-check, and deliberately nothing more. It re-derives the day's
        // expected cash from the day's aggregates so it can be compared against the frozen
        // per-session values: a mismatch means data moved after a drawer was counted, which is
        // worth refusing to close on. It is not a reported figure and no report reads it — the
        // day's Expected Cash comes from the frozen snapshots via the reconciliation authority.
        BigDecimal expectedCashComputed = openingCash.add(cashSales).add(cashPaidIn).subtract(cashPaidOut);

        // The day's REPORTED reconciliation: the authority's aggregation of the frozen
        // per-session snapshots. This is what the day is closed against.
        PosDayCashReconciliation dayCash = cashReconciliationService.summarizeDay(sessionsInRange);
        BigDecimal expectedCashSessions = dayCash.expectedCash();

        // The pre-existing derivation is kept ONLY as an integrity cross-check. It compares one
        // derivation of EXPECTED against another and can detect data that moved after a drawer
        // was counted — which is worth blocking on — but it can never detect that the money is
        // not there, so it is no longer any report's source of Expected Cash.
        BigDecimal integrityDrift = expectedCashComputed.subtract(expectedCashSessions);
        if (integrityDrift.abs().compareTo(new BigDecimal("0.05")) > 0) {
            BigDecimal cashVariance = integrityDrift;
            Map<String, Object> breakdown = new java.util.LinkedHashMap<>();
            breakdown.put("openingCash", openingCash);
            breakdown.put("cashSales", cashSales);
            breakdown.put("cashPaidIn", cashPaidIn);
            breakdown.put("cashPaidOut", cashPaidOut);
            breakdown.put("expectedCashComputed", expectedCashComputed);
            breakdown.put("expectedCashSessions", expectedCashSessions);
            breakdown.put("variance", cashVariance);
            throw new com.billbull.backend.exception.ReconciliationException(
                "CASH",
                "Cannot close day: Cash reconciliation failed. Variance: " + cashVariance,
                breakdown);
        }

        report.put("isDayClosed", true);
        // The physical reconciliation the day never had: counted against expected, both summed
        // from what each drawer was actually closed with.
        report.put("cashReconciliation", dayCash.toMap());
        
        // 6. Save Snapshot
        PosDayClose dayClose = new PosDayClose();
        dayClose.setBranchId(branchId);
        dayClose.setCloseDate(date);
        dayClose.setClosedBy(currentUser());
        dayClose.setClosedByDisplayName(resolveDisplayName(dayClose.getClosedBy()));
        dayClose.setClosedAt(businessDayWindowService.clock().now());
        dayClose.setBranchName(branch.getName());
        dayClose.setBranchCode(branch.getCode());
        dayClose.setReportVersion("1.0");
        String zReportNumber = reportNumberService.nextReportNumber("ZR", branchId, date);
        dayClose.setReportNumber(zReportNumber);
        report.put("reportNumber", zReportNumber);

        dayClose.setGrossSales((BigDecimal) summary.getOrDefault("grossSales", BigDecimal.ZERO));
        dayClose.setNetSales((BigDecimal) summary.getOrDefault("netSalesExTax", BigDecimal.ZERO));
        dayClose.setTotalDiscount((BigDecimal) summary.getOrDefault("totalDiscount", BigDecimal.ZERO));
        dayClose.setTotalVat((BigDecimal) summary.getOrDefault("totalTax", BigDecimal.ZERO));
        dayClose.setCashSales(cashSales);
        dayClose.setCardSales(cardSales);
        dayClose.setCreditSales(creditSales);
        dayClose.setOtherSales(otherSales);
        dayClose.setExpectedCash(expectedCashSessions);
        // Structured columns, not JSON: a reconciliation figure that can only be reached by
        // parsing a report blob cannot be queried, indexed or trusted by anything downstream.
        dayClose.setCountedCash(dayCash.countedCash());
        dayClose.setCashVariance(dayCash.cashVariance());
        dayClose.setVarianceStatus(dayCash.status().name());
        dayClose.setSessionsWithVariance(dayCash.sessionsWithVariance());
        dayClose.setUncountedSessionCount(dayCash.uncountedSessionCount());
        dayClose.setStatus(com.billbull.backend.pos.dayclose.PosDayCloseStatus.GENERATED);
        dayClose.setTotalInvoices((Integer) summary.getOrDefault("invoiceCount", 0));
        dayClose.setTotalSessions((Integer) summary.getOrDefault("sessionCount", 0));
        dayClose.setStartSessionId(range.startSession != null ? range.startSession.getId() : null);
        dayClose.setEndSessionId(range.endSession != null ? range.endSession.getId() : null);

        try {
            dayClose.setzReportJson(objectMapper.writeValueAsString(report));
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to serialize Z-Report");
        }

        PosDayClose savedDayClose = dayCloseRepository.save(dayClose);

        // Stamp membership on every included session so it's directly queryable
        // (PosSession.dayCloseId) instead of only reconstructable by parsing the
        // day close's zReportJson snapshot.
        for (PosSession s : sessionsInRange) {
            s.setDayCloseId(savedDayClose.getId());
        }
        repo.saveAll(sessionsInRange);

        // Advance the business date by exactly one day — never to LocalDate.now() (see
        // PosBusinessDateService for why: a late catch-up close must not skip a date).
        // Note: this is the POS *operating* business date, a separate concept from the
        // session-driven "pending Day Close" date PosPendingDayCloseResolver computes —
        // see that class's javadoc for why the two must not be merged.
        businessDateService.advanceBusinessDate(branchId, currentUser());

        return report;
    }

    /** Advances the Business Date past a calendar date on which the branch never
     *  traded. @deprecated OBSOLETE — the Skip Non-Trading Day workflow is retired in
     *  favor of session-driven Day Close resolution ({@code PosPendingDayCloseResolver}):
     *  a calendar date with no POS sessions is simply never surfaced as pending, so
     *  nothing needs to be explicitly skipped anymore. Kept only so the deprecated
     *  {@code POST /skip-day} endpoint has something to call while it still exists for
     *  older clients; always returns 410 Gone rather than writing a new marker row. */
    @Deprecated
    @Transactional
    public Map<String, Object> skipBusinessDate(Long branchId, LocalDate date, String reason) {
        throw new ResponseStatusException(HttpStatus.GONE,
                "The Skip Non-Trading Day workflow has been retired. Calendar dates with no POS "
                        + "sessions are now automatically ignored by Day Close — no action is required. "
                        + "See GET /api/pos/sessions/day-status (pendingDayCloseDate/hasPendingDayClose).");
    }

    /** Returns/refund figures for a single business day + branch, sourced from the Sales
     *  Return module (a post-sale transaction unrelated to any specific POS session). */
    private static final class ReturnsSummary {
        int totalCount;
        BigDecimal totalAmount = BigDecimal.ZERO;
        int creditNoteCount;
        BigDecimal creditNoteTotal = BigDecimal.ZERO;
        int refundCount;
        BigDecimal refundTotal = BigDecimal.ZERO;
        int exchangeCount;
        BigDecimal exchangeTotal = BigDecimal.ZERO;
        int totalQtyReturned;
    }

    private ReturnsSummary buildReturnsSummary(Long branchId, LocalDate date) {
        return aggregateReturns(returnRepository.findByReturnDateAndBranchWithItems(date, branchId));
    }

    /** Same Sales Return source as {@link #buildReturnsSummary}, but restricted to returns
     *  linked to invoices belonging to THIS session — required so the X-Report never picks
     *  up a same-day return posted against another session (different device/terminal, or
     *  a different cashier's concurrent session) sharing the same branch+date. */
    private ReturnsSummary buildSessionReturnsSummary(Long branchId, LocalDate date, List<SalesInvoice> sessionInvoices) {
        java.util.Set<String> sessionInvoiceNumbers = sessionInvoices.stream()
                .map(SalesInvoice::getInvoiceNumber)
                .filter(java.util.Objects::nonNull)
                .collect(java.util.stream.Collectors.toSet());
        List<SalesReturn> returns = returnRepository.findByReturnDateAndBranchWithItems(date, branchId).stream()
                .filter(r -> sessionInvoiceNumbers.contains(r.getLinkedInvoice()))
                .toList();
        return aggregateReturns(returns);
    }

    private ReturnsSummary aggregateReturns(List<SalesReturn> returns) {
        ReturnsSummary rs = new ReturnsSummary();
        for (SalesReturn r : returns) {
            if (r.getStatus() != SalesReturnStatus.APPROVED) continue;
            BigDecimal amount = nz(r.getTotalAmount());
            rs.totalCount++;
            rs.totalAmount = rs.totalAmount.add(amount);
            String action = r.getReturnAction() != null ? r.getReturnAction() : "";
            if ("Credit Note".equalsIgnoreCase(action)) {
                rs.creditNoteCount++;
                rs.creditNoteTotal = rs.creditNoteTotal.add(amount);
            } else if ("Replacement".equalsIgnoreCase(action)) {
                rs.exchangeCount++;
                rs.exchangeTotal = rs.exchangeTotal.add(amount);
            } else if ("Refund".equalsIgnoreCase(action)) {
                rs.refundCount++;
                rs.refundTotal = rs.refundTotal.add(amount);
            }
            if (r.getItems() != null) {
                for (SalesReturnItem it : r.getItems()) {
                    rs.totalQtyReturned += it.getReturnQty() != null ? it.getReturnQty() : 0;
                }
            }
        }
        return rs;
    }

    // ── Consolidated Cash Position (additive — never feeds Expected Cash in Drawer) ───
    //
    // A second, purely informational cash summary alongside the existing till-count
    // reconciliation (PosCashReconciliationService/PosSession.expectedCash), which must stay
    // untouched — see the architecture review. This section widens the picture to
    // include back-office cash movements that never sit in the physical drawer
    // (Customer Receipts, Customer Advances) and, where the data actually supports it,
    // cash-only Cash Drop/Cash Out detail sourced via a single batch query.
    //
    // Cash Refunds/Returns are deliberately NOT included: SalesReturn has no
    // payment-mode field today, so a "cash refund" total cannot be computed without
    // misclassifying every refund (cash+card+other) as cash. cashRefundsSupported=false
    // flags this to the caller/frontend rather than silently reporting a wrong number.

    private static final class ReceiptsAndAdvances {
        BigDecimal receiptsTotal = BigDecimal.ZERO;
        BigDecimal advancesTotal = BigDecimal.ZERO;
        final List<Map<String, Object>> receiptRows = new java.util.ArrayList<>();
        final List<Map<String, Object>> advanceRows = new java.util.ArrayList<>();
    }

    /** Customer Receipts (ReceiptPurpose CASH_SALE/AGAINST_INVOICE) and Customer Advances
     *  (ReceiptPurpose ADVANCE_RECEIVED), cash-only, for a branch + business date. These
     *  are general back-office accounting vouchers with no PosSession/terminal/cashier
     *  link today, so — per the architecture review — they are only ever branch+date
     *  scoped (Z-Report), never session-scoped (X-Report). */
    private ReceiptsAndAdvances buildReceiptsAndAdvances(Long branchId, LocalDate date, List<Long> sessionIds) {
        ReceiptsAndAdvances result = new ReceiptsAndAdvances();
        if (branchId == null || date == null) return result;
        int slReceipt = 1;
        int slAdvance = 1;

        // ── Anti-double-count guard ──────────────────────────────────────────────────────
        // These rows are branch+date scoped, so they sweep up every cash receipt and advance
        // for the day — including the ones collected THROUGH the reported POS sessions, which
        // Cash Tender Collected (cashSales) already contains. Adding both to netCashPosition
        // counts the same physical notes twice.
        //
        // This was dormant while no receipt/advance carried a posSessionId. Attributing POS
        // credit receipts and POS advances to their collecting drawer is what makes it real,
        // so the exclusion lands in the same change.
        //
        // Two shapes to exclude, because the two flows record the session differently:
        //   • advances  — the voucher itself carries posSessionId (set by receiveAdvance)
        //   • receipts  — the session lives on the Payment; its generated voucher is reached
        //                 through Payment.receiptVoucherRecordId
        java.util.Set<Long> tenderedVoucherIds = new java.util.HashSet<>();
        if (sessionIds != null && !sessionIds.isEmpty()) {
            for (Payment p : paymentRepository.findTenderForSessions(sessionIds)) {
                if (p.getReceiptVoucherRecordId() != null) {
                    tenderedVoucherIds.add(p.getReceiptVoucherRecordId());
                }
            }
        }
        java.util.Set<Long> reportedSessionIds = sessionIds == null
                ? java.util.Set.of() : new java.util.HashSet<>(sessionIds);

        List<ReceiptVoucher> receipts = new java.util.ArrayList<>();
        receipts.addAll(receiptVoucherRepository.findCompletedByBranchAndDateAndPurpose(branchId, date, ReceiptPurpose.CASH_SALE));
        receipts.addAll(receiptVoucherRepository.findCompletedByBranchAndDateAndPurpose(branchId, date, ReceiptPurpose.AGAINST_INVOICE));
        if (!receipts.isEmpty()) {
            receipts.forEach(entityManager::detach);
            receipts = effectiveCorrectionViewService.resolveOverlays(
                    com.billbull.backend.pos.admin.CorrectionTargetType.RECEIPT_VOUCHER, receipts, ReceiptVoucher::getId);
        }
        
        for (ReceiptVoucher rv : receipts) {
            if (!isCashMode(rv.getPaymentMode())) continue;
            // Already inside cashSales via its Payment row — see the anti-double-count note.
            if (rv.getId() != null && tenderedVoucherIds.contains(rv.getId())) continue;
            BigDecimal amount = nz(rv.getAmount());
            result.receiptsTotal = result.receiptsTotal.add(amount);
            Map<String, Object> row = new java.util.LinkedHashMap<>();
            row.put("slNo", slReceipt++);
            row.put("customerName", rv.getMemberName());
            row.put("receivedBy", rv.getCreatedBy());
            row.put("receivedAmount", amount);
            result.receiptRows.add(row);
        }

        List<ReceiptVoucher> advances = receiptVoucherRepository.findCompletedByBranchAndDateAndPurpose(
                branchId, date, ReceiptPurpose.ADVANCE_RECEIVED);
        if (!advances.isEmpty()) {
            advances.forEach(entityManager::detach);
            advances = effectiveCorrectionViewService.resolveOverlays(
                    com.billbull.backend.pos.admin.CorrectionTargetType.RECEIPT_VOUCHER, advances, ReceiptVoucher::getId);
        }
        for (ReceiptVoucher rv : advances) {
            if (!isCashMode(rv.getPaymentMode())) continue;
            // Already inside cashSales via aggregateTender's advance leg.
            if (rv.getPosSessionId() != null && reportedSessionIds.contains(rv.getPosSessionId())) continue;
            if (rv.getId() != null && tenderedVoucherIds.contains(rv.getId())) continue;
            BigDecimal amount = nz(rv.getAmount());
            result.advancesTotal = result.advancesTotal.add(amount);
            Map<String, Object> row = new java.util.LinkedHashMap<>();
            row.put("slNo", slAdvance++);
            row.put("customerName", rv.getMemberName());
            row.put("paidBy", rv.getCreatedBy());
            row.put("paidAmount", amount);
            result.advanceRows.add(row);
        }
        return result;
    }

    /** Builds the "Consolidated Cash Position" additive summary block. {@code
     *  includeBackOfficeReceipts} gates Customer Receipts/Advances — true only for
     *  Z-Report (branch + business date scoped); X-Report omits them until POS-session
     *  linkage exists for ReceiptVoucher (see architecture review §3). Cash Drop/Cash Out
     *  detail is always included since PosCashMovement is already session-scoped. */
    private Map<String, Object> buildCashPosition(Long branchId, LocalDate date, List<Long> sessionIds,
                                                   BigDecimal openingCash, BigDecimal cashSales,
                                                   BigDecimal cashDropIn, BigDecimal cashDropOut,
                                                   boolean includeBackOfficeReceipts) {
        Map<String, Object> result = new java.util.LinkedHashMap<>();

        List<PosCashMovement> movements = (sessionIds == null || sessionIds.isEmpty())
                ? List.of()
                : cashMovementRepository.findByPosSession_IdInOrderByPerformedAtAsc(sessionIds)
                        .stream().map(PosCashMovement::detachedCopy).toList();
        if (!movements.isEmpty()) {
            movements = effectiveCorrectionViewService.resolveOverlays(
                    com.billbull.backend.pos.admin.CorrectionTargetType.CASH_MOVEMENT, movements, PosCashMovement::getId);
        }
        List<Map<String, Object>> cashDropRows = new java.util.ArrayList<>();
        int sl = 1;
        for (PosCashMovement m : movements) {
            Map<String, Object> row = new java.util.LinkedHashMap<>();
            row.put("slNo", sl++);
            row.put("type", m.getMovementType());
            row.put("amount", nz(m.getAmount()));
            row.put("description", m.getDescription());
            row.put("performedBy", m.getPerformedBy());
            row.put("performedAt", m.getPerformedAt());
            // Detail view always shows voided rows (with reason) for auditability — only the
            // summed cashDropIn/cashDropOut totals passed into this method exclude them.
            row.put("status", m.getStatus());
            row.put("voidReason", m.getVoidReason());
            cashDropRows.add(row);
        }
        result.put("cashDropRows", cashDropRows);
        result.put("cashDropTotal", cashDropIn.subtract(cashDropOut));

        BigDecimal customerReceiptsTotal = BigDecimal.ZERO;
        BigDecimal customerAdvancesTotal = BigDecimal.ZERO;
        List<Map<String, Object>> receiptRows = List.of();
        List<Map<String, Object>> advanceRows = List.of();
        if (includeBackOfficeReceipts) {
            ReceiptsAndAdvances ra = buildReceiptsAndAdvances(branchId, date, sessionIds);
            customerReceiptsTotal = ra.receiptsTotal;
            customerAdvancesTotal = ra.advancesTotal;
            receiptRows = ra.receiptRows;
            advanceRows = ra.advanceRows;
        }
        result.put("customerReceiptRows", receiptRows);
        result.put("customerReceiptsTotal", customerReceiptsTotal);
        result.put("customerAdvanceRows", advanceRows);
        result.put("customerAdvancesTotal", customerAdvancesTotal);

        // netCashPosition removed. It added back-office receipts and advances onto a drawer
        // figure, producing a number that was neither drawer cash nor company cash and could be
        // reconciled against nothing. Keeping it meant maintaining exclusion rules forever so it
        // would not double-count every newly session-attributed cash source. The information it
        // was built from survives above, separated rather than summed.
        //
        // POS drawer reconciliation lives in the reconciliation service; these rows are context,
        // never inputs to Expected Cash, Counted Cash or variance.
        result.put("scope", "BACK_OFFICE_NON_DRAWER");
        result.put("openingCash", nz(openingCash));
        result.put("cashSales", cashSales);
        result.put("cashDropIn", cashDropIn);
        result.put("cashDropOut", cashDropOut);
        return result;
    }

    /** Top-selling items by quantity across the given invoices (non-voided lines only). */
    private List<Map<String, Object>> buildTopSellingItems(List<SalesInvoice> invoices, int limit) {
        Map<String, Integer> qty = new java.util.LinkedHashMap<>();
        Map<String, BigDecimal> amount = new java.util.LinkedHashMap<>();
        Map<String, String> nameByCode = new java.util.LinkedHashMap<>();
        for (SalesInvoice inv : invoices) {
            if (inv.getItems() == null) continue;
            for (SalesInvoiceItem it : inv.getItems()) {
                if (it.isVoided()) continue;
                String code = it.getItemCode() != null ? it.getItemCode() : "—";
                int q = it.getQuantity() != null ? it.getQuantity() : 0;
                BigDecimal gross = it.getGrossAmount() != null
                        ? it.getGrossAmount()
                        : nz(it.getPrice()).multiply(BigDecimal.valueOf(q));
                qty.merge(code, q, Integer::sum);
                amount.merge(code, gross, BigDecimal::add);
                nameByCode.putIfAbsent(code, it.getItemName());
            }
        }
        return qty.entrySet().stream()
                .sorted((a, b) -> b.getValue() - a.getValue())
                .limit(limit)
                .map(e -> {
                    Map<String, Object> row = new java.util.LinkedHashMap<>();
                    row.put("itemCode", e.getKey());
                    row.put("itemName", nameByCode.get(e.getKey()));
                    row.put("quantity", e.getValue());
                    row.put("amount", amount.getOrDefault(e.getKey(), BigDecimal.ZERO));
                    return row;
                })
                .toList();
    }
// ... existing code ...

    private List<Map<String, Object>> buildCashierWiseSummary(List<SalesInvoice> invoices, List<ReceiptVoucher> advances, List<PosSession> sessions) {
        Map<Long, String> cashierBySessionId = new java.util.HashMap<>();
        // Inverse of cashierBySessionId: every session a given cashier opened today, so tender
        // (keyed on Payment.posSessionId) can be aggregated per cashier the same way invoices
        // (keyed on SalesInvoice.posSessionId, via cashierBySessionId above) already are.
        Map<String, List<Long>> sessionIdsByCashier = new java.util.LinkedHashMap<>();
        for (PosSession s : sessions) {
            String cashier = s.getOpenedBy() != null ? s.getOpenedBy() : "—";
            cashierBySessionId.put(s.getId(), cashier);
            sessionIdsByCashier.computeIfAbsent(cashier, k -> new java.util.ArrayList<>()).add(s.getId());
        }
        Map<String, List<SalesInvoice>> byCashier = new java.util.LinkedHashMap<>();
        for (SalesInvoice inv : invoices) {
            if (inv.getStatus() == SalesInvoiceStatus.CANCELLED || inv.getStatus() == SalesInvoiceStatus.DRAFT) continue;
            String cashier = inv.getPosSessionId() != null
                    ? cashierBySessionId.getOrDefault(inv.getPosSessionId(), "—")
                    : "—";
            byCashier.computeIfAbsent(cashier, k -> new java.util.ArrayList<>()).add(inv);
        }
        Map<String, List<ReceiptVoucher>> advByCashier = new java.util.LinkedHashMap<>();
        for (ReceiptVoucher adv : advances) {
            String cashier = adv.getPosSessionId() != null
                    ? cashierBySessionId.getOrDefault(adv.getPosSessionId(), "—")
                    : "—";
            advByCashier.computeIfAbsent(cashier, k -> new java.util.ArrayList<>()).add(adv);
        }
        
        java.util.Set<String> allCashiers = new java.util.HashSet<>(byCashier.keySet());
        allCashiers.addAll(advByCashier.keySet());
        
        List<Map<String, Object>> rows = new java.util.ArrayList<>();
        for (String cashier : allCashiers) {
            List<SalesInvoice> cashierInvoices = byCashier.getOrDefault(cashier, new java.util.ArrayList<>());
            List<ReceiptVoucher> cashierAdvances = advByCashier.getOrDefault(cashier, new java.util.ArrayList<>());
            List<Long> cashierSessionIds = sessionIdsByCashier.getOrDefault(cashier, List.of());
            TenderTotals t = aggregateTender(cashierAdvances, cashierSessionIds);
            BigDecimal netSales = cashierInvoices.stream()
                    .map(i -> nz(i.getInvoiceTotal())).reduce(BigDecimal.ZERO, BigDecimal::add);
            Map<String, Object> row = new java.util.LinkedHashMap<>();
            row.put("cashier", cashier);
            row.put("cashierDisplayName", "—".equals(cashier) ? cashier : resolveDisplayName(cashier));
            row.put("invoiceCount", cashierInvoices.size());
            row.put("netSales", netSales);
            row.put("cash", t.byBucket.getOrDefault("cash", BigDecimal.ZERO));
            row.put("card", t.byBucket.getOrDefault("card", BigDecimal.ZERO));
            row.put("credit", t.byBucket.getOrDefault("credit", BigDecimal.ZERO));
            rows.add(row);
        }
        return rows;
    }

    // ── Report computation helpers (shared by X and Z) ─────────────────────────

    /** Resolves the report "Device" and "Shift" dimensions for a session.
     *  Device comes from the registered {@link PosTerminal} (terminalName / deviceInfo)
     *  keyed by the session's terminalId — no synthetic field. Shift is derived from
     *  the open time band (Morning / Afternoon / Evening / Night). */
    private Map<String, Object> buildSessionInfo(PosSession s) {
        Map<String, Object> info = new java.util.LinkedHashMap<>();
        String deviceName = null, deviceInfo = null, terminalName = null;
        if (s.getTerminalId() != null && !s.getTerminalId().isBlank()) {
            PosTerminal term = terminalHostingService.resolveHostingTerminal(s).orElse(null);
            if (term != null) {
                terminalName = term.getTerminalName();
                deviceName = term.getTerminalName() != null ? term.getTerminalName() : term.getTerminalId();
                deviceInfo = term.getDeviceInfo();
            }
        }
        info.put("sessionNo", s.getId() != null ? "SESS-" + String.format("%06d", s.getId()) : null);
        info.put("sessionId", s.getId());
        info.put("status", s.getStatus() != null ? s.getStatus().name() : null);
        info.put("terminalId", s.getTerminalId());
        info.put("terminalName", terminalName);
        info.put("counter", s.getCounterName());
        info.put("cashier", s.getOpenedBy());
        info.put("cashierDisplayName", s.getOpenedByDisplayName() != null
                ? s.getOpenedByDisplayName() : resolveDisplayName(s.getOpenedBy()));
        info.put("closedBy", s.getClosedBy());
        info.put("closedByDisplayName", s.getClosedByDisplayName() != null
                ? s.getClosedByDisplayName() : resolveDisplayName(s.getClosedBy()));
        info.put("branch", s.getBranchName());
        // The Business Day this session belongs to — its immutable tradingDate, falling back
        // to the legacy sessionDate bucket. Resolved through the same helper the continuation
        // gate uses so the session-specific X-Report can render the session's own Business
        // Date instead of whatever day the screen happens to be opened on.
        info.put("businessDate", com.billbull.backend.pos.businessdate.BusinessDayContinuationGate
                .sessionBusinessDay(s));
        info.put("device", deviceName != null ? deviceName : s.getTerminalId());
        info.put("deviceInfo", deviceInfo);
        info.put("shift", deriveShift(s.getOpenedAt()));
        info.put("openedAt", s.getOpenedAt() != null ? s.getOpenedAt().atZone(java.time.ZoneId.systemDefault()) : null);
        info.put("closedAt", s.getClosedAt() != null ? s.getClosedAt().atZone(java.time.ZoneId.systemDefault()) : null);
        info.put("durationSeconds", s.getDurationSeconds());
        info.put("openingCash", nz(s.getOpeningCash()));

        // The frozen reconciliation this drawer was actually closed against, correction
        // overlays included. Reported as-is: closingCash was previously nz()-coalesced, which
        // turned every never-counted session into one that had been counted and found empty --
        // the exact NOT_COUNTED / COUNTED_ZERO conflation the count model exists to prevent.
        // Nulls travel intact so a report can render "—" rather than a fabricated 0.00.
        PosCashReconciliationResult frozen = cashReconciliationService.frozen(s);
        info.put("closingCash", frozen.countedCash());
        info.put("countedCash", frozen.countedCash());
        info.put("expectedCash", frozen.expectedCash());
        info.put("variance", frozen.variance());
        info.put("reconciliationStatus", frozen.status());
        info.put("countedAt", frozen.countedAt());
        info.put("closingDenominationsJson", effectiveClosingDenominationsJson(s));
        info.put("cardBatchNo", s.getCardBatchNo());
        info.put("cardSettlementVerified", Boolean.TRUE.equals(s.getCardSettlementVerified()));
        info.put("cardClosingCash", nz(s.getCardClosingCash()));
        info.put("cardDifference", nz(s.getCardDifference()));
        info.put("closingCashierName", s.getClosingCashierName());
        info.put("closingSupervisorName", s.getClosingSupervisorName());
        info.put("closingRemarks", s.getClosingRemarks());
        info.put("varianceRemarks", s.getNotes());
        info.put("totalSales", nz(s.getTotalSales()));
        info.put("invoiceCount", s.getInvoiceCount() != null ? s.getInvoiceCount() : 0);
        return info;
    }

    /** Overlays an applied denomination correction (Enterprise Console > POS Administration)
     *  onto the session's closing count, mirroring how receipts/advances/cash movements are
     *  already overlaid elsewhere in this class via {@link #effectiveCorrectionViewService}.
     *  Falls back to the raw {@code closingDenominationsJson} for open sessions or when no
     *  correction has been applied — denomination corrections only ever target CLOSED sessions. */
    private String effectiveClosingDenominationsJson(PosSession s) {
        if (s.getId() == null || s.getStatus() != PosSessionStatus.CLOSED) {
            return s.getClosingDenominationsJson();
        }
        Map<String, Object> effective = effectiveCorrectionViewService.getEffectiveView(
                com.billbull.backend.pos.admin.CorrectionTargetType.POS_SESSION, s.getId());
        if (!Boolean.TRUE.equals(effective.get("corrected"))) {
            return s.getClosingDenominationsJson();
        }
        try {
            return objectMapper.writeValueAsString(effective.get("effective"));
        } catch (Exception e) {
            return s.getClosingDenominationsJson();
        }
    }

    /** Maps a session-open time to a human shift label. */
    private static String deriveShift(LocalDateTime openedAt) {
        if (openedAt == null) return "—";
        int h = openedAt.getHour();
        if (h >= 5 && h < 12) return "Morning";
        if (h >= 12 && h < 17) return "Afternoon";
        if (h >= 17 && h < 22) return "Evening";
        return "Night";
    }

    /** Maps a free-text payment mode to a canonical report bucket. Delegates to the shared
     *  {@link TenderBucket} so the X/Z reports, the sales reports and the dashboards all agree
     *  on which column a given tender lands in. */
    private static String tenderBucket(String mode) {
        return TenderBucket.of(mode);
    }

    /** Holds tender (actual collected) split by canonical bucket plus raw lines. */
    private static final class TenderTotals {
        final Map<String, BigDecimal> byBucket = new java.util.LinkedHashMap<>();
        final Map<String, Long> countByBucket = new java.util.LinkedHashMap<>();
        // Card-only breakdown by network/brand (raw paymentMode label, e.g. "Visa", "Mastercard", "Card").
        final Map<String, BigDecimal> cardByType = new java.util.LinkedHashMap<>();
        final Map<String, Long> cardCountByType = new java.util.LinkedHashMap<>();
        final List<Map<String, Object>> lines = new java.util.ArrayList<>();
        BigDecimal cash = BigDecimal.ZERO;
        BigDecimal card = BigDecimal.ZERO;
        BigDecimal credit = BigDecimal.ZERO;
        BigDecimal total = BigDecimal.ZERO;
    }

    /** Normalizes a raw card tender label into a display card-network name
     *  (e.g. "VISA DEBIT" -&gt; "Visa"). Delegates to the shared {@link TenderBucket}. */
    private static String cardTypeLabel(String rawMode) {
        return TenderBucket.cardNetwork(rawMode);
    }

    /** Aggregates actual RECEIVED tender COLLECTED THROUGH the given POS session(s), from
     *  sales_payments. This is the authoritative "Total Paid" — per-leg payment rows, not
     *  invoice value, and keyed on {@code Payment.posSessionId} (the session that was open
     *  when the tender was actually collected), NOT on the session the underlying invoice
     *  was created in. This is what lets a delivery order created in one session but paid in
     *  a later one attribute its cash to the session that actually collected it.
     *  Also includes Customer Advances received during the session. */
    private TenderTotals aggregateTender(List<ReceiptVoucher> advances, List<Long> sessionIds) {
        TenderTotals t = new TenderTotals();

        if (sessionIds != null && !sessionIds.isEmpty()) {

        for (Object[] row : paymentRepository.sumTenderByModeForSessions(sessionIds)) {
            String rawMode = (String) row[0];
            BigDecimal amount = row[1] != null ? (BigDecimal) row[1] : BigDecimal.ZERO;
            long count = row[2] != null ? ((Number) row[2]).longValue() : 0L;
            String bucket = tenderBucket(rawMode);
            t.byBucket.merge(bucket, amount, BigDecimal::add);
            t.countByBucket.merge(bucket, count, Long::sum);
            t.total = t.total.add(amount);
            if ("cash".equals(bucket)) t.cash = t.cash.add(amount);
            else if ("card".equals(bucket)) {
                t.card = t.card.add(amount);
                String cardType = cardTypeLabel(rawMode);
                t.cardByType.merge(cardType, amount, BigDecimal::add);
                t.cardCountByType.merge(cardType, count, Long::sum);
            }
            else if ("credit".equals(bucket)) t.credit = t.credit.add(amount);
        }
        for (Payment p : paymentRepository.findTenderForSessions(sessionIds)) {
            Map<String, Object> line = new java.util.LinkedHashMap<>();
            line.put("paymentNumber", p.getPaymentNumber());
            line.put("invoiceNumber", p.getLinkedInvoice());
            line.put("mode", p.getPaymentMode());
            line.put("bucket", tenderBucket(p.getPaymentMode()));
            line.put("amount", nz(p.getAmount()));
            line.put("reference", p.getReferenceNumber());
            line.put("cashier", p.getCreatedBy());
            line.put("date", p.getPaymentDate());
            t.lines.add(line);
        }
        }

        if (advances != null) {
            for (ReceiptVoucher p : advances) {
                if (!ReceiptPurpose.ADVANCE_RECEIVED.equals(p.getPurpose())) continue;
                String rawMode = p.getPaymentMode();
                BigDecimal amount = p.getAmount() != null ? p.getAmount() : BigDecimal.ZERO;
                String bucket = tenderBucket(rawMode);
                t.byBucket.merge(bucket, amount, BigDecimal::add);
                t.countByBucket.merge(bucket, 1L, Long::sum);
                t.total = t.total.add(amount);
                
                if ("cash".equals(bucket)) t.cash = t.cash.add(amount);
                else if ("card".equals(bucket)) {
                    t.card = t.card.add(amount);
                    String cardType = cardTypeLabel(rawMode);
                    t.cardByType.merge(cardType, amount, BigDecimal::add);
                    t.cardCountByType.merge(cardType, 1L, Long::sum);
                }
                else if ("credit".equals(bucket)) t.credit = t.credit.add(amount);
                
                Map<String, Object> line = new java.util.LinkedHashMap<>();
                line.put("paymentNumber", p.getVoucherId());
                line.put("invoiceNumber", "ADVANCE");
                line.put("mode", p.getPaymentMode());
                line.put("bucket", bucket);
                line.put("amount", amount);
                line.put("reference", p.getReference());
                line.put("cashier", p.getPreparedBy());
                line.put("date", p.getDate() != null ? p.getDate().atStartOfDay() : null);
                t.lines.add(line);
            }
        }
        
        return t;
    }

    /** Aggregates actual refunded tender (paymentType = MADE) COLLECTED THROUGH the given
     *  POS session(s) — mirrors {@link #aggregateTender}, used to attribute "Card Refunds"
     *  to real refund-leg payment rows instead of the unrelated item-void counter. Keyed on
     *  {@code Payment.posSessionId}, same rationale as {@link #aggregateTender}. */
    private TenderTotals aggregateRefunds(List<Long> sessionIds) {
        TenderTotals t = new TenderTotals();
        if (sessionIds == null || sessionIds.isEmpty()) return t;

        for (Object[] row : paymentRepository.sumRefundByModeForSessions(sessionIds)) {
            String rawMode = (String) row[0];
            BigDecimal amount = row[1] != null ? (BigDecimal) row[1] : BigDecimal.ZERO;
            long count = row[2] != null ? ((Number) row[2]).longValue() : 0L;
            String bucket = tenderBucket(rawMode);
            t.byBucket.merge(bucket, amount, BigDecimal::add);
            t.countByBucket.merge(bucket, count, Long::sum);
            t.total = t.total.add(amount);
            if ("card".equals(bucket)) {
                String cardType = cardTypeLabel(rawMode);
                t.cardByType.merge(cardType, amount, BigDecimal::add);
                t.cardCountByType.merge(cardType, count, Long::sum);
            }
        }
        return t;
    }

    /** Computes the shared sales/tax/discount/item summary block for a set of invoices.
     *  Excludes voided lines from every monetary and quantity figure. */
    private Map<String, Object> buildSalesSummary(List<SalesInvoice> invoices, TenderTotals tender) {
        BigDecimal totalSales = BigDecimal.ZERO;       // invoice total incl. VAT, net of voids
        BigDecimal totalTax = BigDecimal.ZERO;
        BigDecimal grossSales = BigDecimal.ZERO;       // before any discount (line gross sum)
        BigDecimal lineDiscount = BigDecimal.ZERO;     // Σ per-line discount value
        BigDecimal billDiscount = BigDecimal.ZERO;     // Σ invoice-level discount
        BigDecimal deliveryCharge = BigDecimal.ZERO;
        BigDecimal roundOff = BigDecimal.ZERO;
        int qtySold = 0;
        int lineCount = 0;
        int billDiscountCount = 0;
        int lineDiscountCount = 0;
        BigDecimal highest = null, lowest = null;
        // Sales attributed to Credit = each invoice's own outstanding balance (invoiceTotal
        // minus whatever was actually collected/synced via recordPayment+ReceiptVoucher).
        // A fully-settled cash/card/online sale has balance=0 here; an unpaid or
        // partially-paid Credit sale has a positive balance. Sourced from the invoice
        // itself rather than the Payment/tender ledger, because a $0-collected Credit
        // sale never creates a Payment row at all (see aggregateTender/tenderBucket,
        // which only ever see ACTUAL collected tender and can't represent "sold on credit").
        BigDecimal creditSales = BigDecimal.ZERO;
        long creditInvoiceCount = 0;

        for (SalesInvoice inv : invoices) {
            totalSales = totalSales.add(nz(inv.getInvoiceTotal()));
            totalTax = totalTax.add(nz(inv.getTaxTotal()));
            billDiscount = billDiscount.add(nz(inv.getBillDiscountAmount()));
            BigDecimal outstandingBalance = nz(inv.getBalance());
            if (outstandingBalance.signum() > 0) {
                creditSales = creditSales.add(outstandingBalance);
                creditInvoiceCount++;
            }
            if (nz(inv.getBillDiscountAmount()).signum() > 0) billDiscountCount++;
            deliveryCharge = deliveryCharge.add(nz(inv.getDeliveryCharge()));
            roundOff = roundOff.add(nz(inv.getRoundOff()));

            BigDecimal invTotal = nz(inv.getInvoiceTotal());
            if (highest == null || invTotal.compareTo(highest) > 0) highest = invTotal;
            if (lowest == null || invTotal.compareTo(lowest) < 0) lowest = invTotal;

            if (inv.getItems() != null) {
                for (SalesInvoiceItem it : inv.getItems()) {
                    if (it.isVoided()) continue;
                    int q = it.getQuantity() != null ? it.getQuantity() : 0;
                    qtySold += q;
                    lineCount++;
                    BigDecimal gross = it.getGrossAmount() != null
                            ? it.getGrossAmount()
                            : nz(it.getPrice()).multiply(BigDecimal.valueOf(q));
                    grossSales = grossSales.add(gross);
                    boolean hasLineDiscount = (it.getDiscount() != null && it.getDiscount() > 0)
                            || nz(it.getFooterDiscount()).signum() > 0;
                    if (hasLineDiscount) lineDiscountCount++;
                    // Line discount value = gross × discount% (discount stored as percentage).
                    if (it.getDiscount() != null && it.getDiscount() > 0) {
                        lineDiscount = lineDiscount.add(
                                gross.multiply(BigDecimal.valueOf(it.getDiscount()))
                                        .divide(BigDecimal.valueOf(100), 2, java.math.RoundingMode.HALF_UP));
                    }
                    lineDiscount = lineDiscount.add(nz(it.getFooterDiscount()));
                }
            }
        }

        BigDecimal totalDiscount = lineDiscount.add(billDiscount);
        BigDecimal netSalesExTax = totalSales.subtract(totalTax).max(BigDecimal.ZERO);
        int invCount = invoices.size();
        BigDecimal avgInvoice = invCount > 0
                ? totalSales.divide(BigDecimal.valueOf(invCount), 2, java.math.RoundingMode.HALF_UP)
                : BigDecimal.ZERO;
        BigDecimal avgBasket = invCount > 0
                ? BigDecimal.valueOf(qtySold).divide(BigDecimal.valueOf(invCount), 2, java.math.RoundingMode.HALF_UP)
                : BigDecimal.ZERO;

        Map<String, Object> s = new java.util.LinkedHashMap<>();
        s.put("totalSales", totalSales);
        s.put("grossSales", grossSales);
        s.put("netSalesExTax", netSalesExTax);
        s.put("salesAmountExTax", netSalesExTax);   // legacy alias kept for the frontend VM
        s.put("taxableSales", netSalesExTax);
        s.put("totalTax", totalTax);
        s.put("totalDiscount", totalDiscount);
        s.put("lineDiscount", lineDiscount);
        s.put("lineDiscountCount", lineDiscountCount);
        s.put("billDiscount", billDiscount);
        s.put("billDiscountCount", billDiscountCount);
        s.put("deliveryCharge", deliveryCharge);
        s.put("roundOff", roundOff);
        s.put("totalItemsSold", qtySold);
        s.put("lineCount", lineCount);
        s.put("averageInvoice", avgInvoice);
        s.put("averageBasket", avgBasket);
        s.put("highestInvoice", highest != null ? highest : BigDecimal.ZERO);
        s.put("lowestInvoice", lowest != null ? lowest : BigDecimal.ZERO);

        // Payment summary = ACTUAL tender collected, bucketed — except Credit, which is
        // sourced from invoice.balance above (a Credit sale may have collected nothing).
        s.put("cashSales", tender.byBucket.getOrDefault("cash", BigDecimal.ZERO));
        s.put("cardSales", tender.byBucket.getOrDefault("card", BigDecimal.ZERO));
        s.put("creditSales", creditSales);
        s.put("bankTransferSales", tender.byBucket.getOrDefault("bankTransfer", BigDecimal.ZERO));
        s.put("walletSales", tender.byBucket.getOrDefault("wallet", BigDecimal.ZERO));
        s.put("walletInvoiceCount", tender.countByBucket.getOrDefault("wallet", 0L));
        s.put("voucherSales", tender.byBucket.getOrDefault("voucher", BigDecimal.ZERO));
        // BNPL is money the store has been paid — by the provider, not the customer — so it
        // belongs with the collected tenders, never with credit. It also flows into
        // "otherSales" below, which is what keeps cash+card+credit+other summing to totalPaid.
        s.put("bnplSales", tender.byBucket.getOrDefault("bnpl", BigDecimal.ZERO));
        // "Other" combines every bucket besides cash/card/credit (bank transfer, wallet,
        // voucher, cheque, loyalty, store credit, other) so cash+card+credit+other sums to
        // totalPaid/totalTenderCount exactly — used for the Payment/Tender Summary footer.
        java.util.Set<String> primaryBuckets = java.util.Set.of("cash", "card", "credit");
        BigDecimal otherSales = tender.byBucket.entrySet().stream()
                .filter(e -> !primaryBuckets.contains(e.getKey()))
                .map(Map.Entry::getValue)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        long otherInvoiceCount = tender.countByBucket.entrySet().stream()
                .filter(e -> !primaryBuckets.contains(e.getKey()))
                .mapToLong(Map.Entry::getValue)
                .sum();
        s.put("otherSales", otherSales);
        s.put("otherInvoiceCount", otherInvoiceCount);
        s.put("totalPaid", tender.total);
        s.put("cashInvoiceCount", tender.countByBucket.getOrDefault("cash", 0L));
        s.put("cardInvoiceCount", tender.countByBucket.getOrDefault("card", 0L));
        s.put("creditInvoiceCount", creditInvoiceCount);
        s.put("totalTenderCount", tender.countByBucket.values().stream().mapToLong(Long::longValue).sum());

        // Card settlement split by network/brand (Visa/Mastercard/Amex/…), plus the
        // existing single "cardSales" total above so both views stay available.
        List<Map<String, Object>> cardTypeBreakdown = new java.util.ArrayList<>();
        for (Map.Entry<String, BigDecimal> e : tender.cardByType.entrySet()) {
            Map<String, Object> row = new java.util.LinkedHashMap<>();
            row.put("cardType", e.getKey());
            row.put("count", tender.cardCountByType.getOrDefault(e.getKey(), 0L));
            row.put("amount", e.getValue());
            cardTypeBreakdown.add(row);
        }
        s.put("cardTypeBreakdown", cardTypeBreakdown);
        return s;
    }

    /** Per-cashier attribution: invoice count + tender collected, keyed by the cashier
     *  who took the payment (Payment.createdBy). Supports multi-cashier sessions. */
    private List<Map<String, Object>> buildCashierAttribution(List<SalesInvoice> invoices, TenderTotals tender) {
        Map<String, BigDecimal> collected = new java.util.LinkedHashMap<>();
        for (Map<String, Object> line : tender.lines) {
            String cashier = (String) line.get("cashier");
            if (cashier == null || cashier.isBlank()) cashier = "—";
            collected.merge(cashier, (BigDecimal) line.get("amount"), BigDecimal::add);
        }
        List<Map<String, Object>> out = new java.util.ArrayList<>();
        for (Map.Entry<String, BigDecimal> e : collected.entrySet()) {
            Map<String, Object> row = new java.util.LinkedHashMap<>();
            row.put("cashier", e.getKey());
            row.put("cashierDisplayName", "—".equals(e.getKey()) ? e.getKey() : resolveDisplayName(e.getKey()));
            row.put("collected", e.getValue());
            out.add(row);
        }
        return out;
    }

    /** Two-bucket void/removal report. ERP systems never mix these:
     *  - postedVoids  : lines persisted on a posted invoice with voided=true
     *                   (rung up, then voided) — full line detail available.
     *  - cartRemovals : ITEM_VOIDED audit entries with no matching persisted voided
     *                   line (removed before the sale was posted) — audit detail only. */
    private static final class VoidReport {
        final List<Map<String, Object>> postedVoids = new java.util.ArrayList<>();
        final List<Map<String, Object>> cartRemovals = new java.util.ArrayList<>();
        BigDecimal voidAmount = BigDecimal.ZERO;
    }

    private VoidReport buildVoidReport(List<SalesInvoice> invoices, List<Long> sessionIds) {
        VoidReport vr = new VoidReport();
        // Track (invoiceNumber|itemCode) of persisted voids to de-dup against audit rows.
        java.util.Set<String> postedKeys = new java.util.HashSet<>();

        for (SalesInvoice inv : invoices) {
            if (inv.getItems() == null) continue;
            for (SalesInvoiceItem it : inv.getItems()) {
                if (!it.isVoided()) continue;
                int q = it.getQuantity() != null ? it.getQuantity() : 0;
                BigDecimal lineTotal = nz(it.getPrice()).multiply(BigDecimal.valueOf(q));
                vr.voidAmount = vr.voidAmount.add(lineTotal);
                postedKeys.add((inv.getInvoiceNumber() + "|" + it.getItemCode()).toLowerCase());

                Map<String, Object> v = new java.util.LinkedHashMap<>();
                v.put("invoiceNumber", inv.getInvoiceNumber());
                v.put("terminalId", inv.getPosTerminalId());
                v.put("counter", inv.getPosCounterName());
                v.put("itemCode", it.getItemCode());
                v.put("itemName", it.getItemName());
                v.put("sku", it.getSku());
                v.put("serialNumber", it.getSerialNumber());
                v.put("quantity", q);
                v.put("unitPrice", nz(it.getPrice()));
                v.put("lineTotal", lineTotal);
                v.put("voidReason", it.getVoidReason());
                v.put("voidedBy", it.getVoidedBy());
                v.put("voidedAt", it.getVoidedAt());
                v.put("type", "POSTED_VOID");
                vr.postedVoids.add(v);
            }
        }

        // Audit-only ITEM_VOIDED rows that don't match a persisted void line.
        for (Long sid : sessionIds) {
            if (sid == null) continue;
            for (PosAuditLog log : auditLogRepository.findBySessionIdOrderByCreatedAtDesc(sid)) {
                if (log.getAction() != PosAuditAction.ITEM_VOIDED) continue;
                String itemCode = log.getEntityId();
                // Heuristic de-dup: skip if a persisted void exists for this item in any
                // session invoice (cannot key on invoice — audit row predates the post).
                boolean matchesPosted = postedKeys.stream()
                        .anyMatch(k -> itemCode != null && k.endsWith("|" + itemCode.toLowerCase()));
                if (matchesPosted) continue;
                Map<String, Object> v = new java.util.LinkedHashMap<>();
                v.put("itemCode", itemCode);
                v.put("description", log.getDescription());
                v.put("voidedBy", log.getUserId());
                v.put("terminalId", log.getTerminalId());
                v.put("voidedAt", log.getCreatedAt());
                v.put("type", "CART_REMOVAL");
                vr.cartRemovals.add(v);
            }
        }
        return vr;
    }
}
