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
import com.billbull.backend.settings.branch.Branch;
import com.billbull.backend.settings.branch.BranchAccessService;
import com.billbull.backend.settings.branch.BranchRepository;
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
                             PosTerminalRepository terminalRepository) {
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
    }

    private String currentUser() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return auth != null ? auth.getName() : "system";
    }

    @Transactional
    public PosSession openSession(String terminalId, String counterName, BigDecimal openingCash) {
        Branch branch = branchAccessService.getRequiredCurrentUserBranch();
        Long branchId = branch.getId();

        // Check if there is already an open session for this terminal
        Optional<PosSession> existing = repo.findByBranchIdAndTerminalIdAndStatus(branchId, terminalId, PosSessionStatus.OPEN);
        if (existing.isPresent()) {
            if (!currentUser().equals(existing.get().getOpenedBy())) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Terminal is already in use by active cashier: " + existing.get().getOpenedBy());
            }
            // Return existing open session instead of throwing — cashier may have refreshed
            return existing.get();
        }

        PosSession session = new PosSession();
        session.setBranchId(branchId);
        session.setBranchName(branch.getName());
        session.setTerminalId(terminalId);
        session.setCounterName(counterName);
        session.setOpenedBy(currentUser());
        session.setSessionDate(LocalDate.now());
        session.setOpenedAt(LocalDateTime.now());
        session.setDurationSeconds(null);
        session.setStatus(PosSessionStatus.OPEN);
        session.setOpeningCash(openingCash != null ? openingCash : BigDecimal.ZERO);
        session.setTotalSales(BigDecimal.ZERO);
        session.setTotalCashSales(BigDecimal.ZERO);
        session.setTotalCardSales(BigDecimal.ZERO);
        session.setTotalCreditSales(BigDecimal.ZERO);
        session.setTotalMixedSales(BigDecimal.ZERO);
        session.setInvoiceCount(0);
        PosSession saved = repo.save(session);
        auditService.logSessionOpened(saved.getId(), saved.getTerminalId(), saved.getBranchId());
        return saved;
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
        PosSession session = getById(sessionId);
        if (session.getStatus() != PosSessionStatus.OPEN) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Session is already closed.");
        }

        // Compute expected cash = opening + cash drops in - cash drops out + cash sales
        BigDecimal cashDropNet = session.getCashMovements().stream()
                .map(m -> "DROP_IN".equals(m.getMovementType()) ? nz(m.getAmount()) : nz(m.getAmount()).negate())
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal expectedCash = nz(session.getOpeningCash())
                .add(nz(session.getTotalCashSales()))
                .add(cashDropNet);
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

        // Capture immutable Z-Report snapshot at close time
        String varianceStr = actualClosing.subtract(expectedCash).toPlainString();
        session.setZReportJson(buildZReportSnapshot(session, expectedCash, actualClosing));

        PosSession closed = repo.save(session);

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

        if (mode.contains("cash") && mode.contains("card")) {
            mixedDelta = total;
        } else if (mode.contains("cash")) {
            cashDelta = total;
        } else if (mode.contains("card") || mode.contains("credit card")) {
            cardDelta = total;
        } else if (mode.contains("credit")) {
            creditDelta = total;
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
        repo.incrementSessionTotals(sessionId, total, cashDelta, cardDelta, creditDelta, mixedDelta, voidDelta);
    }

    @Transactional(readOnly = true)
    public Map<String, Object> getXReport(Long sessionId) {
        PosSession session = getById(sessionId);
        // Fetch invoices WITH items in one query — the report streams items for sums
        // and per-line void detail, so a plain fetch would trigger N+1 lazy loads.
        List<SalesInvoice> invoices = invoiceRepo.findByPosSessionIdWithItems(sessionId);

        BigDecimal cashDropIn = session.getCashMovements().stream()
                .filter(m -> "DROP_IN".equals(m.getMovementType()))
                .map(m -> nz(m.getAmount())).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal cashDropOut = session.getCashMovements().stream()
                .filter(m -> "DROP_OUT".equals(m.getMovementType()))
                .map(m -> nz(m.getAmount())).reduce(BigDecimal.ZERO, BigDecimal::add);

        // Actual tender collected (not invoice value) for this single session.
        TenderTotals tender = aggregateTender(invoices);

        Map<String, Object> summary = buildSalesSummary(invoices, tender);
        summary.put("invoiceCount", session.getInvoiceCount() != null ? session.getInvoiceCount() : invoices.size());
        summary.put("sessionCount", 1);
        summary.put("openingCash", nz(session.getOpeningCash()));
        summary.put("cashDropIn", cashDropIn);
        summary.put("cashDropOut", cashDropOut);
        // Expected cash uses ACTUAL cash tender collected, consistent with closeSession().
        summary.put("expectedCash",
                nz(session.getOpeningCash()).add(tender.cash).add(cashDropIn).subtract(cashDropOut));

        // Void / refund reporting from the audit trail + persisted voided lines.
        VoidReport voids = buildVoidReport(invoices, List.of(sessionId));
        summary.put("voidItemCount", voids.postedVoids.size() + voids.cartRemovals.size());
        summary.put("postedVoidCount", voids.postedVoids.size());
        summary.put("cartRemovalCount", voids.cartRemovals.size());
        summary.put("voidAmount", voids.voidAmount);
        summary.put("totalRefunds", nz(session.getTotalRefunds()));

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
        return result;
    }

    @Transactional(readOnly = true)
    public Map<String, Object> getZReport(Long branchId, LocalDate date) {
        List<PosSession> sessions = repo.findByBranchIdAndSessionDateOrderByOpenedAtDesc(branchId, date);
        List<Long> sessionIds = sessions.stream().map(PosSession::getId).toList();
        List<SalesInvoice> invoices = sessionIds.isEmpty()
                ? List.of()
                : invoiceRepo.findByBranchIdAndPosSessionIdInWithItems(branchId, sessionIds);

        TenderTotals tender = aggregateTender(invoices);

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
        summary.put("totalRefunds", sessions.stream()
                .map(s -> nz(s.getTotalRefunds())).reduce(BigDecimal.ZERO, BigDecimal::add));

        Map<String, Object> result = new java.util.LinkedHashMap<>();
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
        return result;
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
        if (m.contains("bank") || m.contains("transfer")) return "bankTransfer";
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
        final List<Map<String, Object>> lines = new java.util.ArrayList<>();
        BigDecimal cash = BigDecimal.ZERO;
        BigDecimal card = BigDecimal.ZERO;
        BigDecimal credit = BigDecimal.ZERO;
        BigDecimal total = BigDecimal.ZERO;
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
            else if ("card".equals(bucket)) t.card = t.card.add(amount);
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
        BigDecimal highest = null, lowest = null;

        for (SalesInvoice inv : invoices) {
            totalSales = totalSales.add(nz(inv.getInvoiceTotal()));
            totalTax = totalTax.add(nz(inv.getTaxTotal()));
            billDiscount = billDiscount.add(nz(inv.getBillDiscountAmount()));
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
        s.put("billDiscount", billDiscount);
        s.put("deliveryCharge", deliveryCharge);
        s.put("roundOff", roundOff);
        s.put("totalItemsSold", qtySold);
        s.put("lineCount", lineCount);
        s.put("averageInvoice", avgInvoice);
        s.put("averageBasket", avgBasket);
        s.put("highestInvoice", highest != null ? highest : BigDecimal.ZERO);
        s.put("lowestInvoice", lowest != null ? lowest : BigDecimal.ZERO);

        // Payment summary = ACTUAL tender collected, bucketed.
        s.put("cashSales", tender.byBucket.getOrDefault("cash", BigDecimal.ZERO));
        s.put("cardSales", tender.byBucket.getOrDefault("card", BigDecimal.ZERO));
        s.put("creditSales", tender.byBucket.getOrDefault("credit", BigDecimal.ZERO));
        s.put("bankTransferSales", tender.byBucket.getOrDefault("bankTransfer", BigDecimal.ZERO));
        s.put("walletSales", tender.byBucket.getOrDefault("wallet", BigDecimal.ZERO));
        s.put("voucherSales", tender.byBucket.getOrDefault("voucher", BigDecimal.ZERO));
        s.put("otherSales", tender.byBucket.getOrDefault("other", BigDecimal.ZERO));
        s.put("totalPaid", tender.total);
        s.put("cashInvoiceCount", tender.countByBucket.getOrDefault("cash", 0L));
        s.put("cardInvoiceCount", tender.countByBucket.getOrDefault("card", 0L));
        s.put("creditInvoiceCount", tender.countByBucket.getOrDefault("credit", 0L));
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
