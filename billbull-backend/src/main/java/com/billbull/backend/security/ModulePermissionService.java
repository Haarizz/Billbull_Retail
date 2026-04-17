package com.billbull.backend.security;

import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Service for granular module-level permission checks in controllers and services.
 *
 * Horizontal access  → requireCanView(module)   — can the user open this module at all?
 * Vertical access    → requireCanCreate/Edit/Approve/Export(module) — what can they do inside?
 *
 * Merge rule: ALLOW wins (union across all of the user's roles).
 * Default:    DENY — if no role_permissions row exists, access is denied.
 */
@Service
public class ModulePermissionService {

    private final RolePermissionRepository rolePermissionRepository;

    public ModulePermissionService(RolePermissionRepository rolePermissionRepository) {
        this.rolePermissionRepository = rolePermissionRepository;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Public check methods — throw AccessDeniedException on failure
    // ─────────────────────────────────────────────────────────────────────────

    /** Horizontal: can the current user VIEW this module? */
    public void requireCanView(String module) {
        if (!hasPermission(module, RolePermission::isCanView)) {
            deny(module, "view");
        }
    }

    /** Vertical: can the current user CREATE in this module? */
    public void requireCanCreate(String module) {
        if (!hasPermission(module, RolePermission::isCanCreate)) {
            deny(module, "create");
        }
    }

    /** Vertical: can the current user EDIT (or delete) in this module? */
    public void requireCanEdit(String module) {
        if (!hasPermission(module, RolePermission::isCanEdit)) {
            deny(module, "edit");
        }
    }

    /** Vertical: can the current user APPROVE in this module? */
    public void requireCanApprove(String module) {
        if (!hasPermission(module, RolePermission::isCanApprove)) {
            deny(module, "approve");
        }
    }

    /** Vertical: can the current user EXPORT from this module? */
    public void requireCanExport(String module) {
        if (!hasPermission(module, RolePermission::isCanExport)) {
            deny(module, "export");
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Boolean check variants (no exception — for conditional logic)
    // ─────────────────────────────────────────────────────────────────────────

    public boolean canView(String module)    { return hasPermission(module, RolePermission::isCanView); }
    public boolean canCreate(String module)  { return hasPermission(module, RolePermission::isCanCreate); }
    public boolean canEdit(String module)    { return hasPermission(module, RolePermission::isCanEdit); }
    public boolean canApprove(String module) { return hasPermission(module, RolePermission::isCanApprove); }
    public boolean canExport(String module)  { return hasPermission(module, RolePermission::isCanExport); }

    // ─────────────────────────────────────────────────────────────────────────
    // Core logic
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Returns true if ANY of the current user's roles has the given flag = true
     * for the specified module (ALLOW-wins union).
     */
    private boolean hasPermission(String module, Function<RolePermission, Boolean> flag) {
        List<String> roleNames = getCurrentUserRoleNames();
        String moduleLower = module.toLowerCase();

        return roleNames.stream().anyMatch(roleName ->
            rolePermissionRepository.findByRole_Name(roleName).stream()
                .filter(rp -> rp.getModule().equalsIgnoreCase(moduleLower))
                .anyMatch(flag::apply)
        );
    }

    /** Extracts role names from the current Spring Security context. */
    private List<String> getCurrentUserRoleNames() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated()) {
            return List.of();
        }
        // Spring stores roles as "ROLE_ADMIN", "ROLE_HR" etc. Strip the prefix.
        return auth.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .map(a -> a.startsWith("ROLE_") ? a.substring(5) : a)
                .collect(Collectors.toList());
    }

    private void deny(String module, String action) {
        throw new AccessDeniedException(
            "You do not have permission to " + action + " in module: " + module
        );
    }
}
