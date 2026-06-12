package com.billbull.backend.inventory.stockavailability;

import com.billbull.backend.security.ModulePermissionService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/inventory/stock-availability")
public class StockAvailabilityController {

    private static final String MODULE = "inventory";

    private final StockAvailabilityService stockAvailabilityService;
    private final ModulePermissionService modulePermissionService;

    public StockAvailabilityController(StockAvailabilityService stockAvailabilityService, ModulePermissionService modulePermissionService) {
        this.stockAvailabilityService = stockAvailabilityService;
        this.modulePermissionService = modulePermissionService;
    }

    @GetMapping("/by-code/{itemCode}")
    @PreAuthorize("hasAnyRole('SALES','INVENTORY','ADMIN')")
    public ResponseEntity<StockAvailabilityResponse> getStockAvailability(
            @PathVariable String itemCode,
            @RequestParam(required = false) Long warehouseId,
            @RequestParam(required = false) Long zoneId,
            @RequestParam(required = false) Long locatorId,
            @RequestParam(required = false) Long binId) {
        modulePermissionService.requireCanView(MODULE);
        StockAvailabilityResponse response = stockAvailabilityService.getStockAvailability(
                itemCode,
                warehouseId,
                zoneId,
                locatorId,
                binId);
        return ResponseEntity.ok(response);
    }
}
