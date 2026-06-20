package com.billbull.backend.pos.held;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * POS Hold endpoints: park the current cart, list the session's held carts, and
 * recall one (which removes it from the held list and returns its cart payload).
 */
@RestController
@RequestMapping("/api/pos/held-sales")
@CrossOrigin
public class PosHeldSaleController {

    private final PosHeldSaleService service;

    public PosHeldSaleController(PosHeldSaleService service) {
        this.service = service;
    }

    @PostMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosHeldSale> hold(@RequestBody PosHeldSaleRequest request) {
        return ResponseEntity.ok(service.hold(request));
    }

    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<PosHeldSale>> list(@RequestParam Long sessionId) {
        return ResponseEntity.ok(service.listForSession(sessionId));
    }

    @PostMapping("/{id}/recall")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosHeldSale> recall(@PathVariable Long id) {
        return ResponseEntity.ok(service.recall(id));
    }
}
