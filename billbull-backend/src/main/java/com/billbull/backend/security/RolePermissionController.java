package com.billbull.backend.security;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * REST controller for managing role-level granular permissions.
 * GET /api/role-permissions/by-role/{roleName} is open to all authenticated users
 * so the frontend PermissionContext can fetch permissions on login.
 */
@RestController
@RequestMapping("/api/role-permissions")
public class RolePermissionController {

    private final RolePermissionService rolePermissionService;

    public RolePermissionController(RolePermissionService rolePermissionService) {
        this.rolePermissionService = rolePermissionService;
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
     * Get permissions for a specific role — any authenticated user.
     * Required by PermissionContext to load permissions on login.
     */
    @GetMapping("/by-role/{roleName}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<RolePermissionDto>> getByRole(@PathVariable String roleName) {
        return ResponseEntity.ok(rolePermissionService.getByRoleName(roleName));
    }

    /**
     * Create a new role permission row — ADMIN only.
     * Body: { roleName, module, canView, canCreate, canEdit, canApprove, canExport }
     */
    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<RolePermissionDto> create(@RequestBody Map<String, Object> body) {
        return ResponseEntity.ok(rolePermissionService.createOrUpdate(
                null,
                (String) body.get("roleName"),
                (String) body.get("module"),
                Boolean.TRUE.equals(body.get("canView")),
                Boolean.TRUE.equals(body.get("canCreate")),
                Boolean.TRUE.equals(body.get("canEdit")),
                Boolean.TRUE.equals(body.get("canApprove")),
                Boolean.TRUE.equals(body.get("canExport"))
        ));
    }

    /**
     * Update an existing role permission row by ID — ADMIN only.
     * Body: { canView, canCreate, canEdit, canApprove, canExport }
     */
    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<RolePermissionDto> update(
            @PathVariable Long id,
            @RequestBody Map<String, Object> body) {
        return ResponseEntity.ok(rolePermissionService.createOrUpdate(
                id,
                null,
                null,
                Boolean.TRUE.equals(body.get("canView")),
                Boolean.TRUE.equals(body.get("canCreate")),
                Boolean.TRUE.equals(body.get("canEdit")),
                Boolean.TRUE.equals(body.get("canApprove")),
                Boolean.TRUE.equals(body.get("canExport"))
        ));
    }
}
