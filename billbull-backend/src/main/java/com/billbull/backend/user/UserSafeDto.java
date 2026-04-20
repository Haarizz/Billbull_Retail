package com.billbull.backend.user;

import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

/**
 * Safe DTO for User — never exposes password or hash.
 */
public class UserSafeDto {

    private Long id;
    private String username;
    private String fullName;
    private String email;
    private String phone;
    private List<String> roles;
    private boolean active;
    private Long linkedEmployeeId;
    private String linkedEmployeeCode;
    private Long branchId;
    private String branchName;
    private String branchCode;
    private Long defaultWarehouseId;
    private String defaultWarehouseName;
    private LocalDateTime createdAt;

    public UserSafeDto(User user) {
        this.id = user.getId();
        this.username = user.getUsername();
        this.fullName = user.getFullName();
        this.email = user.getEmail();
        this.phone = user.getPhone();
        this.roles = user.getRoles().stream()
                .map(r -> r.getName())
                .collect(Collectors.toList());
        this.active = user.isActive();
        this.createdAt = user.getCreatedAt();

        if (user.getLinkedEmployee() != null) {
            this.linkedEmployeeId = user.getLinkedEmployee().getId();
            this.linkedEmployeeCode = user.getLinkedEmployee().getEmployeeCode();
        }

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

    // --- Getters only (no setters on DTO) ---

    public Long getId() { return id; }
    public String getUsername() { return username; }
    public String getFullName() { return fullName; }
    public String getEmail() { return email; }
    public String getPhone() { return phone; }
    public List<String> getRoles() { return roles; }
    public boolean isActive() { return active; }
    public Long getLinkedEmployeeId() { return linkedEmployeeId; }
    public String getLinkedEmployeeCode() { return linkedEmployeeCode; }
    public Long getBranchId() { return branchId; }
    public String getBranchName() { return branchName; }
    public String getBranchCode() { return branchCode; }
    public Long getDefaultWarehouseId() { return defaultWarehouseId; }
    public String getDefaultWarehouseName() { return defaultWarehouseName; }
    public LocalDateTime getCreatedAt() { return createdAt; }
}
