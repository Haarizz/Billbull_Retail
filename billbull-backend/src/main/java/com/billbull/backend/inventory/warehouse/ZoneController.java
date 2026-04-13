package com.billbull.backend.inventory.warehouse;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/warehouses/{warehouseId}/zones")
@PreAuthorize("hasAnyRole('ADMIN','INVENTORY','INVENTORY_MANAGER')")
public class ZoneController {

    private final ZoneService zoneService;

    public ZoneController(ZoneService zoneService) {
        this.zoneService = zoneService;
    }

    @GetMapping
    public ResponseEntity<List<ZoneResponse>> getZones(@PathVariable Long warehouseId) {
        return ResponseEntity.ok(zoneService.getZoneResponsesByWarehouse(warehouseId));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ZoneResponse> getZone(@PathVariable Long warehouseId, @PathVariable Long id) {
        return ResponseEntity.ok(zoneService.getZoneResponseById(id));
    }

    @PostMapping
    public ResponseEntity<ZoneResponse> createZone(
            @PathVariable Long warehouseId,
            @RequestBody ZoneRequest request) {
        return ResponseEntity.ok(zoneService.createZoneAndGetResponse(warehouseId, request));
    }

    @PutMapping("/{id}")
    public ResponseEntity<ZoneResponse> updateZone(
            @PathVariable Long warehouseId,
            @PathVariable Long id,
            @RequestBody ZoneRequest request) {
        return ResponseEntity.ok(zoneService.updateZoneAndGetResponse(id, request));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteZone(@PathVariable Long warehouseId, @PathVariable Long id) {
        zoneService.deleteZone(id);
        return ResponseEntity.noContent().build();
    }
}
