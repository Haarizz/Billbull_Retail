package com.billbull.backend.sales.settings;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/sales/settings")
public class SalesSettingsController {

    private final SalesSettingsService service;

    public SalesSettingsController(SalesSettingsService service) {
        this.service = service;
    }

    /**
     * GET /api/sales/settings
     * Returns the current Sales module settings.
     */
    @GetMapping
    public ResponseEntity<SalesSettings> getSettings() {
        return ResponseEntity.ok(service.getSettings());
    }

    /**
     * PUT /api/sales/settings
     * Saves and returns the updated Sales module settings.
     */
    @PutMapping
    public ResponseEntity<SalesSettings> saveSettings(@RequestBody SalesSettings settings) {
        return ResponseEntity.ok(service.saveSettings(settings));
    }
}
