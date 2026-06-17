package com.billbull.backend.inventory.warehouse;

import com.billbull.backend.security.ModulePermissionService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/zones/{zoneId}/locators")
@PreAuthorize("isAuthenticated()")
public class LocatorController {

    private static final String MODULE = "inventory";

    private final LocatorService locatorService;
    private final ModulePermissionService modulePermissionService;

    public LocatorController(LocatorService locatorService, ModulePermissionService modulePermissionService) {
        this.locatorService = locatorService;
        this.modulePermissionService = modulePermissionService;
    }

    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<LocatorResponse>> getLocators(@PathVariable Long zoneId) {
        modulePermissionService.requireCanView(MODULE);
        return ResponseEntity.ok(locatorService.getLocatorResponsesByZone(zoneId));
    }

    @GetMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<LocatorResponse> getLocator(@PathVariable Long zoneId, @PathVariable Long id) {
        modulePermissionService.requireCanView(MODULE);
        return ResponseEntity.ok(locatorService.getLocatorResponseById(id));
    }

    @PostMapping
    public ResponseEntity<LocatorResponse> createLocator(
            @PathVariable Long zoneId,
            @RequestBody LocatorRequest request) {
        modulePermissionService.requireCanCreate(MODULE);
        return ResponseEntity.ok(locatorService.createLocatorAndGetResponse(zoneId, request));
    }

    @PutMapping("/{id}")
    public ResponseEntity<LocatorResponse> updateLocator(
            @PathVariable Long zoneId,
            @PathVariable Long id,
            @RequestBody LocatorRequest request) {
        modulePermissionService.requireCanEdit(MODULE);
        return ResponseEntity.ok(locatorService.updateLocatorAndGetResponse(id, request));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteLocator(@PathVariable Long zoneId, @PathVariable Long id) {
        modulePermissionService.requireCanEdit(MODULE);
        locatorService.deleteLocator(id);
        return ResponseEntity.noContent().build();
    }
}
