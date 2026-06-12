package com.billbull.backend.inventory.settings;

import com.billbull.backend.security.ModulePermissionService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/inventory/settings")
public class InventorySettingsController {

    private static final String MODULE = "inventory";

    private final InventorySettingsService service;
    private final ModulePermissionService modulePermissionService;

    public InventorySettingsController(InventorySettingsService service, ModulePermissionService modulePermissionService) {
        this.service = service;
        this.modulePermissionService = modulePermissionService;
    }

    @GetMapping
    public ResponseEntity<InventorySettings> getSettings() {
        modulePermissionService.requireCanView(MODULE);
        return ResponseEntity.ok(service.getSettings());
    }

    @PutMapping
    public ResponseEntity<InventorySettings> saveSettings(@RequestBody InventorySettings settings) {
        modulePermissionService.requireCanEdit(MODULE);
        return ResponseEntity.ok(service.saveSettings(settings));
    }
}
