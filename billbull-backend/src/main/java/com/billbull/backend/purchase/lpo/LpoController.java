package com.billbull.backend.purchase.lpo;

import java.util.List;
import java.util.Map;

import com.billbull.backend.purchase.payment.PaymentVoucher;
import com.billbull.backend.security.AuditLogService;
import com.billbull.backend.security.ModulePermissionService;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/lpos")
public class LpoController {

    private static final String MODULE = "purchases";

    private final LpoService service;
    private final AuditLogService auditLogService;
    private final ModulePermissionService modulePermissionService;

    public LpoController(LpoService service, AuditLogService auditLogService,
                         ModulePermissionService modulePermissionService) {
        this.service = service;
        this.auditLogService = auditLogService;
        this.modulePermissionService = modulePermissionService;
    }

    /* CREATE */
    @PostMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<LpoDetailResponse> create(@RequestBody @Valid LpoRequest request) {
        modulePermissionService.requireCanCreate(MODULE);
        return ResponseEntity.ok(service.create(request));
    }

    /* READ LIST */
    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<LpoListResponse>> list(
            @RequestParam(required = false) LpoStatus status) {
        modulePermissionService.requireCanView(MODULE);
        return ResponseEntity.ok(service.list(status));
    }

    @GetMapping("/page")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<com.billbull.backend.util.PageResponse<LpoListResponse>> page(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "30") int size,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) LpoStatus status,
            @RequestParam(required = false) @org.springframework.format.annotation.DateTimeFormat(iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE) java.time.LocalDate dateFrom,
            @RequestParam(required = false) @org.springframework.format.annotation.DateTimeFormat(iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE) java.time.LocalDate dateTo,
            @RequestParam(required = false) String vendor) {
        modulePermissionService.requireCanView(MODULE);
        return ResponseEntity.ok(service.listPage(status, search, dateFrom, dateTo, vendor, page, size));
    }

    @GetMapping("/counts")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Map<String, Long>> counts() {
        modulePermissionService.requireCanView(MODULE);
        return ResponseEntity.ok(service.statusCounts());
    }

    /* READ SINGLE */
    @GetMapping("/{lpoNumber}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<LpoDetailResponse> getByNumber(
            @PathVariable String lpoNumber) {
        modulePermissionService.requireCanView(MODULE);
        return ResponseEntity.ok(service.getByNumber(lpoNumber));
    }

    /* UPDATE */
    @PutMapping("/{lpoNumber}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<LpoDetailResponse> update(
            @PathVariable String lpoNumber,
            @RequestBody @Valid LpoRequest request) {
        modulePermissionService.requireCanEdit(MODULE);
        return ResponseEntity.ok(service.update(lpoNumber, request));
    }

    /* DELETE */
    @DeleteMapping("/{lpoNumber}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Void> delete(@PathVariable String lpoNumber) {
        modulePermissionService.requireCanEdit(MODULE);
        service.delete(lpoNumber);
        return ResponseEntity.noContent().build();
    }

    /* ================= WORKFLOW ================= */

    @PostMapping("/{id}/submit")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Void> submit(@PathVariable Long id) {
        modulePermissionService.requireCanEdit(MODULE);
        service.submitForApproval(id);
        return ResponseEntity.ok().build();
    }

    @PostMapping("/{id}/approve")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Void> approve(
            @PathVariable Long id,
            @RequestBody(required = false) java.util.Map<String, String> payload,
            org.springframework.security.core.Authentication auth) {
        modulePermissionService.requireCanEdit(MODULE);
        String username = auth.getName();
        List<String> roles = auth.getAuthorities().stream()
                .map(org.springframework.security.core.GrantedAuthority::getAuthority)
                .map(r -> r.replace("ROLE_", ""))
                .toList();

        String remarks = (payload != null) ? payload.get("remarks") : "";
        service.approve(id, username, roles, remarks);
        return ResponseEntity.ok().build();
    }

    @PostMapping("/{id}/reject")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Void> reject(
            @PathVariable Long id,
            @RequestBody(required = false) java.util.Map<String, String> payload,
            org.springframework.security.core.Authentication auth) {
        modulePermissionService.requireCanEdit(MODULE);
        String username = auth.getName();
        List<String> roles = auth.getAuthorities().stream()
                .map(org.springframework.security.core.GrantedAuthority::getAuthority)
                .map(r -> r.replace("ROLE_", ""))
                .toList();

        String remarks = (payload != null) ? payload.get("remarks") : "";
        service.rejectById(id, username, roles, remarks);
        return ResponseEntity.ok().build();
    }

    @PostMapping("/{id}/revert")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Void> revert(@PathVariable Long id) {
        modulePermissionService.requireCanEdit(MODULE);
        service.revertToDraft(id);
        return ResponseEntity.ok().build();
    }

    /* Suggestions (safe placeholder) */
    @GetMapping("/suggestions")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<String>> suggestions() {
        modulePermissionService.requireCanView(MODULE);
        return ResponseEntity.ok(List.of());
    }

    @PostMapping("/{id}/post-stock")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Void> postStock(@PathVariable Long id) {
        modulePermissionService.requireCanEdit(MODULE);
        service.postStockFromLpo(id);
        return ResponseEntity.ok().build();
    }

    /* ================= ADVANCE PAYMENT ================= */

    @PostMapping("/{id}/advance-payment")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PaymentVoucher> createAdvancePayment(
            @PathVariable Long id,
            @RequestBody Map<String, Object> payload) {
        modulePermissionService.requireCanCreate(MODULE);
        try {
            return ResponseEntity.ok(service.createAdvancePayment(id, payload));
        } catch (Exception e) {
            e.printStackTrace();
            return ResponseEntity.badRequest().build();
        }
    }

    @GetMapping("/{id}/payment-vouchers")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<PaymentVoucher>> getPaymentVouchers(@PathVariable Long id) {
        modulePermissionService.requireCanView(MODULE);
        return ResponseEntity.ok(service.getAdvancePayments(id));
    }

}
