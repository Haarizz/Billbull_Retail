package com.billbull.backend.role;

import com.billbull.backend.security.RolePermission;
import com.billbull.backend.security.RolePermissionRepository;
import com.billbull.backend.security.accessaudit.AccessAuditAction;
import com.billbull.backend.security.accessaudit.AccessAuditService;
import org.springframework.beans.factory.annotation.Autowired;
import com.billbull.backend.user.User;
import com.billbull.backend.user.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Service for role management operations.
 */
@Service
public class RoleService {

    private static final Set<String> SYSTEM_ROLES = Set.of(
        "ADMIN", "BRANCH_ADMIN", "MANAGER", "SUPERVISOR", "SALES", "INVENTORY_MANAGER",
        "ACCOUNTANT", "HR", "DELIVERY_PERSON"
    );

    /** True when the role is seeded by RBACInitializer and must never be deleted/renamed. */
    public static boolean isSystemRole(String name) {
        return name != null && SYSTEM_ROLES.contains(name);
    }

    private final RoleRepository roleRepository;
    private final UserRepository userRepository;
    private final RolePermissionRepository rolePermissionRepository;

    public RoleService(RoleRepository roleRepository, UserRepository userRepository,
                       RolePermissionRepository rolePermissionRepository) {
        this.roleRepository = roleRepository;
        this.userRepository = userRepository;
        this.rolePermissionRepository = rolePermissionRepository;
    }

    /** Access-control audit ledger (setter-injected; constructor call sites unchanged). */
    private AccessAuditService accessAudit;

    @Autowired
    public void setAccessAuditService(AccessAuditService accessAudit) {
        this.accessAudit = accessAudit;
    }

    /**
     * Get all roles.
     */
    public List<Role> getAllRoles() {
        return roleRepository.findAll();
    }

    /**
     * Get role by ID.
     */
    public Role getRoleById(Long id) {
        return roleRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Role not found with id: " + id));
    }

    /**
     * Get role by name.
     */
    public Role getRoleByName(String name) {
        return roleRepository.findByName(name)
                .orElseThrow(() -> new RuntimeException("Role not found with name: " + name));
    }

    /**
     * Create a new role. Name must match ^[A-Z][A-Z0-9_]{1,49}$.
     */
    @Transactional
    public Role createRole(Role role) {
        String name = role.getName();
        if (name == null || !name.matches("^[A-Z][A-Z0-9_]{1,49}$")) {
            throw new RuntimeException("Role name must be uppercase letters, digits, or underscores (2-50 chars).");
        }
        if (roleRepository.findByName(name).isPresent()) {
            throw new RuntimeException("Role already exists with name: " + name);
        }
        Role saved = roleRepository.save(role);
        if (accessAudit != null) {
            accessAudit.record(AccessAuditService.Entry.of(AccessAuditAction.ROLE_CREATED)
                    .target(saved.getId(), saved.getName())
                    .role(saved.getName())
                    .next(roleValue(saved))
                    .summary("Role " + saved.getName() + " created"));
        }
        return saved;
    }

    /**
     * Update a role's description. The name is immutable — permission rows,
     * JWT role claims, and frontend guards all reference roles by name.
     */
    @Transactional
    public Role updateDescription(Long id, String description) {
        Role role = getRoleById(id);
        Map<String, Object> before = roleValue(role);
        role.setDescription(description);
        Role saved = roleRepository.save(role);
        Map<String, Object> after = roleValue(saved);
        if (accessAudit != null && !after.equals(before)) {
            accessAudit.record(AccessAuditService.Entry.of(AccessAuditAction.ROLE_UPDATED)
                    .target(saved.getId(), saved.getName())
                    .role(saved.getName())
                    .previous(before)
                    .next(after)
                    .summary("Description of " + saved.getName() + " changed")
                    .affected(accessAudit.affectedByRole(saved.getName())));
        }
        return saved;
    }

    /**
     * Delete a custom role. System roles cannot be deleted.
     * The role must have no active users assigned.
     */
    @Transactional
    public void deleteRole(Long id) {
        Role role = getRoleById(id);

        if (SYSTEM_ROLES.contains(role.getName())) {
            throw new RuntimeException("System role '" + role.getName() + "' cannot be deleted.");
        }

        List<User> holders = userRepository.findAll().stream()
            .filter(u -> u.getRoles().stream().anyMatch(r -> r.getId().equals(id)))
            .toList();
        boolean hasUsers = holders.stream().anyMatch(User::isActive);

        if (hasUsers) {
            throw new RuntimeException(
                "Role '" + role.getName() + "' is still assigned to active users. Reassign them first.");
        }

        // Delete associated permission rows first
        List<RolePermission> rows = rolePermissionRepository.findByRole_Name(role.getName());
        Map<String, Object> before = roleValue(role);
        Map<String, Object> permissions = new LinkedHashMap<>();
        rows.forEach(rp -> permissions.put(rp.getModule(), AccessAuditService.flags(rp.isCanView(),
                rp.isCanCreate(), rp.isCanEdit(), rp.isCanDelete(), rp.isCanApprove(), rp.isCanExport())));
        before.put("permissions", permissions);
        rows.forEach(rolePermissionRepository::delete);

        roleRepository.delete(role);

        if (accessAudit != null) {
            // Only inactive users can still hold the role here (active holders block the delete).
            accessAudit.record(AccessAuditService.Entry.of(AccessAuditAction.ROLE_DELETED)
                    .target(id, role.getName())
                    .role(role.getName())
                    .previous(before)
                    .summary("Role " + role.getName() + " deleted with " + rows.size() + " permission rules")
                    .affected(AccessAuditService.Affected.of(
                            holders.stream().map(User::getId).toList(),
                            holders.stream().map(User::getUsername).toList())));
        }
    }

    private static Map<String, Object> roleValue(Role role) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("name", role.getName());
        m.put("description", role.getDescription());
        return m;
    }
}
