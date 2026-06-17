package com.billbull.backend.customer.inquiries;

import com.billbull.backend.security.AuditLogService;
import com.billbull.backend.security.ModulePermissionService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/inquiries")
public class CustomerInquiryController {

    private static final String MODULE = "customer";

    private final CustomerInquiryService service;
    private final AuditLogService auditLogService;
    private final ModulePermissionService modulePermissionService;

    public CustomerInquiryController(CustomerInquiryService service, AuditLogService auditLogService,
                                     ModulePermissionService modulePermissionService) {
        this.service = service;
        this.auditLogService = auditLogService;
        this.modulePermissionService = modulePermissionService;
    }

    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public List<CustomerInquiryResponse> list(HttpServletRequest request) {
        modulePermissionService.requireCanView(MODULE);
        auditLogService.logAllowedAccess("/api/inquiries", "GET", request);
        return service.list();
    }

    @PostMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<CustomerInquiryResponse> create(
            @Valid @RequestBody CustomerInquiryRequestDto req,
            HttpServletRequest request) {
        modulePermissionService.requireCanCreate(MODULE);
        auditLogService.logAllowedAccess("/api/inquiries", "POST", request);
        return ResponseEntity.ok(service.create(req));
    }

    @GetMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<CustomerInquiryResponse> get(@PathVariable Long id, HttpServletRequest request) {
        modulePermissionService.requireCanView(MODULE);
        auditLogService.logAllowedAccess("/api/inquiries/" + id, "GET", request);
        return ResponseEntity.ok(service.getById(id));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Void> delete(@PathVariable Long id, HttpServletRequest request) {
        modulePermissionService.requireCanEdit(MODULE);
        auditLogService.logAllowedAccess("/api/inquiries/" + id, "DELETE", request);
        service.delete(id);
        return ResponseEntity.ok().build();
    }

    @PutMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<CustomerInquiryResponse> update(
            @PathVariable Long id,
            @Valid @RequestBody CustomerInquiryRequestDto req,
            HttpServletRequest request) {
        modulePermissionService.requireCanEdit(MODULE);
        auditLogService.logAllowedAccess("/api/inquiries/" + id, "PUT", request);
        return ResponseEntity.ok(service.update(id, req));
    }

    @PostMapping("/{id}/follow-up")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Void> addFollowUp(
            @PathVariable Long id,
            @RequestBody FollowUpRequestDto req,
            HttpServletRequest request) {
        modulePermissionService.requireCanEdit(MODULE);
        auditLogService.logAllowedAccess("/api/inquiries/" + id + "/follow-up", "POST", request);
        service.addFollowUp(id, req);
        return ResponseEntity.ok().build();
    }

    @PutMapping("/{id}/reassign")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<CustomerInquiryResponse> reassignRep(
            @PathVariable Long id,
            @RequestParam String assignedTo,
            HttpServletRequest request) {
        modulePermissionService.requireCanEdit(MODULE);
        auditLogService.logAllowedAccess("/api/inquiries/" + id + "/reassign", "PUT", request);
        return ResponseEntity.ok(service.reassignRep(id, assignedTo));
    }

    @PutMapping("/follow-up/{followUpId}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Void> updateFollowUp(
            @PathVariable Long followUpId,
            @RequestBody FollowUpRequestDto req,
            HttpServletRequest request) {
        modulePermissionService.requireCanEdit(MODULE);
        auditLogService.logAllowedAccess("/api/inquiries/follow-up/" + followUpId, "PUT", request);
        service.updateFollowUp(followUpId, req);
        return ResponseEntity.ok().build();
    }
}
