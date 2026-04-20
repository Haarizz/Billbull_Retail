package com.billbull.backend.auth;

public class LoginResponse {

    private String token;
    private String username;
    private String role;
    private Long branchId;
    private String branchName;
    private String branchCode;
    private Long defaultWarehouseId;
    private String defaultWarehouseName;

    public LoginResponse(
            String token,
            String username,
            String role,
            Long branchId,
            String branchName,
            String branchCode,
            Long defaultWarehouseId,
            String defaultWarehouseName) {
        this.token = token;
        this.username = username;
        this.role = role;
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

    public String getRole() {
        return role;
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
