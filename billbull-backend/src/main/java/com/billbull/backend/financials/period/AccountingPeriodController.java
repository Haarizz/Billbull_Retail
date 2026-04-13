package com.billbull.backend.financials.period;

import java.util.List;
import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/financials/periods")
@CrossOrigin(origins = "*")
@PreAuthorize("hasAnyRole('ADMIN', 'ACCOUNTANT')")
public class AccountingPeriodController {

    private final AccountingPeriodService service;

    public AccountingPeriodController(AccountingPeriodService service) {
        this.service = service;
    }

    @GetMapping
    public ResponseEntity<List<AccountingPeriod>> getAllPeriods() {
        return ResponseEntity.ok(service.getAllPeriods());
    }

    @GetMapping("/open")
    public ResponseEntity<List<AccountingPeriod>> getOpenPeriods() {
        return ResponseEntity.ok(service.getOpenPeriods());
    }

    @PostMapping
    public ResponseEntity<AccountingPeriod> createPeriod(@RequestBody AccountingPeriod period) {
        return ResponseEntity.ok(service.createPeriod(period));
    }

    @PostMapping("/{id}/close")
    public ResponseEntity<AccountingPeriod> closePeriod(
            @PathVariable Long id,
            @RequestBody(required = false) Map<String, String> payload) {
        String closedBy = payload != null ? payload.getOrDefault("closedBy", "System") : "System";
        return ResponseEntity.ok(service.closePeriod(id, closedBy));
    }

    @PostMapping("/{id}/reopen")
    public ResponseEntity<AccountingPeriod> reopenPeriod(@PathVariable Long id) {
        return ResponseEntity.ok(service.reopenPeriod(id));
    }
}
