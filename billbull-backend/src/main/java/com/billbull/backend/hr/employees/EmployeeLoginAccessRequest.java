package com.billbull.backend.hr.employees;

public class EmployeeLoginAccessRequest {

    private Boolean createAccess;
    private String loginUsername;
    private String temporaryPassword;
    private Long roleId;
    private Long branchId;

    public Boolean getCreateAccess() {
        return createAccess;
    }

    public void setCreateAccess(Boolean createAccess) {
        this.createAccess = createAccess;
    }

    public String getLoginUsername() {
        return loginUsername;
    }

    public void setLoginUsername(String loginUsername) {
        this.loginUsername = loginUsername;
    }

    public String getTemporaryPassword() {
        return temporaryPassword;
    }

    public void setTemporaryPassword(String temporaryPassword) {
        this.temporaryPassword = temporaryPassword;
    }

    public Long getRoleId() {
        return roleId;
    }

    public void setRoleId(Long roleId) {
        this.roleId = roleId;
    }

    public Long getBranchId() {
        return branchId;
    }

    public void setBranchId(Long branchId) {
        this.branchId = branchId;
    }

    public boolean isRequested() {
        return Boolean.TRUE.equals(createAccess);
    }
}
