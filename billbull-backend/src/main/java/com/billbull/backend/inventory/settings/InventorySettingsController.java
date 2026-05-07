package com.billbull.backend.inventory.settings;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/inventory/settings")
public class InventorySettingsController {

    private final InventorySettingsService service;

    public InventorySettingsController(InventorySettingsService service) {
        this.service = service;
    }

    @GetMapping
    public ResponseEntity<InventorySettings> getSettings() {
        return ResponseEntity.ok(service.getSettings());
    }

    @PutMapping
    public ResponseEntity<InventorySettings> saveSettings(@RequestBody InventorySettings settings) {
        return ResponseEntity.ok(service.saveSettings(settings));
    }
}
