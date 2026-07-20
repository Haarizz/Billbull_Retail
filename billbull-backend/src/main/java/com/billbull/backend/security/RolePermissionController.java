package com.billbull.backend.security;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;
import java.util.Map;

/**
 * REST controller for managing role-level granular permissions.
 *
 * GET /me is open to all authenticated users (PermissionContext loads it on login);
 * everything else — including reading other roles' configuration — is ADMIN only.
 * Every mutation is written to the security audit trail (ROLE_PERMISSION events).
 */
@RestController
@RequestMapping("/api/role-permissions")
public class RolePermissionController {

    private final RolePermissionService rolePermissionService;
    private final AuditLogService auditLogService;
    private final com.billbull.backend.common.ownership.OwnershipAccessService ownershipAccessService;

    public RolePermissionController(RolePermissionService rolePermissionService,
                                    AuditLogService auditLogService,
                                    com.billbull.backend.common.ownership.OwnershipAccessService ownershipAccessService) {
        this.rolePermissionService = rolePermissionService;
        this.auditLogService = auditLogService;
        this.ownershipAccessService = ownershipAccessService;
    }

    /**
     * Get all role permissions — ADMIN only.
     */
    @GetMapping
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<List<RolePermissionDto>> getAll() {
        return ResponseEntity.ok(rolePermissionService.getAll());
    }

    /**
     * The full module catalog the backend accepts — lets the frontend validate
     * against the same source of truth used for row creation.
     */
    @GetMapping("/modules")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<List<String>> getModuleCatalog() {
        return ResponseEntity.ok(ModuleCatalog.allModules());
    }

    /**
     * Get permissions for a specific role — ADMIN only.
     * (Non-admin sessions load their own merged permissions via /me.)
     */
    @GetMapping("/by-role/{roleName}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<List<RolePermissionDto>> getByRole(@PathVariable String roleName) {
        return ResponseEntity.ok(rolePermissionService.getByRoleName(roleName));
    }

    /**
     * Get merged permissions for the current user across ALL their roles.
     */
    @GetMapping("/me")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Map<String, Object>> getMyPermissions() {
        String username = SecurityContextHolder.getContext().getAuthentication().getName();
        Map<String, Object> merged = new java.util.HashMap<>(
                rolePermissionService.getMergedPermissionsForUser(username));
        // User-based data visibility signal for the frontend: whether the tenant toggle is on and
        // whether THIS user is ownership-restricted (so lists show the "only your records" indicator
        // and override-holders get the My/All switch). Derived server-side from the resolved
        // per-request ownership context — never a client-trusted flag.
        merged.put("_ownership", Map.of(
                "filteringEnabled", ownershipAccessService.filteringEnabled(),
                "restricted", ownershipAccessService.restrictionApplies()));
        return ResponseEntity.ok(merged);
    }

    /**
     * Create (or upsert by roleName+module) a role permission row — ADMIN only.
     * Body: { roleName, module, canView?, canCreate?, canEdit?, canDelete?, canApprove?, canExport? }
     * Absent flags stay at their current/default value (partial semantics).
     */
    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<RolePermissionDto> create(@RequestBody Map<String, Object> body) {
        RolePermissionDto dto = rolePermissionService.createOrUpdate(
                null,
                (String) body.get("roleName"),
                (String) body.get("module"),
                flag(body, "canView"),
                flag(body, "canCreate"),
                flag(body, "canEdit"),
                flag(body, "canDelete"),
                flag(body, "canApprove"),
                flag(body, "canExport"));
        audit("UPSERTED", dto);
        return ResponseEntity.ok(dto);
    }

    /**
     * Update an existing role permission row by ID — ADMIN only.
     * Body: any subset of { canView, canCreate, canEdit, canDelete, canApprove, canExport }.
     * Absent flags are left unchanged.
     */
    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<RolePermissionDto> update(
            @PathVariable Long id,
            @RequestBody Map<String, Object> body) {
        RolePermissionDto dto = rolePermissionService.createOrUpdate(
                id,
                null,
                null,
                flag(body, "canView"),
                flag(body, "canCreate"),
                flag(body, "canEdit"),
                flag(body, "canDelete"),
                flag(body, "canApprove"),
                flag(body, "canExport"));
        audit("UPDATED", dto);
        return ResponseEntity.ok(dto);
    }

    /**
     * Delete a permission row — restores parent-module inheritance for that
     * role+module. ADMIN only.
     */
    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        RolePermissionDto removed = rolePermissionService.delete(id);
        audit("DELETED", removed);
        return ResponseEntity.noContent().build();
    }

    /**
     * Upsert a batch of rows for one role atomically — ADMIN only.
     * Body: { roleName, permissions: [{ module, canView?, ... }, ...] }
     */
    @PostMapping("/bulk")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<List<RolePermissionDto>> bulkUpsert(@RequestBody BulkRequest request) {
        List<RolePermissionDto> result =
                rolePermissionService.bulkUpsert(request.roleName, request.permissions);
        auditLogService.logDomainEvent(
                "ROLE_PERMISSION",
                request.roleName,
                "BULK_UPSERTED",
                result.size() + " permission rows saved for role " + request.roleName);
        return ResponseEntity.ok(result);
    }

    /**
     * Replace one role's permissions with a copy of another role's — ADMIN only.
     * Body: { fromRole, toRole }
     */
    @PostMapping("/copy")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<List<RolePermissionDto>> copy(@RequestBody CopyRequest request) {
        List<RolePermissionDto> result =
                rolePermissionService.copyPermissions(request.fromRole, request.toRole);
        auditLogService.logDomainEvent(
                "ROLE_PERMISSION",
                request.toRole,
                "COPIED",
                "Permissions copied from role " + request.fromRole + " to " + request.toRole
                        + " (" + result.size() + " rows)");
        return ResponseEntity.ok(result);
    }

    public static class BulkRequest {
        public String roleName;
        public List<Map<String, Object>> permissions;
    }

    public static class CopyRequest {
        public String fromRole;
        public String toRole;
    }

    private void audit(String action, RolePermissionDto dto) {
        auditLogService.logDomainEvent(
                "ROLE_PERMISSION",
                dto.getRoleName() + ":" + dto.getModule(),
                action,
                "view=" + dto.isCanView()
                        + " create=" + dto.isCanCreate()
                        + " edit=" + dto.isCanEdit()
                        + " delete=" + dto.isCanDelete()
                        + " approve=" + dto.isCanApprove()
                        + " export=" + dto.isCanExport());
    }

    private static Boolean flag(Map<String, Object> body, String key) {
        if (body == null || !body.containsKey(key)) {
            return null;
        }
        return Boolean.TRUE.equals(body.get(key));
    }
}
