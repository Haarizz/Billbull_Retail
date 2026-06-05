package com.billbull.backend.sales.advance;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/sales/advance-applications")
@CrossOrigin(origins = "*")
@PreAuthorize("hasAnyRole('ADMIN', 'ACCOUNTANT', 'MANAGER')")
public class AdvanceApplicationController {

    private final AdvanceApplicationService service;

    public AdvanceApplicationController(AdvanceApplicationService service) {
        this.service = service;
    }

    @GetMapping("/customer/{customerCode}/open-advances")
    public ResponseEntity<List<AdvanceApplicationService.AdvanceBalance>> getOpenAdvances(
            @PathVariable String customerCode) {
        return ResponseEntity.ok(service.findOpenAdvances(customerCode));
    }

    @PostMapping("/apply")
    public ResponseEntity<AdvanceApplication> apply(@RequestBody Map<String, Object> body) {
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
        Long advanceReceiptId = Long.valueOf(body.get("advanceReceiptId").toString());
        BigDecimal amount     = new BigDecimal(body.get("amount").toString());
        String paymentMode    = body.getOrDefault("paymentMode", "Bank").toString();
        return ResponseEntity.ok(service.refund(advanceReceiptId, amount, paymentMode));
    }
}
