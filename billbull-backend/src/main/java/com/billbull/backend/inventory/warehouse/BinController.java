package com.billbull.backend.inventory.warehouse;

import com.billbull.backend.security.ModulePermissionService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/locators/{locatorId}/bins")
@PreAuthorize("isAuthenticated()")
public class BinController {

    private static final String MODULE = "inventory";

    private final BinService binService;
    private final ModulePermissionService modulePermissionService;

    public BinController(BinService binService, ModulePermissionService modulePermissionService) {
        this.binService = binService;
        this.modulePermissionService = modulePermissionService;
    }

    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<BinResponse>> getBins(@PathVariable Long locatorId) {
        modulePermissionService.requireCanView(MODULE);
        return ResponseEntity.ok(binService.getBinResponsesByLocator(locatorId));
    }

    @GetMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<BinResponse> getBin(@PathVariable Long locatorId, @PathVariable Long id) {
        modulePermissionService.requireCanView(MODULE);
        return ResponseEntity.ok(binService.getBinResponseById(id));
    }

    @PostMapping
    public ResponseEntity<BinResponse> createBin(
            @PathVariable Long locatorId,
            @RequestBody BinRequest request) {
        modulePermissionService.requireCanCreate(MODULE);
        return ResponseEntity.ok(binService.createBinAndGetResponse(locatorId, request));
    }

    @PutMapping("/{id}")
    public ResponseEntity<BinResponse> updateBin(
            @PathVariable Long locatorId,
            @PathVariable Long id,
            @RequestBody BinRequest request) {
        modulePermissionService.requireCanEdit(MODULE);
        return ResponseEntity.ok(binService.updateBinAndGetResponse(id, request));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteBin(@PathVariable Long locatorId, @PathVariable Long id) {
        modulePermissionService.requireCanEdit(MODULE);
        binService.deleteBin(id);
        return ResponseEntity.noContent().build();
    }
}
