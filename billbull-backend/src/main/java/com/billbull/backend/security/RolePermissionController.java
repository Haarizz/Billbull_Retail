package com.billbull.backend.security;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.core.context.SecurityContextHolder;

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
     * Get merged permissions for the current user across ALL their roles.
     */
    @GetMapping("/me")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Map<String, Object>> getMyPermissions() {
        String username = SecurityContextHolder.getContext().getAuthentication().getName();
        return ResponseEntity.ok(rolePermissionService.getMergedPermissionsForUser(username));
    }

    /**
     * Create a new role permission row — ADMIN only.
     * Body: { roleName, module, canView, canCreate, canEdit, canApprove, canExport }
     */
    private static final java.util.Set<String> VALID_MODULES = java.util.Set.of(
        "sales", "inventory", "purchases", "finance", "hr", "customer",
        "dashboard", "userManagement", "batch_manual_select", "notification",
        "sales.invoice", "sales.quotation", "sales.order", "sales.payment",
        "sales.customer", "purchases.lpo", "purchases.grn", "purchases.invoice",
        "purchases.vendor", "inventory.product", "inventory.category",
        "inventory.warehouse", "inventory.stock", "finance.ledger",
        "finance.voucher", "finance.reconcile", "finance.tax", "hr.employee",
        "hr.payroll", "hr.attendance", "customer.inquiry", "customer.followup",
        "customer.message", "userManagement.setup", "userManagement.role",
        "userManagement.user", "dashboard.kpis", "dashboard.charts",
        "permissions.journal.create", "permissions.journal.approve",
        "permissions.journal.approve-high-value", "permissions.posting.backdate-into-locked",
        "permissions.sales.override-credit-limit", "permissions.vendor.advance",
        "permissions.customer.advance.refund"
    );

    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<RolePermissionDto> create(@RequestBody Map<String, Object> body) {
        String module = (String) body.get("module");
        if (module == null || !VALID_MODULES.contains(module.toLowerCase())) {
            return ResponseEntity.badRequest().build();
        }
        return ResponseEntity.ok(rolePermissionService.createOrUpdate(
                null,
                (String) body.get("roleName"),
                module,
                Boolean.TRUE.equals(body.get("canView")),
                Boolean.TRUE.equals(body.get("canCreate")),
                Boolean.TRUE.equals(body.get("canEdit")),
                Boolean.TRUE.equals(body.get("canDelete")),
                Boolean.TRUE.equals(body.get("canApprove")),
                Boolean.TRUE.equals(body.get("canExport"))
        ));
    }

    /**
     * Update an existing role permission row by ID — ADMIN only.
     * Body: { canView, canCreate, canEdit, canDelete, canApprove, canExport }
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
                Boolean.TRUE.equals(body.get("canDelete")),
                Boolean.TRUE.equals(body.get("canApprove")),
                Boolean.TRUE.equals(body.get("canExport"))
        ));
    }
}
