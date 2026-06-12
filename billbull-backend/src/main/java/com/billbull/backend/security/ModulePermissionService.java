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

    /** Vertical: can the current user EDIT in this module? */
    public void requireCanEdit(String module) {
        if (!hasPermission(module, RolePermission::isCanEdit)) {
            deny(module, "edit");
        }
    }

    /** Vertical: can the current user DELETE in this module? */
    public void requireCanDelete(String module) {
        if (!hasPermission(module, RolePermission::isCanDelete)) {
            deny(module, "delete");
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

    /** Generic action-level check */
    public void requireCan(String module, String action) {
        switch (action.toLowerCase()) {
            case "view":    requireCanView(module); break;
            case "create":  requireCanCreate(module); break;
            case "edit":    requireCanEdit(module); break;
            case "delete":  requireCanDelete(module); break;
            case "approve": requireCanApprove(module); break;
            case "export":  requireCanExport(module); break;
            default: throw new IllegalArgumentException("Unknown action: " + action);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Boolean check variants (no exception — for conditional logic)
    // ─────────────────────────────────────────────────────────────────────────

    public boolean canView(String module)    { return hasPermission(module, RolePermission::isCanView); }
    public boolean canCreate(String module)  { return hasPermission(module, RolePermission::isCanCreate); }
    public boolean canEdit(String module)    { return hasPermission(module, RolePermission::isCanEdit); }
    public boolean canDelete(String module)  { return hasPermission(module, RolePermission::isCanDelete); }
    public boolean canApprove(String module) { return hasPermission(module, RolePermission::isCanApprove); }
    public boolean canExport(String module)  { return hasPermission(module, RolePermission::isCanExport); }

    // ─────────────────────────────────────────────────────────────────────────
    // Core logic
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Returns true if ANY of the current user's roles has the given flag = true
     * for the specified module or its parent module (ALLOW-wins union).
     * Loads all permissions for all roles in a single query.
     */
    private boolean hasPermission(String module, Function<RolePermission, Boolean> flag) {
        List<String> roleNames = getCurrentUserRoleNames();
        if (roleNames.isEmpty()) return false;

        String target = module.toLowerCase();
        String parent = target.contains(".") ? target.split("\\.")[0] : null;

        List<RolePermission> allPerms = rolePermissionRepository.findByRole_NameIn(roleNames);

        // 1. Exact match — if any role has an explicit row for this module, that value is authoritative
        java.util.Optional<RolePermission> exactRow = allPerms.stream()
            .filter(rp -> rp.getModule().equalsIgnoreCase(target))
            .filter(flag::apply)
            .findFirst();
        if (exactRow.isPresent()) return true;

        // If an exact row exists but flag is false for all roles, do not fall through to parent
        boolean hasExactRow = allPerms.stream().anyMatch(rp -> rp.getModule().equalsIgnoreCase(target));
        if (hasExactRow) return false;

        // 2. Fallback to parent module when no exact row exists
        if (parent != null) {
            return allPerms.stream()
                .filter(rp -> rp.getModule().equalsIgnoreCase(parent))
                .anyMatch(flag::apply);
        }

        return false;
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
