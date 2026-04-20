package com.billbull.backend.security;

import com.billbull.backend.role.Role;
import com.billbull.backend.role.RoleRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.stream.Collectors;

@Service
public class RolePermissionService {

    private final RolePermissionRepository rolePermissionRepository;
    private final RoleRepository roleRepository;

    public RolePermissionService(
            RolePermissionRepository rolePermissionRepository,
            RoleRepository roleRepository) {
        this.rolePermissionRepository = rolePermissionRepository;
        this.roleRepository = roleRepository;
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
}
