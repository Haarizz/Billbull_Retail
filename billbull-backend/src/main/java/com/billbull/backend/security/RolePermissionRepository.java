package com.billbull.backend.security;

import com.billbull.backend.role.Role;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

@Repository
public interface RolePermissionRepository extends JpaRepository<RolePermission, Long> {

    List<RolePermission> findByRole_Name(String roleName);

    /** Single query for multiple roles — use this instead of looping findByRole_Name. */
    List<RolePermission> findByRole_NameIn(Collection<String> roleNames);

    Optional<RolePermission> findByRoleAndModule(Role role, String module);

    boolean existsByRoleAndModule(Role role, String module);

    List<RolePermission> findByRole_NameAndModule(String roleName, String module);
}
