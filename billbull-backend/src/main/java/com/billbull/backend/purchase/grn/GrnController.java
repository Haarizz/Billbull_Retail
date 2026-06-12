package com.billbull.backend.purchase.grn;

import java.util.List;

import com.billbull.backend.security.AuditLogService;
import com.billbull.backend.security.ModulePermissionService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/grns")
@PreAuthorize("hasAnyRole('ADMIN','INVENTORY_MANAGER','ACCOUNTANT')")
public class GrnController {

    private static final String MODULE = "purchases";

    private final GrnService service;
    private final AuditLogService auditLogService;
    private final ModulePermissionService modulePermissionService;

    public GrnController(GrnService service, AuditLogService auditLogService,
                         ModulePermissionService modulePermissionService) {
        this.service = service;
        this.auditLogService = auditLogService;
        this.modulePermissionService = modulePermissionService;
    }

    @GetMapping
    public List<GrnListResponse> list() {
        modulePermissionService.requireCanView(MODULE);
        return service.list();
    }

    @GetMapping("/page")
    public com.billbull.backend.util.PageResponse<GrnListResponse> page(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "30") int size,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String status) {
        modulePermissionService.requireCanView(MODULE);
        return com.billbull.backend.util.PaginationUtil.paginate(service.list(), page, size, search, status);
    }

    @GetMapping("/{id}")
    public GrnDetailResponse get(@PathVariable Long id) {
        modulePermissionService.requireCanView(MODULE);
        return service.get(id);
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('ADMIN','INVENTORY_MANAGER')")
    public GrnDetailResponse create(@RequestBody @Valid GrnSaveRequest req) {
        modulePermissionService.requireCanCreate(MODULE);
        return service.saveOrUpdate(null, req);
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN','INVENTORY_MANAGER')")
    public GrnDetailResponse update(
            @PathVariable Long id,
            @RequestBody @Valid GrnSaveRequest req) {
        modulePermissionService.requireCanEdit(MODULE);
        return service.saveOrUpdate(id, req);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public void delete(@PathVariable Long id) {
        modulePermissionService.requireCanEdit(MODULE);
        service.delete(id);
    }

    /* QC FLOW */

    @PostMapping("/{id}/submit-qc")
    @PreAuthorize("hasAnyRole('ADMIN','INVENTORY_MANAGER')")
    public void submitQc(@PathVariable Long id) {
        modulePermissionService.requireCanEdit(MODULE);
        service.submitQc(id);
    }

    @PostMapping("/{id}/approve-qc")
    @PreAuthorize("hasAnyRole('ADMIN','INVENTORY_MANAGER')")
    public void approveQc(@PathVariable Long id) {
        modulePermissionService.requireCanEdit(MODULE);
        service.approveQc(id);
    }

    /* STOCK POST — ONLY HERE */

    @PostMapping("/{id}/post")
    @PreAuthorize("hasAnyRole('ADMIN','INVENTORY_MANAGER')")
    public void post(@PathVariable Long id, @RequestBody(required = false) GrnPostRequest req) {
        modulePermissionService.requireCanEdit(MODULE);
        service.postGrn(id, req);
    }
}
