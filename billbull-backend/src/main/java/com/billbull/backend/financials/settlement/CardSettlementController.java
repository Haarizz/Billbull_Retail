package com.billbull.backend.financials.settlement;

import com.billbull.backend.security.ModulePermissionService;
import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/settlements")
public class CardSettlementController {

    private static final String MODULE = "finance";

    private final CardSettlementService cardSettlementService;
    private final ModulePermissionService modulePermissionService;

    public CardSettlementController(CardSettlementService cardSettlementService, ModulePermissionService modulePermissionService) {
        this.cardSettlementService = cardSettlementService;
        this.modulePermissionService = modulePermissionService;
    }

    @GetMapping
    public ResponseEntity<List<CardSettlement>> getAllSettlements() {
        modulePermissionService.requireCanView(MODULE);
        return ResponseEntity.ok(cardSettlementService.getAllSettlements());
    }

    @GetMapping("/{id}")
    public ResponseEntity<CardSettlement> getSettlement(@PathVariable Long id) {
        modulePermissionService.requireCanView(MODULE);
        return ResponseEntity.ok(cardSettlementService.getSettlement(id));
    }

    @PostMapping
    public ResponseEntity<CardSettlement> createSettlement(@RequestBody CardSettlement settlement) {
        modulePermissionService.requireCanCreate(MODULE);
        return ResponseEntity.ok(cardSettlementService.createSettlement(settlement));
    }

    @PutMapping("/{id}/status")
    public ResponseEntity<CardSettlement> updateStatus(@PathVariable Long id, @RequestParam String status) {
        modulePermissionService.requireCanEdit(MODULE);
        return ResponseEntity.ok(cardSettlementService.updateStatus(id, status));
    }
}
