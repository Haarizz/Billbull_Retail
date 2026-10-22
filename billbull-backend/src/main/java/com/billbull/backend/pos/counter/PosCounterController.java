package com.billbull.backend.pos.counter;

import com.billbull.backend.pos.auth.PosTillPermission;
import com.billbull.backend.security.ModulePermissionService;
import com.billbull.backend.settings.branch.BranchAccessService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;

/**
 * POS counters.
 *
 * <p>Reading counters is for the till ({@code sales.pos}, which picks a counter when opening a
 * session) or a counter administrator ({@code pos.counters} view). Adding, changing, activating
 * and removing a counter is administration: {@code pos.counters} create, edit or delete. Every
 * call is limited to counters of a branch the caller may act on, judged on the stored counter;
 * a new counter always goes to the caller's own branch.
 */
@RestController
@RequestMapping("/api/pos/counters")
@CrossOrigin
public class PosCounterController {

    static final String COUNTER_ADMIN = "pos.counters";
    private static final String LABEL = "Counter";

    private final PosCounterService service;
    private final BranchAccessService branchAccessService;
    private final ModulePermissionService modulePermissionService;

    public PosCounterController(PosCounterService service, BranchAccessService branchAccessService,
                                ModulePermissionService modulePermissionService) {
        this.service = service;
        this.branchAccessService = branchAccessService;
        this.modulePermissionService = modulePermissionService;
    }

    private void requireReader() {
        modulePermissionService.requireCanViewAny(PosTillPermission.MODULE, COUNTER_ADMIN);
    }

    private void requireCounterInScope(Long id) {
        branchAccessService.assertTransactionBranchAccessible(service.getById(id).getBranchId(), LABEL);
    }

    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<PosCounter>> list(@RequestParam(required = false) Long branchId) {
        requireReader();
        branchAccessService.assertTransactionBranchAccessible(branchId, LABEL);
        Long bid = branchId != null ? branchId : branchAccessService.getRequiredCurrentUserBranch().getId();
        return ResponseEntity.ok(service.listForBranch(bid));
    }

    @GetMapping("/active")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<PosCounter>> listActive(@RequestParam(required = false) Long branchId) {
        requireReader();
        branchAccessService.assertTransactionBranchAccessible(branchId, LABEL);
        Long bid = branchId != null ? branchId : branchAccessService.getRequiredCurrentUserBranch().getId();
        return ResponseEntity.ok(service.listActiveForBranch(bid));
    }

    @GetMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Map<String, Object>> getById(@PathVariable Long id) {
        requireReader();
        requireCounterInScope(id);
        return ResponseEntity.ok(service.getWithMetrics(id));
    }

    @PostMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosCounter> create(@RequestBody Map<String, Object> body) {
        modulePermissionService.requireCanCreate(COUNTER_ADMIN);
        var branch = branchAccessService.getRequiredCurrentUserBranch();
        String counterCode = text(body, "counterCode");
        String counterName = text(body, "counterName");
        if (counterName == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Counter name is required.");
        }
        String description = text(body, "description");
        String cashDrawer = text(body, "defaultCashDrawer");
        String printer = text(body, "defaultReceiptPrinter");
        Integer displayOrder = integer(body, "displayOrder", "Display order");
        return ResponseEntity.ok(service.create(branch.getId(), branch.getName(), counterCode, counterName,
                description, cashDrawer, printer, displayOrder));
    }

    @PutMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosCounter> update(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        modulePermissionService.requireCanEdit(COUNTER_ADMIN);
        requireCounterInScope(id);
        String counterName = text(body, "counterName");
        String description = text(body, "description");
        String cashDrawer = text(body, "defaultCashDrawer");
        String printer = text(body, "defaultReceiptPrinter");
        Integer displayOrder = integer(body, "displayOrder", "Display order");
        return ResponseEntity.ok(service.update(id, counterName, description, cashDrawer, printer, displayOrder));
    }

    @PatchMapping("/{id}/status")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosCounter> setStatus(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        modulePermissionService.requireCanEdit(COUNTER_ADMIN);
        requireCounterInScope(id);
        PosCounterStatus status = PosCounterStatus.valueOf(body.getOrDefault("status", "ACTIVE").toString().toUpperCase());
        return ResponseEntity.ok(service.setStatus(id, status));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        modulePermissionService.requireCanDelete(COUNTER_ADMIN);
        requireCounterInScope(id);
        service.delete(id);
        return ResponseEntity.noContent().build();
    }

    /** Optional text field: absent, null, or blank all mean "not supplied". */
    private static String text(Map<String, Object> body, String key) {
        Object raw = body.get(key);
        if (raw == null) return null;
        String value = raw.toString().trim();
        return value.isEmpty() ? null : value;
    }

    /** Optional whole-number field; a blank input is "not supplied", a non-numeric one is a 400. */
    private static Integer integer(Map<String, Object> body, String key, String label) {
        if (body.get(key) instanceof Number n) return n.intValue();
        String value = text(body, key);
        if (value == null) return null;
        try {
            return Integer.valueOf(value);
        } catch (NumberFormatException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, label + " must be a whole number.");
        }
    }
}
