package com.billbull.backend.sales.advance;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import com.billbull.backend.security.ModulePermissionService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/sales/advance-applications")
@PreAuthorize("isAuthenticated()")
public class AdvanceApplicationController {

    private static final String MODULE = "sales";

    private final AdvanceApplicationService service;
    private final ModulePermissionService modulePermissionService;

    public AdvanceApplicationController(AdvanceApplicationService service,
                                        ModulePermissionService modulePermissionService) {
        this.service = service;
        this.modulePermissionService = modulePermissionService;
    }

    @GetMapping("/customer/{customerCode}/open-advances")
    @PreAuthorize("@modulePermissionService.canView('permissions.customer.advance.view')")
    public ResponseEntity<List<AdvanceApplicationService.AdvanceBalance>> getOpenAdvances(
            @PathVariable String customerCode) {
        return ResponseEntity.ok(service.findOpenAdvances(customerCode));
    }

    @GetMapping("/customer/{customerCode}/has-history")
    @PreAuthorize("@modulePermissionService.canView('permissions.customer.advance.view')")
    public ResponseEntity<Map<String, Boolean>> hasAdvanceHistory(@PathVariable String customerCode) {
        return ResponseEntity.ok(Map.of("hasHistory", service.hasAdvanceHistory(customerCode)));
    }

    @GetMapping("/customer/{customerCode}/summary")
    @PreAuthorize("@modulePermissionService.canView('permissions.customer.advance.view')")
    public ResponseEntity<AdvanceApplicationService.CustomerAdvanceSummary> getSummary(@PathVariable String customerCode) {
        return ResponseEntity.ok(service.getCustomerAdvanceSummary(customerCode));
    }

    @GetMapping("/customer/{customerCode}/history")
    @PreAuthorize("@modulePermissionService.canView('permissions.customer.advance.view')")
    public ResponseEntity<com.billbull.backend.util.PageResponse<AdvanceApplicationService.AdvanceHistoryItem>> getHistory(
            @PathVariable String customerCode,
            @RequestParam(defaultValue = "All") String filter,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {
        return ResponseEntity.ok(service.getCustomerAdvanceHistory(customerCode, filter, page, size));
    }

    @PostMapping("/apply")
    @PreAuthorize("@modulePermissionService.canView('permissions.customer.advance.apply')")
    public ResponseEntity<AdvanceApplication> apply(@RequestBody Map<String, Object> body) {
        Long advanceReceiptId = Long.valueOf(body.get("advanceReceiptId").toString());
        String invoiceNumber  = body.get("invoiceNumber").toString();
        BigDecimal amount     = new BigDecimal(body.get("amount").toString());
        LocalDate appliedDate = body.containsKey("appliedDate")
                ? LocalDate.parse(body.get("appliedDate").toString())
                : LocalDate.now();
        return ResponseEntity.ok(service.apply(advanceReceiptId, invoiceNumber, amount, appliedDate));
    }

    @PostMapping("/apply-against-outstanding")
    @PreAuthorize("@modulePermissionService.canView('permissions.customer.advance.apply')")
    public ResponseEntity<Map<String, BigDecimal>> applyAgainstOutstanding(@RequestBody Map<String, Object> body) {
        String customerCode  = body.get("customerCode").toString();
        Long advanceReceiptId = Long.valueOf(body.get("advanceReceiptId").toString());
        BigDecimal applied = service.applyAgainstOutstandingInvoices(customerCode, advanceReceiptId);
        return ResponseEntity.ok(Map.of("applied", applied));
    }

    @PostMapping("/refund")
    @PreAuthorize("@modulePermissionService.canView('permissions.customer.advance.refund')")
    public ResponseEntity<AdvanceApplication> refund(@RequestBody Map<String, Object> body) {
        Long advanceReceiptId = Long.valueOf(body.get("advanceReceiptId").toString());
        BigDecimal amount     = new BigDecimal(body.get("amount").toString());
        String paymentMode    = body.getOrDefault("paymentMode", "Bank").toString();
        rejectLegacyTerminalId(body, "refunding an advance");
        // Stated by the caller, validated server-side, never inferred. Required for a cash
        // refund from a till; ignored for non-cash modes, which move no drawer cash.
        Long posSessionId = body.get("posSessionId") != null
                ? Long.valueOf(body.get("posSessionId").toString()) : null;
        // Where the notes come from: a POS till, or the office safe. Declared, not derived from
        // whether a session happens to be present -- see AdvanceRefundCashSource.
        Object rawSource = body.get("cashSource");
        AdvanceRefundCashSource cashSource = AdvanceRefundCashSource.parse(
                rawSource != null ? rawSource.toString() : null);
        if (rawSource != null && cashSource == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Unknown cashSource \"" + rawSource + "\". Use POS_DRAWER or BACK_OFFICE.");
        }
        return ResponseEntity.ok(
                service.refund(advanceReceiptId, amount, paymentMode, posSessionId, cashSource));
    }

    @PostMapping("/receive")
    @PreAuthorize("@modulePermissionService.canView('permissions.customer.advance.receive')")
    public ResponseEntity<com.billbull.backend.financials.receiptvoucher.ReceiptVoucher> receiveAdvance(@RequestBody Map<String, Object> body) {
        String customerCode = body.get("customerCode").toString();
        BigDecimal amount = new BigDecimal(body.get("amount").toString());
        String paymentMode = body.getOrDefault("paymentMode", "Cash").toString();
        String reference = body.containsKey("reference") ? body.get("reference").toString() : null;
        rejectLegacyTerminalId(body, "receiving an advance");
        // The drawer session is stated by the caller and validated server-side; it is never
        // resolved from a terminal id or from "whatever session is currently open".
        Long posSessionId = body.get("posSessionId") != null
                ? Long.valueOf(body.get("posSessionId").toString()) : null;
        String memberName = body.get("memberName") != null ? body.get("memberName").toString() : null;
        String notes = body.get("notes") != null ? body.get("notes").toString() : null;
        return ResponseEntity.ok(service.receiveAdvance(
                customerCode, amount, paymentMode, reference, posSessionId, memberName, notes));
    }

    /**
     * Refuses a request still carrying the retired {@code terminalId} field.
     *
     * <p>{@code terminalId} used to be resolved into a drawer session with
     * {@code getActiveSession(terminalId)} -- i.e. "whichever session is open at that terminal
     * right now". That is session inference, and it failed in both directions: it could attribute
     * cash to a session the caller never named, and its {@code ifPresent} form silently produced
     * an unattributed voucher when nothing was open, while the money moved regardless.
     *
     * <p>Translating it here would reintroduce exactly that lookup, so the field is rejected
     * instead of honoured or ignored. Ignoring it would be worse than either: a stale client
     * would appear to succeed while creating a sessionless POS cash advance -- precisely the
     * defect this release exists to remove.
     *
     * <p>Same stance, and the same shape of message, as
     * {@code PosPaymentAllocationResolver#rejectLegacyAdvanceScalar} takes for the retired
     * {@code advanceAmount} scalar.
     */
    private void rejectLegacyTerminalId(Map<String, Object> body, String operation) {
        Object legacy = body.get("terminalId");
        if (legacy == null || legacy.toString().isBlank()) return;
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                "This POS terminal is running an outdated version. Reload the page and try again. "
                        + "(terminalId is no longer accepted when " + operation + "; the collecting POS "
                        + "session must be stated explicitly as posSessionId, because a terminal id "
                        + "cannot identify which drawer is accountable for the cash.)");
    }
}
