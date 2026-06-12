package com.billbull.backend.inventory.batch;

import com.billbull.backend.security.ModulePermissionService;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/inventory/batches")
@PreAuthorize("isAuthenticated()")
public class BatchSelectionController {

    private static final String MODULE = "inventory";

    private final BatchSelectionService service;
    private final ModulePermissionService modulePermissionService;

    public BatchSelectionController(BatchSelectionService service, ModulePermissionService modulePermissionService) {
        this.service = service;
        this.modulePermissionService = modulePermissionService;
    }

    @GetMapping("/selection-options")
    public BatchSelectionOptionsResponse getSelectionOptions(
            @RequestParam String itemCode,
            @RequestParam String locationCode,
            @RequestParam(required = false) Long binId,
            @RequestParam Integer requiredQuantity) {
        modulePermissionService.requireCanView(MODULE);
        return service.getSelectionOptions(itemCode, locationCode, binId, requiredQuantity);
    }
}
