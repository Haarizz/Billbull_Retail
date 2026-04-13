package com.billbull.backend.purchase.lpo;

import java.util.List;

import com.billbull.backend.security.AuditLogService;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/lpos")
public class LpoController {

    private final LpoService service;
    private final AuditLogService auditLogService;

    public LpoController(LpoService service, AuditLogService auditLogService) {
        this.service = service;
        this.auditLogService = auditLogService;
    }

    /* CREATE */
    @PostMapping
    @PreAuthorize("hasAnyRole('ADMIN','INVENTORY_MANAGER')")
    public ResponseEntity<LpoDetailResponse> create(@RequestBody @Valid LpoRequest request) {
        return ResponseEntity.ok(service.create(request));
    }

    /* READ LIST */
    @GetMapping
    @PreAuthorize("hasAnyRole('ADMIN','INVENTORY_MANAGER','ACCOUNTANT')")
    public ResponseEntity<List<LpoListResponse>> list(
            @RequestParam(required = false) LpoStatus status) {
        return ResponseEntity.ok(service.list(status));
    }

    /* READ SINGLE */
    @GetMapping("/{lpoNumber}")
    @PreAuthorize("hasAnyRole('ADMIN','INVENTORY_MANAGER','ACCOUNTANT')")
    public ResponseEntity<LpoDetailResponse> getByNumber(
            @PathVariable String lpoNumber) {

        return ResponseEntity.ok(service.getByNumber(lpoNumber));
    }

    /* UPDATE */
    @PutMapping("/{lpoNumber}")
    @PreAuthorize("hasAnyRole('ADMIN','INVENTORY_MANAGER')")
    public ResponseEntity<LpoDetailResponse> update(
            @PathVariable String lpoNumber,
            @RequestBody @Valid LpoRequest request) {
        return ResponseEntity.ok(service.update(lpoNumber, request));
    }

    /* DELETE */
    @DeleteMapping("/{lpoNumber}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Void> delete(@PathVariable String lpoNumber) {
        service.delete(lpoNumber);
        return ResponseEntity.noContent().build();
    }

    /* ================= WORKFLOW ================= */

    @PostMapping("/{id}/submit")
    @PreAuthorize("hasAnyRole('ADMIN','INVENTORY_MANAGER')")
    public ResponseEntity<Void> submit(@PathVariable Long id) {
        service.submitForApproval(id);
        return ResponseEntity.ok().build();
    }

    @PostMapping("/{id}/approve")
    @PreAuthorize("hasAnyRole('ADMIN','INVENTORY_MANAGER')")
    public ResponseEntity<Void> approve(
            @PathVariable Long id,
            @RequestBody(required = false) java.util.Map<String, String> payload,
            org.springframework.security.core.Authentication auth) {

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
    @PreAuthorize("hasAnyRole('ADMIN','INVENTORY_MANAGER')")
    public ResponseEntity<Void> reject(
            @PathVariable Long id,
            @RequestBody(required = false) java.util.Map<String, String> payload,
            org.springframework.security.core.Authentication auth) {

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
    @PreAuthorize("hasAnyRole('ADMIN','INVENTORY_MANAGER')")
    public ResponseEntity<Void> revert(@PathVariable Long id) {
        service.revertToDraft(id);
        return ResponseEntity.ok().build();
    }

    /* Suggestions (safe placeholder) */
    @GetMapping("/suggestions")
    @PreAuthorize("hasAnyRole('ADMIN','INVENTORY_MANAGER','ACCOUNTANT')")
    public ResponseEntity<List<String>> suggestions() {
        return ResponseEntity.ok(List.of());
    }

    @PostMapping("/{id}/post-stock")
    @PreAuthorize("hasAnyRole('ADMIN','INVENTORY_MANAGER','ACCOUNTANT')")
    public ResponseEntity<Void> postStock(@PathVariable Long id) {
        service.postStockFromLpo(id);
        return ResponseEntity.ok().build();
    }

}
