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
    public ResponseEntity<List<AdvanceApplicationService.AdvanceBalance>> getOpenAdvances(
            @PathVariable String customerCode) {
        modulePermissionService.requireCanView(MODULE);
        return ResponseEntity.ok(service.findOpenAdvances(customerCode));
    }

    @PostMapping("/apply")
    public ResponseEntity<AdvanceApplication> apply(@RequestBody Map<String, Object> body) {
        modulePermissionService.requireCanCreate(MODULE);
        Long advanceReceiptId = Long.valueOf(body.get("advanceReceiptId").toString());
        String invoiceNumber  = body.get("invoiceNumber").toString();
        BigDecimal amount     = new BigDecimal(body.get("amount").toString());
        LocalDate appliedDate = body.containsKey("appliedDate")
                ? LocalDate.parse(body.get("appliedDate").toString())
                : LocalDate.now();
        return ResponseEntity.ok(service.apply(advanceReceiptId, invoiceNumber, amount, appliedDate));
    }

    @PostMapping("/refund")
    public ResponseEntity<AdvanceApplication> refund(@RequestBody Map<String, Object> body) {
        modulePermissionService.requireCanCreate(MODULE);
        Long advanceReceiptId = Long.valueOf(body.get("advanceReceiptId").toString());
        BigDecimal amount     = new BigDecimal(body.get("amount").toString());
        String paymentMode    = body.getOrDefault("paymentMode", "Bank").toString();
        return ResponseEntity.ok(service.refund(advanceReceiptId, amount, paymentMode));
    }
}
