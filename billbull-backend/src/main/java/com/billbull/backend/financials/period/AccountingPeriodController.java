package com.billbull.backend.financials.period;

import com.billbull.backend.security.ModulePermissionService;
import java.util.List;
import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/financials/periods")
@PreAuthorize("isAuthenticated()")
public class AccountingPeriodController {

    private static final String MODULE = "finance";

    private final AccountingPeriodService service;
    private final ModulePermissionService modulePermissionService;

    public AccountingPeriodController(AccountingPeriodService service, ModulePermissionService modulePermissionService) {
        this.service = service;
        this.modulePermissionService = modulePermissionService;
    }

    @GetMapping
    public ResponseEntity<List<AccountingPeriod>> getAllPeriods() {
        modulePermissionService.requireCanView(MODULE);
        return ResponseEntity.ok(service.getAllPeriods());
    }

    @GetMapping("/open")
    public ResponseEntity<List<AccountingPeriod>> getOpenPeriods() {
        modulePermissionService.requireCanView(MODULE);
        return ResponseEntity.ok(service.getOpenPeriods());
    }

    @PostMapping
    public ResponseEntity<AccountingPeriod> createPeriod(@RequestBody AccountingPeriod period) {
        modulePermissionService.requireCanCreate(MODULE);
        return ResponseEntity.ok(service.createPeriod(period));
    }

    @PostMapping("/{id}/close")
    public ResponseEntity<AccountingPeriod> closePeriod(
            @PathVariable Long id,
            @RequestBody(required = false) Map<String, String> payload) {
        modulePermissionService.requireCanEdit(MODULE);
        String closedBy = payload != null ? payload.getOrDefault("closedBy", "System") : "System";
        return ResponseEntity.ok(service.closePeriod(id, closedBy));
    }

    @PostMapping("/{id}/reopen")
    public ResponseEntity<AccountingPeriod> reopenPeriod(@PathVariable Long id) {
        modulePermissionService.requireCanEdit(MODULE);
        return ResponseEntity.ok(service.reopenPeriod(id));
    }
}
