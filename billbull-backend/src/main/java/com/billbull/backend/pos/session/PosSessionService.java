package com.billbull.backend.pos.session;

import com.billbull.backend.financials.generalledger.postingengine.PostingEngineService;
import com.billbull.backend.pos.audit.PosAuditService;
import com.billbull.backend.pos.settings.PosSettings;
import com.billbull.backend.pos.settings.PosSettingsRepository;
import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;
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
                             PosAuditService auditService) {
        this.repo = repo;
        this.invoiceRepo = invoiceRepo;
        this.branchAccessService = branchAccessService;
        this.branchRepository = branchRepository;
        this.postingEngine = postingEngine;
        this.posSettingsRepository = posSettingsRepository;
        this.auditService = auditService;
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
        // Look up by terminalId alone — terminal is already branch-scoped at registration time.
        // Avoids a 400 when the user has "All Branches" selected in the branch switcher.
        if (terminalId != null && !terminalId.isBlank()) {
            return repo.findByTerminalIdAndStatus(terminalId, PosSessionStatus.OPEN);
        }
        // Fallback: try branch-scoped lookup when terminalId is missing
        try {
            Branch branch = branchAccessService.getRequiredCurrentUserBranch();
            List<PosSession> sessions = repo.findByBranchIdAndStatusOrderByOpenedAtDesc(branch.getId(), PosSessionStatus.OPEN);
            return sessions.isEmpty() ? Optional.empty() : Optional.of(sessions.get(0));
        } catch (Exception e) {
            return Optional.empty();
        }
    }

    @Transactional(readOnly = true)
    public PosSession getById(Long id) {
        return repo.findById(id).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "POS session not found: " + id));
    }

    @Transactional
    public PosSession closeSession(Long sessionId, BigDecimal closingCash, String notes,
                                   boolean supervisorApproved) {
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

        session.setClosedBy(currentUser());
        session.setClosedAt(LocalDateTime.now());
        session.setStatus(PosSessionStatus.CLOSED);
        session.setClosingCash(actualClosing);
        session.setExpectedCash(expectedCash);
        session.setCashDifference(actualClosing.subtract(expectedCash));
        session.setNotes(notes);

        // Capture immutable Z-Report snapshot at close time
        String varianceStr = actualClosing.subtract(expectedCash).toPlainString();
        session.setZReportJson(buildZReportSnapshot(session, expectedCash, actualClosing));

        PosSession closed = repo.save(session);

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
        PosSession session = repo.findById(sessionId).orElse(null);
        if (session == null || session.getStatus() != PosSessionStatus.OPEN) return;

        BigDecimal total = nz(invoice.getInvoiceTotal());
        String mode = invoice.getPaymentMode() != null ? invoice.getPaymentMode().toLowerCase() : "";

        session.setInvoiceCount((session.getInvoiceCount() != null ? session.getInvoiceCount() : 0) + 1);
        session.setTotalSales(nz(session.getTotalSales()).add(total));

        if (mode.contains("cash") && mode.contains("card")) {
            session.setTotalMixedSales(nz(session.getTotalMixedSales()).add(total));
        } else if (mode.contains("cash")) {
            session.setTotalCashSales(nz(session.getTotalCashSales()).add(total));
        } else if (mode.contains("card") || mode.contains("credit card")) {
            session.setTotalCardSales(nz(session.getTotalCardSales()).add(total));
        } else if (mode.contains("credit")) {
            session.setTotalCreditSales(nz(session.getTotalCreditSales()).add(total));
        } else {
            session.setTotalCashSales(nz(session.getTotalCashSales()).add(total));
        }
        repo.save(session);
    }

    @Transactional(readOnly = true)
    public Map<String, Object> getXReport(Long sessionId) {
        PosSession session = getById(sessionId);
        List<SalesInvoice> invoices = invoiceRepo.findByPosSessionId(sessionId);

        BigDecimal cashSales = nz(session.getTotalCashSales());
        BigDecimal cardSales = nz(session.getTotalCardSales());
        BigDecimal creditSales = nz(session.getTotalCreditSales());
        BigDecimal mixedSales = nz(session.getTotalMixedSales());
        BigDecimal totalSales = nz(session.getTotalSales());

        BigDecimal cashDropIn = session.getCashMovements().stream()
                .filter(m -> "DROP_IN".equals(m.getMovementType()))
                .map(m -> nz(m.getAmount())).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal cashDropOut = session.getCashMovements().stream()
                .filter(m -> "DROP_OUT".equals(m.getMovementType()))
                .map(m -> nz(m.getAmount())).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal cashDropNet = cashDropIn.subtract(cashDropOut);

        // Derived from actual invoices for richer reporting
        BigDecimal totalTax = invoices.stream()
                .map(inv -> nz(inv.getTaxTotal())).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal salesAmountExTax = totalSales.subtract(totalTax);
        BigDecimal totalDiscount = invoices.stream()
                .map(inv -> nz(inv.getBillDiscountAmount())).reduce(BigDecimal.ZERO, BigDecimal::add);
        int totalItemsSold = invoices.stream()
                .flatMap(inv -> inv.getItems() != null ? inv.getItems().stream() : java.util.stream.Stream.empty())
                .mapToInt(item -> item.getQuantity() != null ? item.getQuantity() : 0).sum();

        long cashInvoiceCount = invoices.stream()
                .filter(inv -> inv.getPaymentMode() != null && inv.getPaymentMode().toLowerCase().contains("cash")
                        && !inv.getPaymentMode().toLowerCase().contains("card")).count();
        long cardInvoiceCount = invoices.stream()
                .filter(inv -> inv.getPaymentMode() != null && (inv.getPaymentMode().toLowerCase().contains("card")
                        || inv.getPaymentMode().toLowerCase().contains("credit card"))).count();
        long creditInvoiceCount = invoices.stream()
                .filter(inv -> inv.getPaymentMode() != null && inv.getPaymentMode().toLowerCase().contains("credit")
                        && !inv.getPaymentMode().toLowerCase().contains("card")).count();

        java.util.Map<String, Object> summary = new java.util.LinkedHashMap<>();
        summary.put("totalSales", totalSales);
        summary.put("cashSales", cashSales);
        summary.put("cardSales", cardSales);
        summary.put("creditSales", creditSales);
        summary.put("mixedSales", mixedSales);
        summary.put("invoiceCount", session.getInvoiceCount() != null ? session.getInvoiceCount() : 0);
        summary.put("openingCash", nz(session.getOpeningCash()));
        summary.put("cashDropIn", cashDropIn);
        summary.put("cashDropOut", cashDropOut);
        summary.put("expectedCash", nz(session.getOpeningCash()).add(cashSales).add(cashDropNet));
        summary.put("totalTax", totalTax);
        summary.put("salesAmountExTax", salesAmountExTax.max(BigDecimal.ZERO));
        summary.put("totalDiscount", totalDiscount);
        summary.put("totalItemsSold", totalItemsSold);
        summary.put("cashInvoiceCount", cashInvoiceCount);
        summary.put("cardInvoiceCount", cardInvoiceCount);
        summary.put("creditInvoiceCount", creditInvoiceCount);
        summary.put("voidItemCount", 0); // tracked via audit log in future

        java.util.Map<String, Object> result = new java.util.LinkedHashMap<>();
        result.put("session", session);
        result.put("invoices", invoices);
        result.put("summary", summary);
        return result;
    }

    @Transactional(readOnly = true)
    public Map<String, Object> getZReport(Long branchId, LocalDate date) {
        List<PosSession> sessions = repo.findByBranchIdAndSessionDateOrderByOpenedAtDesc(branchId, date);
        List<SalesInvoice> invoices = invoiceRepo.findByBranchIdAndPosSessionIdIn(
                branchId, sessions.stream().map(PosSession::getId).toList());

        BigDecimal totalSales = sessions.stream().map(s -> nz(s.getTotalSales())).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal cashSales = sessions.stream().map(s -> nz(s.getTotalCashSales())).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal cardSales = sessions.stream().map(s -> nz(s.getTotalCardSales())).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal creditSales = sessions.stream().map(s -> nz(s.getTotalCreditSales())).reduce(BigDecimal.ZERO, BigDecimal::add);
        int invoiceCount = sessions.stream().mapToInt(s -> s.getInvoiceCount() != null ? s.getInvoiceCount() : 0).sum();

        BigDecimal totalTax = invoices.stream()
                .map(inv -> nz(inv.getTaxTotal())).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal salesAmountExTax = totalSales.subtract(totalTax).max(BigDecimal.ZERO);
        BigDecimal totalDiscount = invoices.stream()
                .map(inv -> nz(inv.getBillDiscountAmount())).reduce(BigDecimal.ZERO, BigDecimal::add);
        int totalItemsSold = invoices.stream()
                .flatMap(inv -> inv.getItems() != null ? inv.getItems().stream() : java.util.stream.Stream.empty())
                .mapToInt(item -> item.getQuantity() != null ? item.getQuantity() : 0).sum();
        long cashInvoiceCount = invoices.stream()
                .filter(inv -> inv.getPaymentMode() != null && inv.getPaymentMode().toLowerCase().contains("cash")
                        && !inv.getPaymentMode().toLowerCase().contains("card")).count();
        long cardInvoiceCount = invoices.stream()
                .filter(inv -> inv.getPaymentMode() != null && (inv.getPaymentMode().toLowerCase().contains("card")
                        || inv.getPaymentMode().toLowerCase().contains("credit card"))).count();
        long creditInvoiceCount = invoices.stream()
                .filter(inv -> inv.getPaymentMode() != null && inv.getPaymentMode().toLowerCase().contains("credit")
                        && !inv.getPaymentMode().toLowerCase().contains("card")).count();

        java.util.Map<String, Object> summary = new java.util.LinkedHashMap<>();
        summary.put("totalSales", totalSales);
        summary.put("cashSales", cashSales);
        summary.put("cardSales", cardSales);
        summary.put("creditSales", creditSales);
        summary.put("invoiceCount", invoiceCount);
        summary.put("sessionCount", sessions.size());
        summary.put("totalTax", totalTax);
        summary.put("salesAmountExTax", salesAmountExTax);
        summary.put("totalDiscount", totalDiscount);
        summary.put("totalItemsSold", totalItemsSold);
        summary.put("cashInvoiceCount", cashInvoiceCount);
        summary.put("cardInvoiceCount", cardInvoiceCount);
        summary.put("creditInvoiceCount", creditInvoiceCount);

        java.util.Map<String, Object> result = new java.util.LinkedHashMap<>();
        result.put("sessions", sessions);
        result.put("invoices", invoices);
        result.put("date", date.toString());
        result.put("summary", summary);
        return result;
    }
}
