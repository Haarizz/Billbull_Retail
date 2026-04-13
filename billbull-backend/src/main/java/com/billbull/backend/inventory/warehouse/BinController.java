package com.billbull.backend.inventory.warehouse;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/locators/{locatorId}/bins")
@PreAuthorize("hasAnyRole('ADMIN','INVENTORY','INVENTORY_MANAGER')")
public class BinController {

    private final BinService binService;

    public BinController(BinService binService) {
        this.binService = binService;
    }

    @GetMapping
    public ResponseEntity<List<BinResponse>> getBins(@PathVariable Long locatorId) {
        return ResponseEntity.ok(binService.getBinResponsesByLocator(locatorId));
    }

    @GetMapping("/{id}")
    public ResponseEntity<BinResponse> getBin(@PathVariable Long locatorId, @PathVariable Long id) {
        return ResponseEntity.ok(binService.getBinResponseById(id));
    }

    @PostMapping
    public ResponseEntity<BinResponse> createBin(
            @PathVariable Long locatorId,
            @RequestBody BinRequest request) {
        return ResponseEntity.ok(binService.createBinAndGetResponse(locatorId, request));
    }

    @PutMapping("/{id}")
    public ResponseEntity<BinResponse> updateBin(
            @PathVariable Long locatorId,
            @PathVariable Long id,
            @RequestBody BinRequest request) {
        return ResponseEntity.ok(binService.updateBinAndGetResponse(id, request));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteBin(@PathVariable Long locatorId, @PathVariable Long id) {
        binService.deleteBin(id);
        return ResponseEntity.noContent().build();
    }
}
