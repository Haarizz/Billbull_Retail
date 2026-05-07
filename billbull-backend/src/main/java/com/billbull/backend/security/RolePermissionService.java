package com.billbull.backend.security;

import com.billbull.backend.role.Role;
import com.billbull.backend.role.RoleRepository;
import com.billbull.backend.user.User;
import com.billbull.backend.user.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class RolePermissionService {

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
     * Create or update a role permission row.
     * If id != null, updates existing row.
     * If id == null, upserts by roleName + module.
     */
    @Transactional
    public RolePermissionDto createOrUpdate(
            Long id,
            String roleName,
            String module,
            boolean canView,
            boolean canCreate,
            boolean canEdit,
            boolean canApprove,
            boolean canExport) {

        RolePermission rp;

        if (id != null) {
            // Update existing by ID
            rp = rolePermissionRepository.findById(id)
                    .orElseThrow(() -> new RuntimeException("RolePermission not found with id: " + id));
        } else {
            // Upsert by role + module
            Role role = roleRepository.findByName(roleName)
                    .orElseThrow(() -> new RuntimeException("Role not found: " + roleName));
            rp = rolePermissionRepository.findByRoleAndModule(role, module)
                    .orElseGet(() -> {
                        RolePermission newRp = new RolePermission();
                        newRp.setRole(role);
                        newRp.setModule(module);
                        return newRp;
                    });
        }

        rp.setCanView(canView);
        rp.setCanCreate(canCreate);
        rp.setCanEdit(canEdit);
        rp.setCanApprove(canApprove);
        rp.setCanExport(canExport);

        return new RolePermissionDto(rolePermissionRepository.save(rp));
    }

    @Transactional(readOnly = true)
    public Map<String, Object> getMergedPermissionsForUser(String username) {
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new RuntimeException("User not found: " + username));

        Set<String> roleNames = user.getRoles().stream()
                .map(Role::getName)
                .collect(Collectors.toSet());

        // Get all permission rows for these roles
        List<RolePermission> allPerms = rolePermissionRepository.findAll().stream()
                .filter(rp -> roleNames.contains(rp.getRole().getName()))
                .collect(Collectors.toList());

        // Merge: ALLOW wins (union)
        Map<String, Map<String, Object>> merged = new HashMap<>();

        for (RolePermission rp : allPerms) {
            String mod = rp.getModule().toLowerCase();
            merged.putIfAbsent(mod, createPermissionMap());
            
            Map<String, Object> p = merged.get(mod);
            p.put("view",    (boolean) p.get("view")    || rp.isCanView());
            p.put("create",  (boolean) p.get("create")  || rp.isCanCreate());
            p.put("edit",    (boolean) p.get("edit")    || rp.isCanEdit());
            p.put("approve", (boolean) p.get("approve") || rp.isCanApprove());
            p.put("export",  (boolean) p.get("export")  || rp.isCanExport());
        }

        return new HashMap<>(merged);
    }

    @Transactional(readOnly = true)
    public boolean currentUserCanEdit(String module) {
        if (module == null || module.isBlank()) {
            return false;
        }

        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated()) {
            return false;
        }

        boolean hasAdminRole = authentication.getAuthorities().stream()
                .anyMatch(authority -> "ROLE_ADMIN".equals(authority.getAuthority()));
        if (hasAdminRole) {
            return true;
        }

        Object permission = getMergedPermissionsForUser(authentication.getName())
                .get(module.toLowerCase());
        if (!(permission instanceof Map<?, ?> permissions)) {
            return false;
        }

        return Boolean.TRUE.equals(permissions.get("edit"));
    }

    private Map<String, Object> createPermissionMap() {
        Map<String, Object> map = new HashMap<>();
        map.put("view", false);
        map.put("create", false);
        map.put("edit", false);
        map.put("approve", false);
        map.put("export", false);
        map.put("fields", new HashMap<>()); // Scalable structure
        return map;
    }
}
