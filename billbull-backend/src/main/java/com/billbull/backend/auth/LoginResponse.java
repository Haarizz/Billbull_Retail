package com.billbull.backend.auth;

public class LoginResponse {

    private String token;
    private String username;
    private String fullName;
    private String role;
    private String primaryRole;
    private Long branchId;
    private String branchName;
    private String branchCode;
    private Long defaultWarehouseId;
    private String defaultWarehouseName;

    public LoginResponse(
            String token,
            String username,
            String fullName,
            String role,
            String primaryRole,
            Long branchId,
            String branchName,
            String branchCode,
            Long defaultWarehouseId,
            String defaultWarehouseName) {
        this.token = token;
        this.username = username;
        this.fullName = fullName;
        this.role = role;
        this.primaryRole = primaryRole;
        this.branchId = branchId;
        this.branchName = branchName;
        this.branchCode = branchCode;
        this.defaultWarehouseId = defaultWarehouseId;
        this.defaultWarehouseName = defaultWarehouseName;
    }

    public String getToken() {
        return token;
    }

    public String getUsername() {
        return username;
    }

    public String getFullName() {
        return fullName;
    }

    public String getRole() {
        return role;
    }

    public String getPrimaryRole() {
        return primaryRole;
    }

    public Long getBranchId() {
        return branchId;
    }

    public String getBranchName() {
        return branchName;
    }

    public String getBranchCode() {
        return branchCode;
    }

    public Long getDefaultWarehouseId() {
        return defaultWarehouseId;
    }

    public String getDefaultWarehouseName() {
        return defaultWarehouseName;
    }
}
