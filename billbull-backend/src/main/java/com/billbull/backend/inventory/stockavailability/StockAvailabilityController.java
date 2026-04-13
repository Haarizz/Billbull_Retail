package com.billbull.backend.inventory.stockavailability;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/inventory/stock-availability")
@CrossOrigin(origins = "*")
public class StockAvailabilityController {

    private final StockAvailabilityService stockAvailabilityService;

    public StockAvailabilityController(StockAvailabilityService stockAvailabilityService) {
        this.stockAvailabilityService = stockAvailabilityService;
    }

    @GetMapping("/by-code/{itemCode}")
    @PreAuthorize("hasAnyRole('SALES','INVENTORY','ADMIN')")
    public ResponseEntity<StockAvailabilityResponse> getStockAvailability(@PathVariable String itemCode) {
        StockAvailabilityResponse response = stockAvailabilityService.getStockAvailability(itemCode);
        return ResponseEntity.ok(response);
    }
}
