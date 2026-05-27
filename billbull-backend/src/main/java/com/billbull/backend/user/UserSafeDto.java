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
    private String primaryRoleName;
    private boolean active;
    private Long linkedEmployeeId;
    private String linkedEmployeeCode;
    private Long branchId;
    private String branchName;
    private String branchCode;
    private Long defaultWarehouseId;
    private String defaultWarehouseName;
    private List<BranchRef> additionalBranches;
    private LocalDateTime createdAt;

    public static class BranchRef {
        private final Long id;
        private final String name;
        private final String code;
        public BranchRef(Long id, String name, String code) { this.id = id; this.name = name; this.code = code; }
        public Long getId() { return id; }
        public String getName() { return name; }
        public String getCode() { return code; }
    }

    public UserSafeDto(User user) {
        this.id = user.getId();
        this.username = user.getUsername();
        this.fullName = user.getFullName();
        this.email = user.getEmail();
        this.phone = user.getPhone();
        this.roles = user.getRoles().stream()
                .map(r -> r.getName())
                .collect(Collectors.toList());
        this.primaryRoleName = user.getPrimaryRole() != null ? user.getPrimaryRole().getName() : null;
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

        // PDF §2.3 multi-branch user — surface the extra branches the user can switch to.
        this.additionalBranches = user.getAdditionalBranches() == null
                ? java.util.Collections.emptyList()
                : user.getAdditionalBranches().stream()
                        .filter(b -> b != null && b.getId() != null)
                        .map(b -> new BranchRef(b.getId(), b.getName(), b.getCode()))
                        .collect(Collectors.toList());
    }

    // --- Getters only (no setters on DTO) ---

    public Long getId() { return id; }
    public String getUsername() { return username; }
    public String getFullName() { return fullName; }
    public String getEmail() { return email; }
    public String getPhone() { return phone; }
    public List<String> getRoles() { return roles; }
    public String getPrimaryRoleName() { return primaryRoleName; }
    public boolean isActive() { return active; }
    public Long getLinkedEmployeeId() { return linkedEmployeeId; }
    public String getLinkedEmployeeCode() { return linkedEmployeeCode; }
    public Long getBranchId() { return branchId; }
    public String getBranchName() { return branchName; }
    public String getBranchCode() { return branchCode; }
    public Long getDefaultWarehouseId() { return defaultWarehouseId; }
    public String getDefaultWarehouseName() { return defaultWarehouseName; }
    public List<BranchRef> getAdditionalBranches() { return additionalBranches; }
    public LocalDateTime getCreatedAt() { return createdAt; }
}
