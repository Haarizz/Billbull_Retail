package com.billbull.backend.role;

import com.billbull.backend.security.RolePermissionRepository;
import com.billbull.backend.user.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;
import java.util.Set;

/**
 * Service for role management operations.
 */
@Service
public class RoleService {

    private static final Set<String> SYSTEM_ROLES = Set.of(
        "ADMIN", "BRANCH_ADMIN", "MANAGER", "SALES", "INVENTORY_MANAGER", "ACCOUNTANT", "HR", "DELIVERY_PERSON"
    );

    private final RoleRepository roleRepository;
    private final UserRepository userRepository;
    private final RolePermissionRepository rolePermissionRepository;

    public RoleService(RoleRepository roleRepository, UserRepository userRepository,
                       RolePermissionRepository rolePermissionRepository) {
        this.roleRepository = roleRepository;
        this.userRepository = userRepository;
        this.rolePermissionRepository = rolePermissionRepository;
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
    public Role createRole(Role role) {
        String name = role.getName();
        if (name == null || !name.matches("^[A-Z][A-Z0-9_]{1,49}$")) {
            throw new RuntimeException("Role name must be uppercase letters, digits, or underscores (2-50 chars).");
        }
        if (roleRepository.findByName(name).isPresent()) {
            throw new RuntimeException("Role already exists with name: " + name);
        }
        return roleRepository.save(role);
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

        boolean hasUsers = userRepository.findAll().stream()
            .anyMatch(u -> u.isActive() && u.getRoles().stream()
                .anyMatch(r -> r.getId().equals(id)));

        if (hasUsers) {
            throw new RuntimeException(
                "Role '" + role.getName() + "' is still assigned to active users. Reassign them first.");
        }

        // Delete associated permission rows first
        rolePermissionRepository.findByRole_Name(role.getName())
            .forEach(rolePermissionRepository::delete);

        roleRepository.delete(role);
    }
}
