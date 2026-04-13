package com.billbull.backend.financials.settlement;

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

    private final CardSettlementService cardSettlementService;

    public CardSettlementController(CardSettlementService cardSettlementService) {
        this.cardSettlementService = cardSettlementService;
    }

    @GetMapping
    public ResponseEntity<List<CardSettlement>> getAllSettlements() {
        return ResponseEntity.ok(cardSettlementService.getAllSettlements());
    }

    @GetMapping("/{id}")
    public ResponseEntity<CardSettlement> getSettlement(@PathVariable Long id) {
        return ResponseEntity.ok(cardSettlementService.getSettlement(id));
    }

    @PostMapping
    public ResponseEntity<CardSettlement> createSettlement(@RequestBody CardSettlement settlement) {
        return ResponseEntity.ok(cardSettlementService.createSettlement(settlement));
    }

    @PutMapping("/{id}/status")
    public ResponseEntity<CardSettlement> updateStatus(@PathVariable Long id, @RequestParam String status) {
        return ResponseEntity.ok(cardSettlementService.updateStatus(id, status));
    }
}
