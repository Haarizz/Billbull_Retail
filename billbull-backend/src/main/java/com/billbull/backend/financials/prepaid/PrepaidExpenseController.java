package com.billbull.backend.financials.prepaid;

import com.billbull.backend.security.ModulePermissionService;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/financials/prepaid-expenses")
public class PrepaidExpenseController {

    private static final String MODULE = "finance";

    private final PrepaidExpenseService service;
    private final ModulePermissionService modulePermissionService;

    public PrepaidExpenseController(PrepaidExpenseService service, ModulePermissionService modulePermissionService) {
        this.service = service;
        this.modulePermissionService = modulePermissionService;
    }

    @GetMapping
    public List<PrepaidExpense> getAll() {
        modulePermissionService.requireCanView(MODULE);
        return service.findAll();
    }

    @PostMapping
    public ResponseEntity<PrepaidExpense> create(@RequestBody PrepaidExpense pe) {
        modulePermissionService.requireCanCreate(MODULE);
        return ResponseEntity.ok(service.save(pe));
    }

    /**
     * POST /api/financials/prepaid-expenses/amortization-run?runDate=2024-12-31
     */
    @PostMapping("/amortization-run")
    public ResponseEntity<Map<String, Integer>> runAmortization(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate runDate) {
        modulePermissionService.requireCanEdit(MODULE);
        int count = service.runMonthlyAmortization(runDate);
        return ResponseEntity.ok(Map.of("journalsPosted", count));
    }
}
