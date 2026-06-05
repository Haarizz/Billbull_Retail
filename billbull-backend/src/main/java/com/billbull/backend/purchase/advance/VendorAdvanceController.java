package com.billbull.backend.purchase.advance;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/purchase/vendor-advances")
@CrossOrigin(origins = "*")
@PreAuthorize("hasAnyRole('ADMIN', 'ACCOUNTANT', 'MANAGER')")
public class VendorAdvanceController {

    private final VendorAdvanceService service;

    public VendorAdvanceController(VendorAdvanceService service) {
        this.service = service;
    }

    @GetMapping("/vendor/{vendorId}")
    public ResponseEntity<List<VendorAdvance>> getByVendor(@PathVariable Long vendorId) {
        return ResponseEntity.ok(service.getByVendor(vendorId));
    }

    @GetMapping("/vendor/{vendorId}/open")
    public ResponseEntity<List<VendorAdvance>> getOpenByVendor(@PathVariable Long vendorId) {
        return ResponseEntity.ok(service.getOpenByVendor(vendorId));
    }

    @PostMapping
    public ResponseEntity<VendorAdvance> pay(@RequestBody VendorAdvance advance) {
        return ResponseEntity.ok(service.pay(advance));
    }

    @PostMapping("/{id}/apply")
    public ResponseEntity<VendorAdvance> apply(
            @PathVariable Long id,
            @RequestBody Map<String, Object> body) {
        String piNumber = body.get("piNumber").toString();
        BigDecimal amount = new BigDecimal(body.get("amount").toString());
        return ResponseEntity.ok(service.applyToInvoice(id, piNumber, amount));
    }

    @PostMapping("/{id}/refund")
    public ResponseEntity<VendorAdvance> refund(@PathVariable Long id) {
        return ResponseEntity.ok(service.refund(id));
    }
}
