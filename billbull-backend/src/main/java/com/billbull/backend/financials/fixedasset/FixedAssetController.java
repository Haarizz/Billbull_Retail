package com.billbull.backend.financials.fixedasset;

import com.billbull.backend.security.ModulePermissionService;
import com.billbull.backend.settings.branch.Branch;
import com.billbull.backend.settings.branch.BranchRepository;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/financials/fixed-assets")
public class FixedAssetController {

    private static final String MODULE = "finance";

    private final FixedAssetService service;
    private final BranchRepository branchRepository;
    private final ModulePermissionService modulePermissionService;

    public FixedAssetController(FixedAssetService service, BranchRepository branchRepository, ModulePermissionService modulePermissionService) {
        this.service = service;
        this.branchRepository = branchRepository;
        this.modulePermissionService = modulePermissionService;
    }

    @GetMapping
    public List<FixedAsset> getAll() {
        modulePermissionService.requireCanView(MODULE);
        return service.findAll();
    }

    @GetMapping("/branch/{branchId}")
    public List<FixedAsset> getByBranch(@PathVariable Long branchId) {
        modulePermissionService.requireCanView(MODULE);
        return service.findByBranch(branchId);
    }

    @PostMapping
    public ResponseEntity<FixedAsset> create(@RequestBody FixedAsset asset) {
        modulePermissionService.requireCanCreate(MODULE);
        return ResponseEntity.ok(service.save(asset));
    }

    /**
     * POST /api/financials/fixed-assets/depreciation-run?runDate=2024-12-31
     * Runs straight-line depreciation for the given month-end date.
     */
    @PostMapping("/depreciation-run")
    public ResponseEntity<Map<String, Integer>> runDepreciation(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate runDate) {
        modulePermissionService.requireCanEdit(MODULE);
        int count = service.runMonthlyDepreciation(runDate);
        return ResponseEntity.ok(Map.of("journalsPosted", count));
    }

    /**
     * POST /api/financials/fixed-assets/{id}/dispose
     * Body: { "disposalDate": "2024-12-31", "proceedsAmount": 500.00, "branchId": 1 }
     */
    @PostMapping("/{id}/dispose")
    public ResponseEntity<FixedAsset> dispose(
            @PathVariable Long id,
            @RequestBody DisposalRequest req) {
        modulePermissionService.requireCanEdit(MODULE);
        Branch branch = req.branchId() != null
                ? branchRepository.findById(req.branchId()).orElse(null) : null;
        return ResponseEntity.ok(service.dispose(id, req.disposalDate(), req.proceedsAmount(), branch));
    }

    record DisposalRequest(
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate disposalDate,
            BigDecimal proceedsAmount,
            Long branchId) {}
}
