package com.billbull.backend.security;

import com.billbull.backend.role.Role;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface RolePermissionRepository extends JpaRepository<RolePermission, Long> {

    List<RolePermission> findByRole_Name(String roleName);

    Optional<RolePermission> findByRoleAndModule(Role role, String module);

    boolean existsByRoleAndModule(Role role, String module);
}
