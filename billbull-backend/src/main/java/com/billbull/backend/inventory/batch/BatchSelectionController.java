package com.billbull.backend.inventory.batch;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/inventory/batches")
@PreAuthorize("isAuthenticated()")
public class BatchSelectionController {

    private final BatchSelectionService service;

    public BatchSelectionController(BatchSelectionService service) {
        this.service = service;
    }

    @GetMapping("/selection-options")
    public BatchSelectionOptionsResponse getSelectionOptions(
            @RequestParam String itemCode,
            @RequestParam String locationCode,
            @RequestParam(required = false) Long binId,
            @RequestParam Integer requiredQuantity) {
        return service.getSelectionOptions(itemCode, locationCode, binId, requiredQuantity);
    }
}
