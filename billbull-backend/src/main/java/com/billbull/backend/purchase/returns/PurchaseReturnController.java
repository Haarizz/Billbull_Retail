package com.billbull.backend.purchase.returns;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/purchase/returns")
public class PurchaseReturnController {

    private final PurchaseReturnService purchaseReturnService;

    public PurchaseReturnController(PurchaseReturnService purchaseReturnService) {
        this.purchaseReturnService = purchaseReturnService;
    }

    @GetMapping
    public List<PurchaseReturn> list(@RequestParam(required = false) Long branchId) {
        if (branchId != null) {
            return purchaseReturnService.findByBranch(branchId);
        }
        return purchaseReturnService.findAll();
    }

    @GetMapping("/{id}")
    public ResponseEntity<PurchaseReturn> get(@PathVariable Long id) {
        return ResponseEntity.ok(purchaseReturnService.findById(id));
    }

    @PostMapping
    public ResponseEntity<PurchaseReturn> create(@RequestBody PurchaseReturn purchaseReturn) {
        return ResponseEntity.ok(purchaseReturnService.create(purchaseReturn));
    }

    @PostMapping("/{id}/approve")
    public ResponseEntity<PurchaseReturn> approve(@PathVariable Long id) {
        return ResponseEntity.ok(purchaseReturnService.approve(id));
    }

    @PostMapping("/{id}/cancel")
    public ResponseEntity<PurchaseReturn> cancel(@PathVariable Long id) {
        return ResponseEntity.ok(purchaseReturnService.cancel(id));
    }
}
