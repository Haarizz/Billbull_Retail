package com.billbull.backend.role;

import com.billbull.backend.security.AuditLogService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * Role Management Controller - ADMIN ONLY.
 * Prevents unauthorized role viewing and manipulation.
 */
@RestController
@RequestMapping("/api/roles")
public class RoleController {

    private final RoleService roleService;
    private final AuditLogService auditLogService;

    public RoleController(RoleService roleService, AuditLogService auditLogService) {
        this.roleService = roleService;
        this.auditLogService = auditLogService;
    }

    /**
     * Get all roles - ADMIN ONLY.
     */
    @GetMapping
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<List<Role>> getAllRoles(HttpServletRequest request) {
        auditLogService.logAllowedAccess("/api/roles", "GET", request);
        List<Role> roles = roleService.getAllRoles();
        return ResponseEntity.ok(roles);
    }

    /**
     * Get role by ID - ADMIN ONLY.
     */
    @GetMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Role> getRoleById(@PathVariable Long id, HttpServletRequest request) {
        auditLogService.logAllowedAccess("/api/roles/" + id, "GET", request);
        Role role = roleService.getRoleById(id);
        return ResponseEntity.ok(role);
    }

    /**
     * Get role by name - ADMIN ONLY.
     */
    @GetMapping("/name/{name}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Role> getRoleByName(@PathVariable String name, HttpServletRequest request) {
        auditLogService.logAllowedAccess("/api/roles/name/" + name, "GET", request);
        Role role = roleService.getRoleByName(name);
        return ResponseEntity.ok(role);
    }

    /**
     * Create a new role - ADMIN ONLY.
     */
    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Role> createRole(@RequestBody Role role, HttpServletRequest request) {
        auditLogService.logAllowedAccess("/api/roles", "POST", request);
        return ResponseEntity.ok(roleService.createRole(role));
    }

    /**
     * Update a role's description - ADMIN ONLY. The role name is immutable.
     * Body: { description }
     */
    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Role> updateRole(
            @PathVariable Long id,
            @RequestBody java.util.Map<String, String> body,
            HttpServletRequest request) {
        auditLogService.logAllowedAccess("/api/roles/" + id, "PUT", request);
        return ResponseEntity.ok(roleService.updateDescription(id, body.get("description")));
    }

    /**
     * Delete a custom role - ADMIN ONLY.
     * Fails if system role or if active users are still assigned.
     */
    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Void> deleteRole(@PathVariable Long id, HttpServletRequest request) {
        auditLogService.logAllowedAccess("/api/roles/" + id, "DELETE", request);
        roleService.deleteRole(id);
        return ResponseEntity.noContent().build();
    }
}
