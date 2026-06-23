package com.billbull.backend.purchase.settings;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/purchase/settings")
public class PurchaseSettingsController {

    private final PurchaseSettingsService service;

    public PurchaseSettingsController(PurchaseSettingsService service) {
        this.service = service;
    }

    /**
     * GET /api/purchase/settings
     * Returns the current Purchase module settings.
     */
    @PreAuthorize("isAuthenticated()")
    @GetMapping
    public ResponseEntity<PurchaseSettings> getSettings() {
        return ResponseEntity.ok(service.getSettings());
    }

    /**
     * PUT /api/purchase/settings
     * Saves and returns the updated Purchase module settings.
     */
    @PreAuthorize("hasRole('ADMIN')")
    @PutMapping
    public ResponseEntity<PurchaseSettings> saveSettings(@RequestBody PurchaseSettings settings) {
        return ResponseEntity.ok(service.saveSettings(settings));
    }
}
