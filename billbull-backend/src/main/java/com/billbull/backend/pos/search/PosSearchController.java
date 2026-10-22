package com.billbull.backend.pos.search;

import com.billbull.backend.pos.auth.PosTillPermission;
import com.billbull.backend.security.ModulePermissionService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * Unified POS search/scan resolver endpoint plus credit balance and batch check lookups.
 *
 * <p>Only the till calls these, and they return prices and stock, customer balances and sold
 * invoices, so each requires the till permission. Customer and invoice results are further
 * limited to the caller's branch scope inside {@link PosLookupService}.
 */
@RestController
@RequestMapping("/api/pos")
@CrossOrigin
public class PosSearchController {

    private final PosSearchService service;
    private final PosLookupService lookupService;
    private final ModulePermissionService modulePermissionService;
    private final com.billbull.backend.inventory.product.ProductCostMasking costMasking;

    public PosSearchController(PosSearchService service, PosLookupService lookupService,
                               ModulePermissionService modulePermissionService,
                               com.billbull.backend.inventory.product.ProductCostMasking costMasking) {
        this.costMasking = costMasking;
        this.service = service;
        this.lookupService = lookupService;
        this.modulePermissionService = modulePermissionService;
    }

    private void requireTillAccess() {
        modulePermissionService.requireCanView(PosTillPermission.MODULE);
    }

    @GetMapping("/resolve")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<?> resolve(@RequestParam(name = "q", defaultValue = "") String q) {
        requireTillAccess();
        // The scanned product carries the full aggregate; cost stays only where it is the
        // till's price floor unless the caller may see cost (ProductCostMasking).
        return ResponseEntity.ok(costMasking.forCaller(service.resolve(q), true));
    }

    /**
     * Credit balance check: given a customer code / mobile / phone / email / name,
     * returns outstanding AR, credit limit, and advance (deposit) balance.
     */
    @GetMapping("/credit-balance")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosCreditBalanceResponse> creditBalance(@RequestParam(name = "q", defaultValue = "") String q) {
        requireTillAccess();
        return ResponseEntity.ok(lookupService.creditBalance(q));
    }

    /**
     * Batch / sold-item check: search sold invoice items by batch number or invoice number.
     * Serial number concept is not implemented yet — batch-only for now.
     */
    @GetMapping("/batch-check")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosBatchCheckResponse> batchCheck(
            @RequestParam(name = "batchNumber", defaultValue = "") String batchNumber,
            @RequestParam(name = "invoiceNumber", defaultValue = "") String invoiceNumber,
            @RequestParam(name = "itemCode", defaultValue = "") String itemCode,
            @RequestParam(name = "customerMobile", defaultValue = "") String customerMobile) {
        requireTillAccess();
        return ResponseEntity.ok(lookupService.batchCheck(batchNumber, invoiceNumber, itemCode, customerMobile));
    }

    /**
     * POS History tab: recent invoices for a given customer code (last 20).
     */
    @GetMapping("/customer-history")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<Map<String, Object>>> customerHistory(
            @RequestParam(name = "customerCode") String customerCode) {
        requireTillAccess();
        return ResponseEntity.ok(lookupService.customerHistory(customerCode));
    }
}
