package com.billbull.backend.pos.session;

import com.billbull.backend.financials.generalledger.postingengine.PostingEngineService;
import com.billbull.backend.pos.audit.PosAuditAction;
import com.billbull.backend.pos.audit.PosAuditLog;
import com.billbull.backend.pos.audit.PosAuditLogRepository;
import com.billbull.backend.pos.audit.PosAuditService;
import com.billbull.backend.pos.settings.PosSettings;
import com.billbull.backend.pos.settings.PosSettingsRepository;
import com.billbull.backend.pos.terminal.PosTerminal;
import com.billbull.backend.pos.terminal.PosTerminalRepository;
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
import com.billbull.backend.sales.invoice.SalesInvoiceStatus;
import com.billbull.backend.sales.payment.PaymentStatus;
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
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
public class PosSessionService {

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
                             ObjectMapper objectMapper) {
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
    }

    private String currentUser() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return auth != null ? auth.getName() : "system";
    }

    private static BigDecimal sumCashMovements(PosSession session, String movementType) {
        return session.getCashMovements().stream()
                .filter(m -> movementType.equals(m.getMovementType()))
                .map(m -> nz(m.getAmount()))
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    /** Single source of truth for "Expected Cash in Drawer", shared by closeSession()
     *  and getXReport() so the Close Session modal and the X-Report page never diverge. */
    private static BigDecimal computeExpectedCash(PosSession session, BigDecimal tenderCash,
                                                    BigDecimal cashDropIn, BigDecimal cashDropOut) {
        return nz(session.getOpeningCash()).add(tenderCash).add(cashDropIn).subtract(cashDropOut);
    }

    @Transactional
    public PosSession openSession(String terminalId, String counterName, BigDecimal openingCash) {
        Branch branch = branchAccessService.getRequiredCurrentUserBranch();
        Long branchId = branch.getId();

        // 0. Verify day is not already closed
        if (dayCloseRepository.existsByBranchIdAndCloseDate(branchId, LocalDate.now())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Cannot open session: The business day has already been closed.");
        }

        // 0b. Guard against silently rolling into a new day while a prior day's session is
        // still open/suspended (BBQA-5.3-013): surface it as a distinct, machine-readable
        // status so the frontend can prompt the user to close it instead of just failing.
        List<PosSession> stale = repo.findUnclosedSessionsBeforeDate(branchId, LocalDate.now());
        if (!stale.isEmpty()) {
            PosSession oldest = stale.get(0);
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "PREVIOUS_DAY_SESSION_OPEN: Session #" + oldest.getId() + " on " + oldest.getSessionDate()
                            + " (terminal " + oldest.getTerminalId() + ") is still " + oldest.getStatus()
                            + ". Close the previous day's session before starting a new one.");
        }

        // Resolve terminal entity for the DB-level lock
        PosTerminal terminal = terminalRepository.findByTerminalId(terminalId).orElse(null);

        // App-level duplicate check: if same user returns to their own session, hand it back
        Optional<PosSession> existing = repo.findByBranchIdAndTerminalIdAndStatus(branchId, terminalId, PosSessionStatus.OPEN);
        if (existing.isPresent()) {
            if (!currentUser().equals(existing.get().getOpenedBy())) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Terminal is already in use by active cashier: " + existing.get().getOpenedBy());
            }
            return existing.get();
        }

        // Snapshot settings for idle / hard-limit timeout
        PosSettings settings = posSettingsRepository.findByBranchId(branchId).orElse(new PosSettings());

        LocalDateTime now = LocalDateTime.now();
        PosSession session = new PosSession();
        session.setBranchId(branchId);
        session.setBranchName(branch.getName());
        session.setTerminalId(terminalId);
        session.setCounterName(counterName);
        session.setOpenedBy(currentUser());
        session.setSessionDate(LocalDate.now());
        session.setOpenedAt(now);
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

        if (terminal != null) {
            session.setTerminalPk(terminal.getId());
            if (terminal.getCounterId() != null) session.setCounterId(terminal.getCounterId());
        }
        Integer idleTimeout = settings.getSessionIdleTimeoutMinutes();
        if (idleTimeout != null && idleTimeout > 0) session.setIdleTimeoutMinutes(idleTimeout);
        Integer maxHours = settings.getSessionMaxDurationHours();
        if (maxHours != null && maxHours > 0) session.setSessionTimeoutAt(now.plusHours(maxHours));

        PosSession saved = repo.save(session);

        // Atomically acquire terminal lock (DB partial unique index is the concurrency safety net)
        if (terminal != null) {
            int acquired = terminalRepository.setOpenSession(terminal.getId(), saved.getId());
            if (acquired == 0) {
                repo.delete(saved);
                throw new ResponseStatusException(HttpStatus.CONFLICT,
                        "Terminal is already occupied by another session.");
            }
        }

        auditService.logSessionOpened(saved.getId(), saved.getTerminalId(), saved.getBranchId());
        return saved;
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
        repo.findByBranchIdAndTerminalIdAndStatus(branch.getId(), terminalId, PosSessionStatus.OPEN)
                .ifPresent(session -> {
                    session.setOpenedBy(newOwnerUsername);
                    repo.save(session);
                });
    }

    @Transactional(readOnly = true)
    public Optional<PosSession> getActiveSession(String terminalId) {
        if (terminalId != null && !terminalId.isBlank()) {
            Branch branch = branchAccessService.getRequiredCurrentUserBranch();
            Long branchId = branch.getId();
            Optional<PosSession> sessionOpt = repo.findByBranchIdAndTerminalIdAndStatus(branchId, terminalId, PosSessionStatus.OPEN);
            if (sessionOpt.isPresent()) {
                PosSession session = sessionOpt.get();
                if (!currentUser().equals(session.getOpenedBy())) {
                    throw new ResponseStatusException(HttpStatus.CONFLICT, "Terminal is locked by active cashier: " + session.getOpenedBy());
                }
                return Optional.of(session);
            }
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
    public PosSession closeSession(Long sessionId, BigDecimal closingCash, String notes,
                                   boolean supervisorApproved) {
        return closeSession(sessionId, closingCash, notes, supervisorApproved, null);
    }

    @Transactional
    public PosSession closeSession(Long sessionId, BigDecimal closingCash, String notes,
                                   boolean supervisorApproved, String closingDenominationsJson) {
        return closeSession(sessionId, closingCash, notes, supervisorApproved, closingDenominationsJson,
                null, null, null, null, null);
    }

    @Transactional
    public PosSession closeSession(Long sessionId, BigDecimal closingCash, String notes,
                                   boolean supervisorApproved, String closingDenominationsJson,
                                   String cardBatchNo, Boolean cardSettlementVerified,
                                   String closingCashierName, String closingSupervisorName,
                                   String closingRemarks) {
        PosSession session = getById(sessionId);
        if (session.getStatus() == PosSessionStatus.CLOSED) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Session is already closed.");
        }
        if (session.getStatus() != PosSessionStatus.OPEN && session.getStatus() != PosSessionStatus.SUSPENDED) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Session cannot be closed from status: " + session.getStatus());
        }

        // Expected cash uses the same actual-tender-collected formula as getXReport(), so the
        // Close Session modal and the X-Report page never diverge (both compute it here).
        List<SalesInvoice> invoices = invoiceRepo.findByPosSessionIdWithItems(sessionId);
        TenderTotals tender = aggregateTender(invoices);
        BigDecimal cashDropIn = sumCashMovements(session, "DROP_IN");
        BigDecimal cashDropOut = sumCashMovements(session, "DROP_OUT");
        BigDecimal expectedCash = computeExpectedCash(session, tender.cash, cashDropIn, cashDropOut);
        BigDecimal actualClosing = closingCash != null ? closingCash : BigDecimal.ZERO;
        BigDecimal variance = actualClosing.subtract(expectedCash).abs();

        // Supervisor variance gate: block close if variance exceeds configured threshold
        if (!supervisorApproved) {
            PosSettings settings = session.getBranchId() != null
                    ? posSettingsRepository.findByBranchId(session.getBranchId()).orElse(null)
                    : null;
            BigDecimal threshold = settings != null && settings.getCashVarianceThreshold() != null
                    ? settings.getCashVarianceThreshold() : BigDecimal.ZERO;
            if (threshold.signum() > 0 && variance.compareTo(threshold) > 0) {
                throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                        "Cash variance " + variance + " exceeds allowed threshold " + threshold
                                + ". Supervisor approval required.");
            }
        }

        LocalDateTime closeTime = LocalDateTime.now();
        session.setClosedBy(currentUser());
        session.setClosedAt(closeTime);
        if (session.getOpenedAt() != null) {
            session.setDurationSeconds(Math.max(0, ChronoUnit.SECONDS.between(session.getOpenedAt(), closeTime)));
        }
        session.setStatus(PosSessionStatus.CLOSED);
        session.setClosingCash(actualClosing);
        session.setExpectedCash(expectedCash);
        session.setCashDifference(actualClosing.subtract(expectedCash));
        session.setNotes(notes);
        if (closingDenominationsJson != null && !closingDenominationsJson.isBlank()) {
            session.setClosingDenominationsJson(closingDenominationsJson);
        }
        if (cardBatchNo != null) session.setCardBatchNo(cardBatchNo);
        if (cardSettlementVerified != null) session.setCardSettlementVerified(cardSettlementVerified);
        if (closingCashierName != null) session.setClosingCashierName(closingCashierName);
        if (closingSupervisorName != null) session.setClosingSupervisorName(closingSupervisorName);
        if (closingRemarks != null) session.setClosingRemarks(closingRemarks);

        // Closing a session implies its X-Report shift read is complete — stamp it so
        // a terminal that closes out without explicitly running X-Report still satisfies
        // the Z-Report end-of-day gate (closed terminals are no longer "active" anyway).
        if (session.getXReportGeneratedAt() == null) {
            session.setXReportGeneratedAt(closeTime);
            session.setXReportGeneratedBy(currentUser());
        }
        session.setXReportPrinted(true);

        // Capture immutable Z-Report snapshot at close time
        String varianceStr = actualClosing.subtract(expectedCash).toPlainString();
        session.setZReportJson(buildZReportSnapshot(session, expectedCash, actualClosing));

        PosSession closed = repo.save(session);

        // Release terminal lock so the terminal can accept a new session
        if (closed.getTerminalPk() != null) {
            terminalRepository.clearOpenSession(closed.getTerminalPk(), closed.getId());
        }

        // §3.7 Session-close GL: transfer closing cash count to bank (daily pickup)
        try {
            Branch branch = closed.getBranchId() != null
                    ? branchRepository.findById(closed.getBranchId()).orElse(null) : null;
            postingEngine.createJournalFromSessionClose(
                    closed.getId(), actualClosing, java.time.LocalDate.now(), branch);
        } catch (Exception e) {
            // Non-blocking — GL failure must not prevent the session from closing.
        }

        // Async audit: session closed with variance info
        auditService.logSessionClosed(
                closed.getId(), closed.getTerminalId(), closed.getBranchId(), varianceStr);

        return closed;
    }

    /** Backward-compatible overload used by controller when supervisorApproved is not supplied. */
    @Transactional
    public PosSession closeSession(Long sessionId, BigDecimal closingCash, String notes) {
        return closeSession(sessionId, closingCash, notes, false);
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
        session.setStatus(PosSessionStatus.OPEN);
        session.setLastActivityAt(LocalDateTime.now());
        return repo.save(session);
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
        session.setLastActivityAt(LocalDateTime.now());
        PosSession updated = repo.save(session);

        auditService.logSessionOpened(updated.getId(), updated.getTerminalId(), updated.getBranchId());
        return updated;
    }

    /** Touch lastActivityAt — called by the sales/payment path to reset the idle clock. */
    @Transactional
    public void touchActivity(Long sessionId) {
        repo.touchLastActivity(sessionId, LocalDateTime.now());
    }

    private String buildZReportSnapshot(PosSession s, BigDecimal expectedCash, BigDecimal closingCash) {
        return "{\"sessionId\":" + s.getId()
                + ",\"terminalId\":\"" + safe(s.getTerminalId()) + "\""
                + ",\"closedAt\":\"" + LocalDateTime.now() + "\""
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
                + "}";
    }

    private static String safe(String v) { return v != null ? v.replace("\"", "\\\"") : ""; }

    @Transactional
    public PosCashMovement addCashMovement(Long sessionId, String movementType, BigDecimal amount, String description) {
        PosSession session = getById(sessionId);
        if (session.getStatus() != PosSessionStatus.OPEN) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cannot add cash movement to a closed session.");
        }

        PosCashMovement movement = new PosCashMovement();
        movement.setPosSession(session);
        movement.setMovementType(movementType);
        movement.setAmount(amount);
        movement.setDescription(description);
        movement.setPerformedBy(currentUser());
        movement.setPerformedAt(LocalDateTime.now());
        session.getCashMovements().add(movement);
        repo.save(session);

        // Post GL journal: DROP_IN → Dr Cash / Cr Petty Cash; DROP_OUT → Dr Expense / Cr Cash
        Branch branch = session.getBranchId() != null
                ? branchRepository.findById(session.getBranchId()).orElse(null)
                : null;
        postingEngine.createJournalFromCashMovement(
                movement.getId(),
                movementType,
                amount,
                description,
                session.getSessionDate(),
                branch);

        return movement;
    }

    @Transactional
    public void recordInvoiceOnSession(Long sessionId, SalesInvoice invoice) {
        if (sessionId == null) return;

        BigDecimal total = nz(invoice.getInvoiceTotal());
        String mode = invoice.getPaymentMode() != null ? invoice.getPaymentMode().toLowerCase() : "";

        // Classify into buckets — only one bucket receives the total.
        BigDecimal cashDelta   = BigDecimal.ZERO;
        BigDecimal cardDelta   = BigDecimal.ZERO;
        BigDecimal creditDelta = BigDecimal.ZERO;
        BigDecimal mixedDelta  = BigDecimal.ZERO;
        BigDecimal onlineDelta = BigDecimal.ZERO;

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
        repo.touchLastActivity(sessionId, LocalDateTime.now());
    }

    /** Explicit shift X-Report run by an open terminal. Stamps {@code xReportGeneratedAt}
     *  the first time it is called on an OPEN session (idempotent), then returns the same
     *  payload as {@link #getXReport}. This stamp is what the end-of-day Z-Report gate
     *  checks — the read-only {@link #getXReport} preview (used on the dashboard) never
     *  marks completion. */
    @Transactional
    public Map<String, Object> generateXReport(Long sessionId) {
        PosSession session = getById(sessionId);
        if (session.getStatus() == PosSessionStatus.OPEN && session.getXReportGeneratedAt() == null) {
            session.setXReportGeneratedAt(LocalDateTime.now());
            session.setXReportGeneratedBy(currentUser());
            session.setXReportPrinted(true);
            repo.save(session);
        }
        return getXReport(sessionId);
    }

    @Transactional(readOnly = true)
    public Map<String, Object> getXReport(Long sessionId) {
        PosSession session = getById(sessionId);
        // Fetch invoices WITH items in one query — the report streams items for sums
        // and per-line void detail, so a plain fetch would trigger N+1 lazy loads.
        List<SalesInvoice> invoices = invoiceRepo.findByPosSessionIdWithItems(sessionId);

        BigDecimal cashDropIn = sumCashMovements(session, "DROP_IN");
        BigDecimal cashDropOut = sumCashMovements(session, "DROP_OUT");

        // Actual tender collected (not invoice value) for this single session.
        TenderTotals tender = aggregateTender(invoices);
        // Actual tender refunded (paymentType = MADE) for this session, bucketed the same way.
        TenderTotals refunds = aggregateRefunds(invoices);

        Map<String, Object> summary = buildSalesSummary(invoices, tender);
        summary.put("invoiceCount", session.getInvoiceCount() != null ? session.getInvoiceCount() : invoices.size());
        summary.put("sessionCount", 1);
        summary.put("openingCash", nz(session.getOpeningCash()));
        summary.put("cashDropIn", cashDropIn);
        summary.put("cashDropOut", cashDropOut);
        // Same formula as closeSession() — single source of truth for Expected Cash.
        summary.put("expectedCash", computeExpectedCash(session, tender.cash, cashDropIn, cashDropOut));

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

        // Sales Return module figures for this session's branch+date — same source and
        // shape as the Z-Report's Returns/Refund Summary, so the two reports agree.
        ReturnsSummary returns = buildReturnsSummary(session.getBranchId(), session.getSessionDate());
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

    @Transactional(readOnly = true)
    public Map<String, Object> getZReport(Long branchId, LocalDate date) {
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
        
        return generateDynamicZReport(branchId, date);
    }
    
    private Map<String, Object> generateDynamicZReport(Long branchId, LocalDate date) {
        // End-of-day gate: every terminal that is still OPEN for this branch+date must
        // have generated its X-Report before the consolidated Z-Report can be produced.
        // Any open session without an X-Report stamp is reported as a pending terminal.
        List<PosSession> openSessions = repo.findOpenSessionsByBranchAndDate(branchId, date);
        List<Map<String, Object>> pendingTerminals = new java.util.ArrayList<>();
        for (PosSession s : openSessions) {
            if (s.getXReportGeneratedAt() != null) continue;
            String terminalName = null;
            if (s.getTerminalId() != null && !s.getTerminalId().isBlank()) {
                terminalName = terminalRepository.findByTerminalId(s.getTerminalId())
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

        List<PosSession> sessions = repo.findByBranchIdAndSessionDateOrderByOpenedAtDesc(branchId, date).stream()
                .filter(s -> s.getStatus() == PosSessionStatus.CLOSED)
                .toList();
        List<Long> sessionIds = sessions.stream().map(PosSession::getId).toList();
        List<SalesInvoice> invoices = sessionIds.isEmpty()
                ? List.of()
                : invoiceRepo.findByBranchIdAndPosSessionIdInWithItems(branchId, sessionIds).stream()
                    .filter(inv -> inv.getStatus() != SalesInvoiceStatus.CANCELLED && inv.getStatus() != SalesInvoiceStatus.DRAFT)
                    .toList();

        TenderTotals tender = aggregateTender(invoices);
        // Actual tender refunded (paymentType = MADE) across the day's invoices — same
        // source and shape as the X-Report's "Returns" KPI, so the two reports agree.
        TenderTotals refunds = aggregateRefunds(invoices);

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

        Map<String, Object> result = new java.util.LinkedHashMap<>();
        result.put("eligible", eligible);
        result.put("pendingTerminals", pendingTerminals);
        result.put("sessions", sessions);
        result.put("invoices", invoices);
        result.put("date", date.toString());
        result.put("summary", summary);
        result.put("tender", tender.byBucket);
        result.put("tenderLines", tender.lines);
        result.put("voids", voids.postedVoids);
        result.put("cartRemovals", voids.cartRemovals);
        result.put("cashiers", buildCashierAttribution(invoices, tender));
        result.put("sessionInfo", sessions.stream().map(this::buildSessionInfo).toList());
        result.put("topSellingItems", buildTopSellingItems(invoices, 5));
        // Cashier-wise breakdown keyed by the session owner (not the payment processor),
        // with cash/card/credit split from actual tender — correctly attributes split
        // (mixed Cash+Card) payments to both buckets instead of the session's running
        // totalCashSales/totalCardSales counters, which never see "mixed" sales at all
        // (recordInvoiceOnSession buckets mixed payments into totalMixedSales only).
        result.put("cashierWiseSummary", buildCashierWiseSummary(invoices, sessions));
        result.put("isDayClosed", false);
        return result;
    }
    
    @Transactional
    public Map<String, Object> closeDay(Long branchId, LocalDate date) {
        // 1. Check lock/duplicate
        if (dayCloseRepository.existsByBranchIdAndCloseDate(branchId, date)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Business day has already been closed.");
        }
        
        // 2. Lock branch to prevent concurrent closes for the same branch
        Branch branch = branchRepository.findById(branchId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Branch not found"));
            
        // 3. Validations
        List<PosSession> allSessions = repo.findByBranchIdAndSessionDateOrderByOpenedAtDesc(branchId, date);
        long openCount = allSessions.stream().filter(s -> s.getStatus() == PosSessionStatus.OPEN).count();
        if (openCount > 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cannot close day: " + openCount + " POS sessions are still open.");
        }
        
        // Check for pending/failed payments for the date's invoices
        List<Long> sessionIds = allSessions.stream().map(PosSession::getId).toList();
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
        
        // 4. Generate dynamic report
        Map<String, Object> report = generateDynamicZReport(branchId, date);
        
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
        // Cash paid in/out is recorded in sessions.
        BigDecimal cashPaidIn = allSessions.stream().map(s -> sumCashMovements(s, "PAY_IN")).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal cashPaidOut = allSessions.stream().map(s -> sumCashMovements(s, "PAY_OUT")).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal expectedCashComputed = openingCash.add(cashSales).add(cashPaidIn).subtract(cashPaidOut);

        // Let's compute actual expected cash from sessions directly
        BigDecimal expectedCashSessions = allSessions.stream().map(s -> nz(s.getExpectedCash())).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal cashVariance = expectedCashComputed.subtract(expectedCashSessions);
        if (cashVariance.abs().compareTo(new BigDecimal("0.05")) > 0) {
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
        
        // 6. Save Snapshot
        PosDayClose dayClose = new PosDayClose();
        dayClose.setBranchId(branchId);
        dayClose.setCloseDate(date);
        dayClose.setClosedBy(currentUser());
        dayClose.setClosedAt(LocalDateTime.now());
        dayClose.setBranchName(branch.getName());
        dayClose.setBranchCode(branch.getCode());
        dayClose.setReportVersion("1.0");
        
        dayClose.setGrossSales((BigDecimal) summary.getOrDefault("grossSales", BigDecimal.ZERO));
        dayClose.setNetSales((BigDecimal) summary.getOrDefault("netSalesExTax", BigDecimal.ZERO));
        dayClose.setTotalDiscount((BigDecimal) summary.getOrDefault("totalDiscount", BigDecimal.ZERO));
        dayClose.setTotalVat((BigDecimal) summary.getOrDefault("totalTax", BigDecimal.ZERO));
        dayClose.setCashSales(cashSales);
        dayClose.setCardSales(cardSales);
        dayClose.setCreditSales(creditSales);
        dayClose.setOtherSales(otherSales);
        dayClose.setExpectedCash(expectedCashSessions);
        dayClose.setTotalInvoices((Integer) summary.getOrDefault("invoiceCount", 0));
        dayClose.setTotalSessions((Integer) summary.getOrDefault("sessionCount", 0));
        
        try {
            dayClose.setzReportJson(objectMapper.writeValueAsString(report));
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to serialize Z-Report");
        }
        
        dayCloseRepository.save(dayClose);
        
        return report;
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
        ReturnsSummary rs = new ReturnsSummary();
        List<SalesReturn> returns = returnRepository.findByReturnDateAndBranchWithItems(date, branchId);
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

    private List<Map<String, Object>> buildCashierWiseSummary(List<SalesInvoice> invoices, List<PosSession> sessions) {
        Map<Long, String> cashierBySessionId = new java.util.HashMap<>();
        for (PosSession s : sessions) {
            cashierBySessionId.put(s.getId(), s.getOpenedBy() != null ? s.getOpenedBy() : "—");
        }
        Map<String, List<SalesInvoice>> byCashier = new java.util.LinkedHashMap<>();
        for (SalesInvoice inv : invoices) {
            if (inv.getStatus() == SalesInvoiceStatus.CANCELLED || inv.getStatus() == SalesInvoiceStatus.DRAFT) continue;
            String cashier = inv.getPosSessionId() != null
                    ? cashierBySessionId.getOrDefault(inv.getPosSessionId(), "—")
                    : "—";
            byCashier.computeIfAbsent(cashier, k -> new java.util.ArrayList<>()).add(inv);
        }
        List<Map<String, Object>> rows = new java.util.ArrayList<>();
        for (Map.Entry<String, List<SalesInvoice>> e : byCashier.entrySet()) {
            List<SalesInvoice> cashierInvoices = e.getValue();
            TenderTotals t = aggregateTender(cashierInvoices);
            BigDecimal netSales = cashierInvoices.stream()
                    .map(i -> nz(i.getInvoiceTotal())).reduce(BigDecimal.ZERO, BigDecimal::add);
            Map<String, Object> row = new java.util.LinkedHashMap<>();
            row.put("cashier", e.getKey());
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
            PosTerminal term = terminalRepository.findByTerminalId(s.getTerminalId()).orElse(null);
            if (term != null) {
                terminalName = term.getTerminalName();
                deviceName = term.getTerminalName() != null ? term.getTerminalName() : term.getTerminalId();
                deviceInfo = term.getDeviceInfo();
            }
        }
        info.put("sessionNo", s.getId() != null ? "SESS-" + String.format("%06d", s.getId()) : null);
        info.put("terminalId", s.getTerminalId());
        info.put("terminalName", terminalName);
        info.put("counter", s.getCounterName());
        info.put("cashier", s.getOpenedBy());
        info.put("closedBy", s.getClosedBy());
        info.put("branch", s.getBranchName());
        info.put("device", deviceName != null ? deviceName : s.getTerminalId());
        info.put("deviceInfo", deviceInfo);
        info.put("shift", deriveShift(s.getOpenedAt()));
        info.put("openedAt", s.getOpenedAt() != null ? s.getOpenedAt().atZone(java.time.ZoneId.systemDefault()) : null);
        info.put("closedAt", s.getClosedAt() != null ? s.getClosedAt().atZone(java.time.ZoneId.systemDefault()) : null);
        info.put("durationSeconds", s.getDurationSeconds());
        info.put("openingCash", nz(s.getOpeningCash()));
        info.put("closingCash", nz(s.getClosingCash()));
        info.put("closingDenominationsJson", s.getClosingDenominationsJson());
        info.put("cardBatchNo", s.getCardBatchNo());
        info.put("cardSettlementVerified", Boolean.TRUE.equals(s.getCardSettlementVerified()));
        info.put("closingCashierName", s.getClosingCashierName());
        info.put("closingSupervisorName", s.getClosingSupervisorName());
        info.put("closingRemarks", s.getClosingRemarks());
        info.put("varianceRemarks", s.getNotes());
        return info;
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

    /** Maps a free-text payment mode (Cash / Visa / Card / Credit / Bank Transfer / …)
     *  to one of the canonical report buckets. Order matters: "credit card" must
     *  resolve to CARD, not CREDIT. */
    private static String tenderBucket(String mode) {
        String m = mode == null ? "" : mode.toLowerCase();
        if (m.contains("card") || m.contains("visa") || m.contains("master")
                || m.contains("amex") || m.contains("mada")) return "card";
        if (m.contains("cash")) return "cash";
        if (m.contains("credit")) return "credit";
        if (m.contains("bank") || m.contains("transfer") || m.contains("online")) return "bankTransfer";
        if (m.contains("wallet") || m.contains("apple") || m.contains("google")) return "wallet";
        if (m.contains("voucher") || m.contains("gift")) return "voucher";
        if (m.contains("cheque") || m.contains("check")) return "cheque";
        if (m.contains("loyalty") || m.contains("points")) return "loyalty";
        if (m.contains("store") ) return "storeCredit";
        return "other";
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

    /** Normalizes a raw card paymentMode label into a display card-type name
     *  (e.g. "VISA DEBIT" -&gt; "Visa"). Falls back to the trimmed raw label,
     *  or "Card" if blank, so unrecognized brands still get their own row. */
    private static String cardTypeLabel(String rawMode) {
        String m = rawMode == null ? "" : rawMode.trim();
        String lower = m.toLowerCase();
        if (lower.contains("visa")) return "Visa";
        if (lower.contains("master")) return "Mastercard";
        if (lower.contains("amex")) return "Amex";
        if (lower.contains("mada")) return "Mada";
        if (m.isEmpty() || lower.equals("card")) return "Card";
        return m;
    }

    /** Aggregates actual RECEIVED tender for the given invoices from sales_payments.
     *  This is the authoritative "Total Paid" — per-leg payment rows, not invoice value. */
    private TenderTotals aggregateTender(List<SalesInvoice> invoices) {
        TenderTotals t = new TenderTotals();
        List<String> numbers = invoices.stream()
                .map(SalesInvoice::getInvoiceNumber)
                .filter(n -> n != null && !n.isBlank())
                .toList();
        if (numbers.isEmpty()) return t;

        for (Object[] row : paymentRepository.sumTenderByModeForInvoices(numbers)) {
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
        for (Payment p : paymentRepository.findTenderForInvoices(numbers)) {
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
        return t;
    }

    /** Aggregates actual refunded tender (paymentType = MADE) for the given invoices —
     *  mirrors {@link #aggregateTender}, used to attribute "Card Refunds" to real
     *  refund-leg payment rows instead of the unrelated item-void counter. */
    private TenderTotals aggregateRefunds(List<SalesInvoice> invoices) {
        TenderTotals t = new TenderTotals();
        List<String> numbers = invoices.stream()
                .map(SalesInvoice::getInvoiceNumber)
                .filter(n -> n != null && !n.isBlank())
                .toList();
        if (numbers.isEmpty()) return t;

        for (Object[] row : paymentRepository.sumRefundByModeForInvoices(numbers)) {
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
