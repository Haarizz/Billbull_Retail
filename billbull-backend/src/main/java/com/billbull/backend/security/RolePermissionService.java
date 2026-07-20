package com.billbull.backend.security;

import com.billbull.backend.role.Role;
import com.billbull.backend.role.RoleRepository;
import com.billbull.backend.user.User;
import com.billbull.backend.user.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class RolePermissionService {

    /**
     * Modules the ADMIN role must always be able to VIEW so an administrator can
     * never lock every admin out of the role-configuration screen itself
     * (the /enterprise/administration route is guarded by userManagement.role).
     */
    private static final Set<String> ADMIN_LOCKOUT_MODULES =
            Set.of("usermanagement", "usermanagement.role");

    private final RolePermissionRepository rolePermissionRepository;
    private final RoleRepository roleRepository;
    private final UserRepository userRepository;

    public RolePermissionService(
            RolePermissionRepository rolePermissionRepository,
            RoleRepository roleRepository,
            UserRepository userRepository) {
        this.rolePermissionRepository = rolePermissionRepository;
        this.roleRepository = roleRepository;
        this.userRepository = userRepository;
    }

    /**
     * Get all role permissions (ADMIN view).
     * @Transactional keeps the Hibernate session open while RolePermissionDto
     * accesses the lazily-loaded Role association via rp.getRole().getName().
     */
    @Transactional(readOnly = true)
    public List<RolePermissionDto> getAll() {
        return rolePermissionRepository.findAll().stream()
                .map(RolePermissionDto::new)
                .collect(Collectors.toList());
    }

    /**
     * Get permissions for a specific role name.
     * @Transactional keeps the session open during DTO construction.
     */
    @Transactional(readOnly = true)
    public List<RolePermissionDto> getByRoleName(String roleName) {
        return rolePermissionRepository.findByRole_Name(roleName).stream()
                .map(RolePermissionDto::new)
                .collect(Collectors.toList());
    }

    /**
     * Create or update a role permission row with partial-update semantics:
     * {@code null} flags leave the current (or default false) value untouched,
     * so callers that omit a flag can never silently wipe it.
     *
     * If id != null, updates that row. If id == null, upserts by roleName + module
     * (module is validated against {@link ModuleCatalog} and stored canonically).
     */
    @Transactional
    public RolePermissionDto createOrUpdate(
            Long id,
            String roleName,
            String module,
            Boolean canView,
            Boolean canCreate,
            Boolean canEdit,
            Boolean canDelete,
            Boolean canApprove,
            Boolean canExport) {

        RolePermission rp;

        if (id != null) {
            rp = rolePermissionRepository.findById(id)
                    .orElseThrow(() -> new RuntimeException("RolePermission not found with id: " + id));
        } else {
            String canonicalModule = ModuleCatalog.canonicalize(module);
            Role role = roleRepository.findByName(roleName)
                    .orElseThrow(() -> new RuntimeException("Role not found: " + roleName));
            rp = rolePermissionRepository.findByRoleAndModule(role, canonicalModule)
                    .orElseGet(() -> {
                        RolePermission newRp = new RolePermission();
                        newRp.setRole(role);
                        newRp.setModule(canonicalModule);
                        return newRp;
                    });
        }

        if (canView != null)    rp.setCanView(canView);
        if (canCreate != null)  rp.setCanCreate(canCreate);
        if (canEdit != null)    rp.setCanEdit(canEdit);
        if (canDelete != null)  rp.setCanDelete(canDelete);
        if (canApprove != null) rp.setCanApprove(canApprove);
        if (canExport != null)  rp.setCanExport(canExport);

        validateNoAdminLockout(rp);

        return new RolePermissionDto(rolePermissionRepository.save(rp));
    }

    /**
     * Delete a permission row, restoring parent-module inheritance for that
     * role+module (an explicit row — even all-false — otherwise blocks fallback).
     * Returns the DTO of the removed row so the caller can audit it.
     */
    @Transactional
    public RolePermissionDto delete(Long id) {
        RolePermission rp = rolePermissionRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("RolePermission not found with id: " + id));

        // Deleting ADMIN's top-level userManagement row would leave the ADMIN role
        // with no route into the configuration screen (there is no parent to fall
        // back to). Sub-resource rows may be deleted — they inherit from the parent.
        if (isAdminRole(rp) && "usermanagement".equals(moduleKey(rp)) ) {
            throw new IllegalStateException(
                    "Cannot remove the ADMIN role's User Management access — this would lock "
                    + "administrators out of role configuration.");
        }

        RolePermissionDto snapshot = new RolePermissionDto(rp);
        rolePermissionRepository.delete(rp);
        return snapshot;
    }

    /**
     * Upsert a whole set of permission rows for one role in a single transaction.
     * Each entry uses the same partial-update semantics as {@link #createOrUpdate}.
     */
    @Transactional
    public List<RolePermissionDto> bulkUpsert(String roleName, List<Map<String, Object>> rows) {
        if (roleName == null || roleName.isBlank()) {
            throw new RuntimeException("roleName is required");
        }
        List<RolePermissionDto> result = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            String module = (String) row.get("module");
            result.add(createOrUpdate(
                    null,
                    roleName,
                    module,
                    flag(row, "canView"),
                    flag(row, "canCreate"),
                    flag(row, "canEdit"),
                    flag(row, "canDelete"),
                    flag(row, "canApprove"),
                    flag(row, "canExport")));
        }
        return result;
    }

    /**
     * Replace the target role's permission rows with a copy of the source role's.
     * Used to bootstrap a new custom role from an existing template role.
     * ADMIN is never a valid target — its access must stay under the lockout guard,
     * not be bulk-replaced.
     */
    @Transactional
    public List<RolePermissionDto> copyPermissions(String fromRoleName, String toRoleName) {
        if (fromRoleName == null || toRoleName == null || fromRoleName.equalsIgnoreCase(toRoleName)) {
            throw new RuntimeException("Source and target roles must be two different roles.");
        }
        if ("ADMIN".equalsIgnoreCase(toRoleName)) {
            throw new IllegalStateException("ADMIN permissions cannot be bulk-replaced.");
        }

        Role source = roleRepository.findByName(fromRoleName)
                .orElseThrow(() -> new RuntimeException("Role not found: " + fromRoleName));
        Role target = roleRepository.findByName(toRoleName)
                .orElseThrow(() -> new RuntimeException("Role not found: " + toRoleName));

        rolePermissionRepository.findByRole_Name(target.getName())
                .forEach(rolePermissionRepository::delete);

        List<RolePermissionDto> copies = new ArrayList<>();
        for (RolePermission src : rolePermissionRepository.findByRole_Name(source.getName())) {
            RolePermission copy = new RolePermission();
            copy.setRole(target);
            copy.setModule(src.getModule());
            copy.setCanView(src.isCanView());
            copy.setCanCreate(src.isCanCreate());
            copy.setCanEdit(src.isCanEdit());
            copy.setCanDelete(src.isCanDelete());
            copy.setCanApprove(src.isCanApprove());
            copy.setCanExport(src.isCanExport());
            copies.add(new RolePermissionDto(rolePermissionRepository.save(copy)));
        }
        return copies;
    }

    @Transactional(readOnly = true)
    public Map<String, Object> getMergedPermissionsForUser(String username) {
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new RuntimeException("User not found: " + username));

        Set<String> roleNames = user.getRoles().stream()
                .map(Role::getName)
                .collect(Collectors.toSet());

        // Get all permission rows for these roles in a single query
        List<RolePermission> allPerms = rolePermissionRepository.findByRole_NameIn(roleNames);

        // Merge: ALLOW wins (union)
        Map<String, Map<String, Object>> merged = new HashMap<>();

        for (RolePermission rp : allPerms) {
            String mod = rp.getModule().toLowerCase();
            merged.putIfAbsent(mod, createPermissionMap());

            Map<String, Object> p = merged.get(mod);
            p.put("view",    (boolean) p.get("view")    || rp.isCanView());
            p.put("create",  (boolean) p.get("create")  || rp.isCanCreate());
            p.put("edit",    (boolean) p.get("edit")    || rp.isCanEdit());
            p.put("delete",  (boolean) p.get("delete")  || rp.isCanDelete());
            p.put("approve", (boolean) p.get("approve") || rp.isCanApprove());
            p.put("export",  (boolean) p.get("export")  || rp.isCanExport());
        }

        return new HashMap<>(merged);
    }

    @Transactional(readOnly = true)
    public boolean currentUserCanEdit(String module) {
        return currentUserHas(module, "edit");
    }

    @Transactional(readOnly = true)
    public boolean currentUserCanDelete(String module) {
        return currentUserHas(module, "delete");
    }

    private boolean currentUserHas(String module, String action) {
        if (module == null || module.isBlank()) {
            return false;
        }

        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated()) {
            return false;
        }

        boolean hasAdminRole = authentication.getAuthorities().stream()
                .anyMatch(authority -> "ROLE_ADMIN".equals(authority.getAuthority())
                        || "ROLE_BRANCH_ADMIN".equals(authority.getAuthority()));
        if (hasAdminRole) {
            return true;
        }

        Object permission = getMergedPermissionsForUser(authentication.getName())
                .get(module.toLowerCase());
        if (!(permission instanceof Map<?, ?> permissions)) {
            return false;
        }

        return Boolean.TRUE.equals(permissions.get(action));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * ADMIN must always retain VIEW on userManagement + userManagement.role,
     * otherwise the role-configuration UI route guard denies every administrator
     * and nobody can undo the change from the application.
     */
    private void validateNoAdminLockout(RolePermission rp) {
        if (isAdminRole(rp)
                && ADMIN_LOCKOUT_MODULES.contains(moduleKey(rp))
                && !rp.isCanView()) {
            throw new IllegalStateException(
                    "Cannot disable the ADMIN role's access to User Management — this would lock "
                    + "administrators out of role configuration.");
        }
    }

    private boolean isAdminRole(RolePermission rp) {
        return rp.getRole() != null && "ADMIN".equalsIgnoreCase(rp.getRole().getName());
    }

    private String moduleKey(RolePermission rp) {
        return rp.getModule() == null ? "" : rp.getModule().toLowerCase(Locale.ROOT);
    }

    private static Boolean flag(Map<String, Object> body, String key) {
        if (body == null || !body.containsKey(key)) {
            return null;
        }
        return Boolean.TRUE.equals(body.get(key));
    }

    private Map<String, Object> createPermissionMap() {
        Map<String, Object> map = new HashMap<>();
        map.put("view", false);
        map.put("create", false);
        map.put("edit", false);
        map.put("delete", false);
        map.put("approve", false);
        map.put("export", false);
        map.put("fields", new HashMap<>());
        return map;
    }
}
