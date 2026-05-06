package com.billbull.backend.user;

import java.util.Set;

public class RoleAssignmentRequest {

    private Set<Long> roleIds;
    private Long primaryRoleId;

    public Set<Long> getRoleIds() { return roleIds; }
    public void setRoleIds(Set<Long> roleIds) { this.roleIds = roleIds; }

    public Long getPrimaryRoleId() { return primaryRoleId; }
    public void setPrimaryRoleId(Long primaryRoleId) { this.primaryRoleId = primaryRoleId; }
}
