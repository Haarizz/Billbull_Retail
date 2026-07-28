package com.billbull.backend.sales.advance;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import com.billbull.backend.security.ModulePermissionService;
import org.springframework.http.ResponseEntity;
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
    @PreAuthorize("@modulePermissionService.hasPermission('permissions.customer.advance.view')")
    public ResponseEntity<List<AdvanceApplicationService.AdvanceBalance>> getOpenAdvances(
            @PathVariable String customerCode) {
        return ResponseEntity.ok(service.findOpenAdvances(customerCode));
    }

    @GetMapping("/customer/{customerCode}/has-history")
    @PreAuthorize("@modulePermissionService.hasPermission('permissions.customer.advance.view')")
    public ResponseEntity<Map<String, Boolean>> hasAdvanceHistory(@PathVariable String customerCode) {
        return ResponseEntity.ok(Map.of("hasHistory", service.hasAdvanceHistory(customerCode)));
    }

    @GetMapping("/customer/{customerCode}/summary")
    @PreAuthorize("@modulePermissionService.hasPermission('permissions.customer.advance.view')")
    public ResponseEntity<AdvanceApplicationService.CustomerAdvanceSummary> getSummary(@PathVariable String customerCode) {
        return ResponseEntity.ok(service.getCustomerAdvanceSummary(customerCode));
    }

    @GetMapping("/customer/{customerCode}/history")
    @PreAuthorize("@modulePermissionService.hasPermission('permissions.customer.advance.view')")
    public ResponseEntity<com.billbull.backend.util.PageResponse<AdvanceApplicationService.AdvanceHistoryItem>> getHistory(
            @PathVariable String customerCode,
            @RequestParam(defaultValue = "All") String filter,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {
        return ResponseEntity.ok(service.getCustomerAdvanceHistory(customerCode, filter, page, size));
    }

    @PostMapping("/apply")
    @PreAuthorize("@modulePermissionService.hasPermission('permissions.customer.advance.apply')")
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
    @PreAuthorize("@modulePermissionService.hasPermission('permissions.customer.advance.apply')")
    public ResponseEntity<Map<String, BigDecimal>> applyAgainstOutstanding(@RequestBody Map<String, Object> body) {
        String customerCode  = body.get("customerCode").toString();
        Long advanceReceiptId = Long.valueOf(body.get("advanceReceiptId").toString());
        BigDecimal applied = service.applyAgainstOutstandingInvoices(customerCode, advanceReceiptId);
        return ResponseEntity.ok(Map.of("applied", applied));
    }

    @PostMapping("/refund")
    @PreAuthorize("@modulePermissionService.hasPermission('permissions.customer.advance.refund')")
    public ResponseEntity<AdvanceApplication> refund(@RequestBody Map<String, Object> body) {
        Long advanceReceiptId = Long.valueOf(body.get("advanceReceiptId").toString());
        BigDecimal amount     = new BigDecimal(body.get("amount").toString());
        String paymentMode    = body.getOrDefault("paymentMode", "Bank").toString();
        return ResponseEntity.ok(service.refund(advanceReceiptId, amount, paymentMode));
    }

    @PostMapping("/receive")
    @PreAuthorize("@modulePermissionService.hasPermission('permissions.customer.advance.receive')")
    public ResponseEntity<com.billbull.backend.financials.receiptvoucher.ReceiptVoucher> receiveAdvance(@RequestBody Map<String, Object> body) {
        String customerCode = body.get("customerCode").toString();
        BigDecimal amount = new BigDecimal(body.get("amount").toString());
        String paymentMode = body.getOrDefault("paymentMode", "Cash").toString();
        String reference = body.containsKey("reference") ? body.get("reference").toString() : null;
        String terminalId = body.containsKey("terminalId") ? body.get("terminalId").toString() : null;
        return ResponseEntity.ok(service.receiveAdvance(customerCode, amount, paymentMode, reference, terminalId));
    }
}
