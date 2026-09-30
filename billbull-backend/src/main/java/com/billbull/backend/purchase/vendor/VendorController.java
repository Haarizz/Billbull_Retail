package com.billbull.backend.purchase.vendor;

import com.billbull.backend.security.AuditLogService;
import com.billbull.backend.security.ModulePermissionService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import com.billbull.backend.security.BranchContextHolder;

import java.util.List;

@RestController
@RequestMapping("/api/vendors")
@PreAuthorize("isAuthenticated()")
public class VendorController {

    private static final String MODULE = "purchases.vendor";

    private final VendorService service;
    private final VendorImportService importService;
    private final AuditLogService auditLogService;
    private final ModulePermissionService modulePermissionService;

    public VendorController(VendorService service, VendorImportService importService,
                            AuditLogService auditLogService,
                            ModulePermissionService modulePermissionService) {
        this.service = service;
        this.importService = importService;
        this.auditLogService = auditLogService;
        this.modulePermissionService = modulePermissionService;
    }

    @PostMapping
    public Vendor create(@RequestBody VendorRequest req) {
        modulePermissionService.requireCanCreate(MODULE);
        return service.create(req, false);
    }

    @PostMapping("/draft")
    public Vendor saveDraft(@RequestBody VendorRequest req) {
        modulePermissionService.requireCanCreate(MODULE);
        return service.create(req, true);
    }

    @PutMapping("/{id}")
    public Vendor update(@PathVariable Long id, @RequestBody VendorRequest req) {
        modulePermissionService.requireCanEdit(MODULE);
        return service.update(id, req);
    }

    @GetMapping
    public List<VendorListResponse> list(@RequestParam(required = false) String branchName) {
        modulePermissionService.requireCanView(MODULE);
        return service.list(branchName);
    }

    /**
     * Typeahead search backing the global search modal.
     * {@code size} is clamped server-side (see {@code SearchLimit}).
     */
    @GetMapping("/search")
    public List<VendorSearchResponse> search(
            @RequestParam(defaultValue = "") String q,
            @RequestParam(defaultValue = "5") int size,
            @RequestParam(defaultValue = "false") boolean preview) {
        modulePermissionService.requireCanView(MODULE);
        // `preview` backs the global search modal's empty-query suggestions and applies
        // only when there is no term; a blank q without it still returns nothing.
        if (preview && (q == null || q.isBlank())) return service.preview(size);
        return service.search(q, size);
    }

    /**
     * Payables snapshot for one vendor, backing the global search details panel.
     *
     * <p>Guarded by {@code purchases.vendor} — the same permission as the vendor page the
     * figures already appear on. The accounting stays in
     * {@link VendorService#getSummary(Long)}.
     */
    @GetMapping("/{id}/summary")
    public ResponseEntity<VendorSummaryResponse> summary(@PathVariable Long id) {
        modulePermissionService.requireCanView(MODULE);
        VendorSummaryResponse summary = service.getSummary(id);
        return summary == null ? ResponseEntity.notFound().build() : ResponseEntity.ok(summary);
    }

    @PostMapping(value = "/import/excel", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public String importFromExcel(@RequestParam("file") MultipartFile file,
            @RequestParam(value = "branchId", required = false) Long branchId) {
        modulePermissionService.requireCanCreate(MODULE);
        return importService.importVendors(file, resolveImportBranchId(branchId));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public void delete(@PathVariable Long id) {
        modulePermissionService.requireCanEdit(MODULE);
        service.delete(id);
    }

    /**
     * Imported records are assigned to the branch the caller is currently scoped to, so a
     * branch-restricted user can only ever load data into their own branch. An explicit
     * {@code branchId} form field wins (admins importing on behalf of a branch), but only
     * after {@code JwtFilter} has validated it against the caller's allowed branches.
     * Null means the caller is on "All Branches" and the records stay unattributed.
     */
    private Long resolveImportBranchId(Long requestedBranchId) {
        BranchContextHolder.BranchContext ctx = BranchContextHolder.get();
        if (requestedBranchId != null) {
            if (ctx == null || ctx.isAllBranches() || ctx.allowedBranchIds().contains(requestedBranchId)) {
                return requestedBranchId;
            }
            throw new org.springframework.security.access.AccessDeniedException(
                    "Not allowed to import into branch " + requestedBranchId);
        }
        return ctx == null ? null : ctx.activeBranchId();
    }
}
