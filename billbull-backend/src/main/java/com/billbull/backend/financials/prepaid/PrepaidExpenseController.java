package com.billbull.backend.financials.prepaid;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/financials/prepaid-expenses")
@CrossOrigin(origins = "*")
public class PrepaidExpenseController {

    private final PrepaidExpenseService service;

    public PrepaidExpenseController(PrepaidExpenseService service) {
        this.service = service;
    }

    @GetMapping
    public List<PrepaidExpense> getAll() {
        return service.findAll();
    }

    @PostMapping
    public ResponseEntity<PrepaidExpense> create(@RequestBody PrepaidExpense pe) {
        return ResponseEntity.ok(service.save(pe));
    }

    /**
     * POST /api/financials/prepaid-expenses/amortization-run?runDate=2024-12-31
     */
    @PostMapping("/amortization-run")
    public ResponseEntity<Map<String, Integer>> runAmortization(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate runDate) {
        int count = service.runMonthlyAmortization(runDate);
        return ResponseEntity.ok(Map.of("journalsPosted", count));
    }
}
