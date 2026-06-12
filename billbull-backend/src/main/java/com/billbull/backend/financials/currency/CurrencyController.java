package com.billbull.backend.financials.currency;

import com.billbull.backend.security.ModulePermissionService;
import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/financials/currencies")
@PreAuthorize("hasAnyRole('ADMIN', 'ACCOUNTANT')")
public class CurrencyController {

    private static final String MODULE = "finance";

    private final CurrencyService service;
    private final ModulePermissionService modulePermissionService;

    public CurrencyController(CurrencyService service, ModulePermissionService modulePermissionService) {
        this.service = service;
        this.modulePermissionService = modulePermissionService;
    }

    @GetMapping
    public ResponseEntity<List<Currency>> getAll() {
        modulePermissionService.requireCanView(MODULE);
        return ResponseEntity.ok(service.getActiveCurrencies());
    }

    @PostMapping
    public ResponseEntity<Currency> save(@RequestBody Currency currency) {
        modulePermissionService.requireCanCreate(MODULE);
        return ResponseEntity.ok(service.save(currency));
    }

    @GetMapping("/rates")
    public ResponseEntity<List<ExchangeRate>> getRates() {
        modulePermissionService.requireCanView(MODULE);
        return ResponseEntity.ok(service.getAllRates());
    }

    @PostMapping("/rates")
    public ResponseEntity<ExchangeRate> saveRate(@RequestBody ExchangeRate rate) {
        modulePermissionService.requireCanCreate(MODULE);
        return ResponseEntity.ok(service.saveRate(rate));
    }
}
