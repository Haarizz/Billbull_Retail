package com.billbull.backend.auth;

import com.billbull.backend.user.User;
import com.billbull.backend.role.Role;

public class UserProfileDto {
    private String username;
    private String fullName;
    private String email;
    private String phone;
    private String address;
    private String jobTitle;
    private String department;
    private String avatarUrl;
    private String role; // Primary role or comma separated
    private String employeeId;
    private java.time.LocalDate joinDate;
    private Long branchId;
    private String branchName;
    private String branchCode;
    private Long defaultWarehouseId;
    private String defaultWarehouseName;

    public UserProfileDto(User user) {
        this.username = user.getUsername();
        this.fullName = user.getResolvedDisplayName();
        this.email = user.getEmail();
        this.phone = user.getPhone();
        this.address = user.getAddress();
        this.jobTitle = user.getJobTitle();
        this.department = user.getDepartment();
        this.avatarUrl = user.getAvatarUrl();
        this.role = user.getPrimaryRole() != null
                ? user.getPrimaryRole().getName()
                : (user.getRoles().isEmpty() ? "" : user.getRoles().iterator().next().getName());
        this.employeeId = user.getEmployeeId();
        this.joinDate = user.getJoinDate();
        if (user.getBranch() != null) {
            this.branchId = user.getBranch().getId();
            this.branchName = user.getBranch().getName();
            this.branchCode = user.getBranch().getCode();
            if (user.getBranch().getDefaultWarehouse() != null) {
                this.defaultWarehouseId = user.getBranch().getDefaultWarehouse().getId();
                this.defaultWarehouseName = user.getBranch().getDefaultWarehouse().getName();
            }
        }
    }

    // Getters
    public String getUsername() {
        return username;
    }

    public String getFullName() {
        return fullName;
    }

    public String getEmail() {
        return email;
    }

    public String getPhone() {
        return phone;
    }

    public String getAddress() {
        return address;
    }

    public String getJobTitle() {
        return jobTitle;
    }

    public String getDepartment() {
        return department;
    }

    public String getAvatarUrl() {
        return avatarUrl;
    }

    public String getRole() {
        return role;
    }

    public String getEmployeeId() {
        return employeeId;
    }

    public java.time.LocalDate getJoinDate() {
        return joinDate;
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
