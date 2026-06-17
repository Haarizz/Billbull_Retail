package com.billbull.backend.inventory.warehouse;

import com.billbull.backend.security.ModulePermissionService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/warehouses/{warehouseId}/zones")
@PreAuthorize("isAuthenticated()")
public class ZoneController {

    private static final String MODULE = "inventory";

    private final ZoneService zoneService;
    private final ModulePermissionService modulePermissionService;

    public ZoneController(ZoneService zoneService, ModulePermissionService modulePermissionService) {
        this.zoneService = zoneService;
        this.modulePermissionService = modulePermissionService;
    }

    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<ZoneResponse>> getZones(@PathVariable Long warehouseId) {
        modulePermissionService.requireCanView(MODULE);
        return ResponseEntity.ok(zoneService.getZoneResponsesByWarehouse(warehouseId));
    }

    @GetMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<ZoneResponse> getZone(@PathVariable Long warehouseId, @PathVariable Long id) {
        modulePermissionService.requireCanView(MODULE);
        return ResponseEntity.ok(zoneService.getZoneResponseById(id));
    }

    @PostMapping
    public ResponseEntity<ZoneResponse> createZone(
            @PathVariable Long warehouseId,
            @RequestBody ZoneRequest request) {
        modulePermissionService.requireCanCreate(MODULE);
        return ResponseEntity.ok(zoneService.createZoneAndGetResponse(warehouseId, request));
    }

    @PutMapping("/{id}")
    public ResponseEntity<ZoneResponse> updateZone(
            @PathVariable Long warehouseId,
            @PathVariable Long id,
            @RequestBody ZoneRequest request) {
        modulePermissionService.requireCanEdit(MODULE);
        return ResponseEntity.ok(zoneService.updateZoneAndGetResponse(id, request));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteZone(@PathVariable Long warehouseId, @PathVariable Long id) {
        modulePermissionService.requireCanEdit(MODULE);
        zoneService.deleteZone(id);
        return ResponseEntity.noContent().build();
    }
}
