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
}
