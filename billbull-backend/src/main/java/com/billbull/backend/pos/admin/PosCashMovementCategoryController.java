package com.billbull.backend.pos.admin;

import com.billbull.backend.pos.session.PosCashMovementType;
import com.billbull.backend.pos.settings.PosSettingsService;
import com.billbull.backend.security.ModulePermissionService;
import com.billbull.backend.util.PageResponse;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * Enterprise Console &gt; POS Administration &gt; Cash Movement Categories. RBAC reuses the
 * Phase 1-seeded {@code pos.admin.cashmovement.category} module rows exactly (§ RBAC of the
 * Phase 2 brief: "No new permissions required") — canView gates read endpoints, canCreate
 * gates create, canEdit gates update/activate/deactivate (both already granted together as
 * part of the Phase 1 "manage" seed).
 *
 * <p>{@code /selectable} is deliberately NOT gated by that module: any authenticated user
 * completing a POS Cash Drop/Out needs this dropdown, same bar as any other reference-data
 * lookup used while building a transaction.
 */
@RestController
@RequestMapping("/api/pos/admin/cash-movement-categories")
@CrossOrigin
public class PosCashMovementCategoryController {

    private static final String MODULE = "pos.admin.cashmovement.category";

    private final PosCashMovementCategoryService service;
    private final ModulePermissionService modulePermissionService;
    private final PosSettingsService posSettingsService;

    public PosCashMovementCategoryController(PosCashMovementCategoryService service,
                                              ModulePermissionService modulePermissionService,
                                              PosSettingsService posSettingsService) {
        this.service = service;
        this.modulePermissionService = modulePermissionService;
        this.posSettingsService = posSettingsService;
    }

    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PageResponse<PosCashMovementCategoryResponse>> list(
            @RequestParam(required = false) Boolean active,
            @RequestParam(required = false) PosCashMovementCategoryMovementType movementType,
            @RequestParam(required = false) String search,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        modulePermissionService.requireCanView(MODULE);
        return ResponseEntity.ok(service.list(active, movementType, search, page, size));
    }

    @GetMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosCashMovementCategoryResponse> getById(@PathVariable Long id) {
        modulePermissionService.requireCanView(MODULE);
        return ResponseEntity.ok(service.getById(id));
    }

    /** Active categories usable for a cash movement of the given direction, plus whether the
     *  branch currently requires one — the single call the Cash Drop/Out dialogs need. */
    @GetMapping("/selectable")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Map<String, Object>> selectable(
            @RequestParam PosCashMovementType movementType,
            @RequestParam(required = false) Long branchId) {
        boolean required = branchId != null
                && Boolean.TRUE.equals(posSettingsService.getForBranch(branchId).getRequireCashMovementCategory());
        List<PosCashMovementCategorySelectableResponse> categories = service.listSelectable(movementType);
        return ResponseEntity.ok(Map.of("categoryRequired", required, "categories", categories));
    }

    public static class CategoryRequest {
        public String code;
        public String name;
        public String description;
        public PosCashMovementCategoryMovementType movementType;
        public String glAccountId;
        public Integer displayOrder;
        public boolean notesRequired;
        public boolean approvalRequired;

        PosCashMovementCategory toEntity() {
            PosCashMovementCategory c = new PosCashMovementCategory();
            c.setCode(code);
            c.setName(name);
            c.setDescription(description);
            c.setMovementType(movementType);
            c.setGlAccountId(glAccountId);
            c.setDisplayOrder(displayOrder);
            c.setNotesRequired(notesRequired);
            c.setApprovalRequired(approvalRequired);
            return c;
        }
    }

    @PostMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosCashMovementCategoryResponse> create(@RequestBody CategoryRequest body) {
        modulePermissionService.requireCanCreate(MODULE);
        return ResponseEntity.ok(service.create(body.toEntity()));
    }

    @PutMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosCashMovementCategoryResponse> update(@PathVariable Long id, @RequestBody CategoryRequest body) {
        modulePermissionService.requireCanEdit(MODULE);
        return ResponseEntity.ok(service.update(id, body.toEntity()));
    }

    @PostMapping("/{id}/activate")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosCashMovementCategoryResponse> activate(@PathVariable Long id) {
        modulePermissionService.requireCanEdit(MODULE);
        return ResponseEntity.ok(service.activate(id));
    }

    @PostMapping("/{id}/deactivate")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosCashMovementCategoryResponse> deactivate(@PathVariable Long id) {
        modulePermissionService.requireCanEdit(MODULE);
        return ResponseEntity.ok(service.deactivate(id));
    }
}
