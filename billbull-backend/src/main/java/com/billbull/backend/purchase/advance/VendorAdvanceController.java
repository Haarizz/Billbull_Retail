package com.billbull.backend.purchase.advance;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

import com.billbull.backend.security.ModulePermissionService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/purchase/vendor-advances")
@PreAuthorize("isAuthenticated()")
public class VendorAdvanceController {

    private static final String MODULE = "purchases";

    private final VendorAdvanceService service;
    private final ModulePermissionService modulePermissionService;

    public VendorAdvanceController(VendorAdvanceService service,
                                   ModulePermissionService modulePermissionService) {
        this.service = service;
        this.modulePermissionService = modulePermissionService;
    }

    @GetMapping("/vendor/{vendorId}")
    public ResponseEntity<List<VendorAdvance>> getByVendor(@PathVariable Long vendorId) {
        modulePermissionService.requireCanView(MODULE);
        return ResponseEntity.ok(service.getByVendor(vendorId));
    }

    @GetMapping("/vendor/{vendorId}/open")
    public ResponseEntity<List<VendorAdvance>> getOpenByVendor(@PathVariable Long vendorId) {
        modulePermissionService.requireCanView(MODULE);
        return ResponseEntity.ok(service.getOpenByVendor(vendorId));
    }

    @PostMapping
    public ResponseEntity<VendorAdvance> pay(@RequestBody VendorAdvance advance) {
        modulePermissionService.requireCanCreate(MODULE);
        return ResponseEntity.ok(service.pay(advance));
    }

    @PostMapping("/{id}/apply")
    public ResponseEntity<VendorAdvance> apply(
            @PathVariable Long id,
            @RequestBody Map<String, Object> body) {
        modulePermissionService.requireCanEdit(MODULE);
        String piNumber = body.get("piNumber").toString();
        BigDecimal amount = new BigDecimal(body.get("amount").toString());
        return ResponseEntity.ok(service.applyToInvoice(id, piNumber, amount));
    }

    @PostMapping("/{id}/refund")
    public ResponseEntity<VendorAdvance> refund(@PathVariable Long id) {
        modulePermissionService.requireCanEdit(MODULE);
        return ResponseEntity.ok(service.refund(id));
    }
}
