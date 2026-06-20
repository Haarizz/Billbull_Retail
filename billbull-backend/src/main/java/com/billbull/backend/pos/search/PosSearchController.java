package com.billbull.backend.pos.search;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

/**
 * Unified POS search/scan resolver endpoint plus credit balance and batch check lookups.
 */
@RestController
@RequestMapping("/api/pos")
@CrossOrigin
public class PosSearchController {

    private final PosSearchService service;
    private final PosLookupService lookupService;

    public PosSearchController(PosSearchService service, PosLookupService lookupService) {
        this.service = service;
        this.lookupService = lookupService;
    }

    @GetMapping("/resolve")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosResolveResponse> resolve(@RequestParam(name = "q", defaultValue = "") String q) {
        return ResponseEntity.ok(service.resolve(q));
    }

    /**
     * Credit balance check: given a customer code / mobile / phone / email / name,
     * returns outstanding AR, credit limit, and advance (deposit) balance.
     */
    @GetMapping("/credit-balance")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosCreditBalanceResponse> creditBalance(@RequestParam(name = "q", defaultValue = "") String q) {
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
        return ResponseEntity.ok(lookupService.batchCheck(batchNumber, invoiceNumber, itemCode, customerMobile));
    }
}
