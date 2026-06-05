package com.billbull.backend.financials.currency;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/financials/currencies")
@CrossOrigin(origins = "*")
@PreAuthorize("hasAnyRole('ADMIN', 'ACCOUNTANT')")
public class CurrencyController {

    private final CurrencyService service;

    public CurrencyController(CurrencyService service) {
        this.service = service;
    }

    @GetMapping
    public ResponseEntity<List<Currency>> getAll() {
        return ResponseEntity.ok(service.getActiveCurrencies());
    }

    @PostMapping
    public ResponseEntity<Currency> save(@RequestBody Currency currency) {
        return ResponseEntity.ok(service.save(currency));
    }

    @GetMapping("/rates")
    public ResponseEntity<List<ExchangeRate>> getRates() {
        return ResponseEntity.ok(service.getAllRates());
    }

    @PostMapping("/rates")
    public ResponseEntity<ExchangeRate> saveRate(@RequestBody ExchangeRate rate) {
        return ResponseEntity.ok(service.saveRate(rate));
    }
}
