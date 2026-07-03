package com.billbull.backend.pos.counter;

import com.billbull.backend.settings.branch.BranchAccessService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/pos/counters")
@CrossOrigin
public class PosCounterController {

    private final PosCounterService service;
    private final BranchAccessService branchAccessService;

    public PosCounterController(PosCounterService service, BranchAccessService branchAccessService) {
        this.service = service;
        this.branchAccessService = branchAccessService;
    }

    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<PosCounter>> list(@RequestParam(required = false) Long branchId) {
        Long bid = branchId != null ? branchId : branchAccessService.getRequiredCurrentUserBranch().getId();
        return ResponseEntity.ok(service.listForBranch(bid));
    }

    @GetMapping("/active")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<PosCounter>> listActive(@RequestParam(required = false) Long branchId) {
        Long bid = branchId != null ? branchId : branchAccessService.getRequiredCurrentUserBranch().getId();
        return ResponseEntity.ok(service.listActiveForBranch(bid));
    }

    @GetMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Map<String, Object>> getById(@PathVariable Long id) {
        return ResponseEntity.ok(service.getWithMetrics(id));
    }

    @PostMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosCounter> create(@RequestBody Map<String, Object> body) {
        var branch = branchAccessService.getRequiredCurrentUserBranch();
        String counterCode = body.get("counterCode") != null ? body.get("counterCode").toString() : null;
        String counterName = body.getOrDefault("counterName", "Counter").toString();
        String description = body.get("description") != null ? body.get("description").toString() : null;
        String cashDrawer = body.get("defaultCashDrawer") != null ? body.get("defaultCashDrawer").toString() : null;
        String printer = body.get("defaultReceiptPrinter") != null ? body.get("defaultReceiptPrinter").toString() : null;
        Integer displayOrder = body.get("displayOrder") != null ? Integer.parseInt(body.get("displayOrder").toString()) : null;
        return ResponseEntity.ok(service.create(branch.getId(), branch.getName(), counterCode, counterName,
                description, cashDrawer, printer, displayOrder));
    }

    @PutMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosCounter> update(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        String counterName = body.get("counterName") != null ? body.get("counterName").toString() : null;
        String description = body.get("description") != null ? body.get("description").toString() : null;
        String cashDrawer = body.get("defaultCashDrawer") != null ? body.get("defaultCashDrawer").toString() : null;
        String printer = body.get("defaultReceiptPrinter") != null ? body.get("defaultReceiptPrinter").toString() : null;
        Integer displayOrder = body.get("displayOrder") != null ? Integer.parseInt(body.get("displayOrder").toString()) : null;
        return ResponseEntity.ok(service.update(id, counterName, description, cashDrawer, printer, displayOrder));
    }

    @PatchMapping("/{id}/status")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosCounter> setStatus(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        PosCounterStatus status = PosCounterStatus.valueOf(body.getOrDefault("status", "ACTIVE").toString().toUpperCase());
        return ResponseEntity.ok(service.setStatus(id, status));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
