package com.billbull.backend.sales.settings;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
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
    @PreAuthorize("isAuthenticated()")
    @GetMapping
    public ResponseEntity<SalesSettings> getSettings() {
        return ResponseEntity.ok(service.getSettings());
    }

    /**
     * PUT /api/sales/settings
     * Saves and returns the updated Sales module settings.
     *
     * <p>Takes the raw body rather than a bound {@code SalesSettings} so the service can apply
     * MERGE semantics — only the properties actually present in the JSON are written. Binding to
     * the entity here would collapse "field absent" into "field false" before the service ever
     * sees it, which is precisely the bug this shape exists to prevent (see
     * {@code SalesSettingsService.saveSettings}).
     */
    @PreAuthorize("hasRole('ADMIN')")
    @PutMapping
    public ResponseEntity<SalesSettings> saveSettings(@RequestBody com.fasterxml.jackson.databind.JsonNode settings) {
        return ResponseEntity.ok(service.saveSettings(settings));
    }
}
