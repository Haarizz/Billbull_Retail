package com.billbull.backend.pos.session;

import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;
import com.billbull.backend.settings.branch.Branch;
import com.billbull.backend.settings.branch.BranchAccessService;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

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

    public PosSessionService(PosSessionRepository repo,
                             SalesInvoiceRepository invoiceRepo,
                             BranchAccessService branchAccessService) {
        this.repo = repo;
        this.invoiceRepo = invoiceRepo;
        this.branchAccessService = branchAccessService;
    }

    private String currentUser() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return auth != null ? auth.getName() : "system";
    }

    @Transactional
    public PosSession openSession(String terminalId, String counterName, Double openingCash) {
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
        session.setOpeningCash(openingCash != null ? openingCash : 0.0);
        session.setTotalSales(0.0);
        session.setTotalCashSales(0.0);
        session.setTotalCardSales(0.0);
        session.setTotalCreditSales(0.0);
        session.setTotalMixedSales(0.0);
        session.setInvoiceCount(0);
        return repo.save(session);
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
    public PosSession closeSession(Long sessionId, Double closingCash, String notes) {
        PosSession session = getById(sessionId);
        if (session.getStatus() != PosSessionStatus.OPEN) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Session is already closed.");
        }

        // Compute expected cash = opening + cash drops in - cash drops out + cash sales
        double cashDropNet = session.getCashMovements().stream()
                .mapToDouble(m -> "DROP_IN".equals(m.getMovementType()) ? m.getAmount() : -m.getAmount())
                .sum();
        double expectedCash = (session.getOpeningCash() != null ? session.getOpeningCash() : 0)
                + (session.getTotalCashSales() != null ? session.getTotalCashSales() : 0)
                + cashDropNet;

        session.setClosedBy(currentUser());
        session.setClosedAt(LocalDateTime.now());
        session.setStatus(PosSessionStatus.CLOSED);
        session.setClosingCash(closingCash != null ? closingCash : 0.0);
        session.setExpectedCash(expectedCash);
        session.setCashDifference(closingCash != null ? closingCash - expectedCash : 0.0);
        session.setNotes(notes);
        return repo.save(session);
    }

    @Transactional
    public PosCashMovement addCashMovement(Long sessionId, String movementType, Double amount, String description) {
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
        return movement;
    }

    @Transactional
    public void recordInvoiceOnSession(Long sessionId, SalesInvoice invoice) {
        if (sessionId == null) return;
        PosSession session = repo.findById(sessionId).orElse(null);
        if (session == null || session.getStatus() != PosSessionStatus.OPEN) return;

        double total = invoice.getInvoiceTotal() != null ? invoice.getInvoiceTotal() : 0;
        String mode = invoice.getPaymentMode() != null ? invoice.getPaymentMode().toLowerCase() : "";

        session.setInvoiceCount((session.getInvoiceCount() != null ? session.getInvoiceCount() : 0) + 1);
        session.setTotalSales((session.getTotalSales() != null ? session.getTotalSales() : 0) + total);

        if (mode.contains("cash") && mode.contains("card")) {
            session.setTotalMixedSales((session.getTotalMixedSales() != null ? session.getTotalMixedSales() : 0) + total);
        } else if (mode.contains("cash")) {
            session.setTotalCashSales((session.getTotalCashSales() != null ? session.getTotalCashSales() : 0) + total);
        } else if (mode.contains("card") || mode.contains("credit card")) {
            session.setTotalCardSales((session.getTotalCardSales() != null ? session.getTotalCardSales() : 0) + total);
        } else if (mode.contains("credit")) {
            session.setTotalCreditSales((session.getTotalCreditSales() != null ? session.getTotalCreditSales() : 0) + total);
        } else {
            session.setTotalCashSales((session.getTotalCashSales() != null ? session.getTotalCashSales() : 0) + total);
        }
        repo.save(session);
    }

    @Transactional(readOnly = true)
    public Map<String, Object> getXReport(Long sessionId) {
        PosSession session = getById(sessionId);
        List<SalesInvoice> invoices = invoiceRepo.findByPosSessionId(sessionId);

        double cashSales = session.getTotalCashSales() != null ? session.getTotalCashSales() : 0;
        double cardSales = session.getTotalCardSales() != null ? session.getTotalCardSales() : 0;
        double creditSales = session.getTotalCreditSales() != null ? session.getTotalCreditSales() : 0;
        double mixedSales = session.getTotalMixedSales() != null ? session.getTotalMixedSales() : 0;
        double totalSales = session.getTotalSales() != null ? session.getTotalSales() : 0;

        double cashDropIn = session.getCashMovements().stream()
                .filter(m -> "DROP_IN".equals(m.getMovementType())).mapToDouble(PosCashMovement::getAmount).sum();
        double cashDropOut = session.getCashMovements().stream()
                .filter(m -> "DROP_OUT".equals(m.getMovementType())).mapToDouble(PosCashMovement::getAmount).sum();
        double cashDropNet = cashDropIn - cashDropOut;

        // Derived from actual invoices for richer reporting
        double totalTax = invoices.stream()
                .mapToDouble(inv -> inv.getTaxTotal() != null ? inv.getTaxTotal() : 0).sum();
        double salesAmountExTax = totalSales - totalTax;
        double totalDiscount = invoices.stream()
                .mapToDouble(inv -> inv.getBillDiscountAmount() != null ? inv.getBillDiscountAmount() : 0).sum();
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
        summary.put("openingCash", session.getOpeningCash() != null ? session.getOpeningCash() : 0);
        summary.put("cashDropIn", cashDropIn);
        summary.put("cashDropOut", cashDropOut);
        summary.put("expectedCash", (session.getOpeningCash() != null ? session.getOpeningCash() : 0) + cashSales + cashDropNet);
        summary.put("totalTax", totalTax);
        summary.put("salesAmountExTax", Math.max(0, salesAmountExTax));
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

        double totalSales = sessions.stream().mapToDouble(s -> s.getTotalSales() != null ? s.getTotalSales() : 0).sum();
        double cashSales = sessions.stream().mapToDouble(s -> s.getTotalCashSales() != null ? s.getTotalCashSales() : 0).sum();
        double cardSales = sessions.stream().mapToDouble(s -> s.getTotalCardSales() != null ? s.getTotalCardSales() : 0).sum();
        double creditSales = sessions.stream().mapToDouble(s -> s.getTotalCreditSales() != null ? s.getTotalCreditSales() : 0).sum();
        int invoiceCount = sessions.stream().mapToInt(s -> s.getInvoiceCount() != null ? s.getInvoiceCount() : 0).sum();

        double totalTax = invoices.stream()
                .mapToDouble(inv -> inv.getTaxTotal() != null ? inv.getTaxTotal() : 0).sum();
        double salesAmountExTax = Math.max(0, totalSales - totalTax);
        double totalDiscount = invoices.stream()
                .mapToDouble(inv -> inv.getBillDiscountAmount() != null ? inv.getBillDiscountAmount() : 0).sum();
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
