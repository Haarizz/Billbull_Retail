package com.billbull.backend.inventory.warehouse;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/zones/{zoneId}/locators")
@PreAuthorize("hasAnyRole('ADMIN','INVENTORY','INVENTORY_MANAGER')")
public class LocatorController {

    private final LocatorService locatorService;

    public LocatorController(LocatorService locatorService) {
        this.locatorService = locatorService;
    }

    @GetMapping
    public ResponseEntity<List<LocatorResponse>> getLocators(@PathVariable Long zoneId) {
        return ResponseEntity.ok(locatorService.getLocatorResponsesByZone(zoneId));
    }

    @GetMapping("/{id}")
    public ResponseEntity<LocatorResponse> getLocator(@PathVariable Long zoneId, @PathVariable Long id) {
        return ResponseEntity.ok(locatorService.getLocatorResponseById(id));
    }

    @PostMapping
    public ResponseEntity<LocatorResponse> createLocator(
            @PathVariable Long zoneId,
            @RequestBody LocatorRequest request) {
        return ResponseEntity.ok(locatorService.createLocatorAndGetResponse(zoneId, request));
    }

    @PutMapping("/{id}")
    public ResponseEntity<LocatorResponse> updateLocator(
            @PathVariable Long zoneId,
            @PathVariable Long id,
            @RequestBody LocatorRequest request) {
        return ResponseEntity.ok(locatorService.updateLocatorAndGetResponse(id, request));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteLocator(@PathVariable Long zoneId, @PathVariable Long id) {
        locatorService.deleteLocator(id);
        return ResponseEntity.noContent().build();
    }
}
