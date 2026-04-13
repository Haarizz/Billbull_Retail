package com.billbull.backend.purchase.grn;

import java.util.List;

import com.billbull.backend.security.AuditLogService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/grns")
@PreAuthorize("hasAnyRole('ADMIN','INVENTORY_MANAGER','ACCOUNTANT')")
public class GrnController {

    private final GrnService service;
    private final AuditLogService auditLogService;

    public GrnController(GrnService service, AuditLogService auditLogService) {
        this.service = service;
        this.auditLogService = auditLogService;
    }

    @GetMapping
    public List<GrnListResponse> list() {
        return service.list();
    }

    @GetMapping("/{id}")
    public GrnDetailResponse get(@PathVariable Long id) {
        return service.get(id);
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('ADMIN','INVENTORY_MANAGER')")
    public GrnDetailResponse create(@RequestBody @Valid GrnSaveRequest req) {
        return service.saveOrUpdate(null, req);
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN','INVENTORY_MANAGER')")
    public GrnDetailResponse update(
            @PathVariable Long id,
            @RequestBody @Valid GrnSaveRequest req) {
        return service.saveOrUpdate(id, req);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public void delete(@PathVariable Long id) {
        service.delete(id);
    }

    /* QC FLOW */

    @PostMapping("/{id}/submit-qc")
    @PreAuthorize("hasAnyRole('ADMIN','INVENTORY_MANAGER')")
    public void submitQc(@PathVariable Long id) {
        service.submitQc(id);
    }

    @PostMapping("/{id}/approve-qc")
    @PreAuthorize("hasAnyRole('ADMIN','INVENTORY_MANAGER')")
    public void approveQc(@PathVariable Long id) {
        service.approveQc(id);
    }

    /* STOCK POST — ONLY HERE */

    @PostMapping("/{id}/post")
    @PreAuthorize("hasAnyRole('ADMIN','INVENTORY_MANAGER')")
    public void post(@PathVariable Long id, @RequestBody(required = false) GrnPostRequest req) {
        service.postGrn(id, req);
    }
}
