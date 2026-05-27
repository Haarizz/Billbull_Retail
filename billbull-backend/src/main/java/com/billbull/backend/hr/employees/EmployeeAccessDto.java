package com.billbull.backend.hr.employees;

import java.util.List;

/**
 * DTO returned by GET /api/employees/{id}/access — ADMIN only.
 * Shows linked user info without exposing sensitive data.
 */
public class EmployeeAccessDto {

    private Long employeeId;
    private String employeeCode;
    private String employeeFullName;

    private boolean hasLinkedUser;
    private Long linkedUserId;
    private String linkedUsername;
    private String linkedEmail;
    private boolean userActive;
    private boolean pendingEmployeeActivation;
    private List<String> assignedRoles;
    private String primaryRoleName;
    private Long branchId;
    private String branchName;
    private String branchCode;
    /** Additional branches the linked user can switch to (PDF §2.3). */
    private List<Long> additionalBranchIds;
    private Long primaryBranchId;
    private String primaryBranchName;

    // --- Getters & Setters ---

    public Long getEmployeeId() { return employeeId; }
    public void setEmployeeId(Long employeeId) { this.employeeId = employeeId; }

    public String getEmployeeCode() { return employeeCode; }
    public void setEmployeeCode(String employeeCode) { this.employeeCode = employeeCode; }

    public String getEmployeeFullName() { return employeeFullName; }
    public void setEmployeeFullName(String employeeFullName) { this.employeeFullName = employeeFullName; }

    public boolean isHasLinkedUser() { return hasLinkedUser; }
    public void setHasLinkedUser(boolean hasLinkedUser) { this.hasLinkedUser = hasLinkedUser; }

    public Long getLinkedUserId() { return linkedUserId; }
    public void setLinkedUserId(Long linkedUserId) { this.linkedUserId = linkedUserId; }

    public String getLinkedUsername() { return linkedUsername; }
    public void setLinkedUsername(String linkedUsername) { this.linkedUsername = linkedUsername; }

    public String getLinkedEmail() { return linkedEmail; }
    public void setLinkedEmail(String linkedEmail) { this.linkedEmail = linkedEmail; }

    public boolean isUserActive() { return userActive; }
    public void setUserActive(boolean userActive) { this.userActive = userActive; }

    public boolean isPendingEmployeeActivation() { return pendingEmployeeActivation; }
    public void setPendingEmployeeActivation(boolean pendingEmployeeActivation) {
        this.pendingEmployeeActivation = pendingEmployeeActivation;
    }

    public List<String> getAssignedRoles() { return assignedRoles; }
    public void setAssignedRoles(List<String> assignedRoles) { this.assignedRoles = assignedRoles; }

    public String getPrimaryRoleName() { return primaryRoleName; }
    public void setPrimaryRoleName(String primaryRoleName) { this.primaryRoleName = primaryRoleName; }

    public Long getBranchId() { return branchId; }
    public void setBranchId(Long branchId) { this.branchId = branchId; }

    public String getBranchName() { return branchName; }
    public void setBranchName(String branchName) { this.branchName = branchName; }

    public String getBranchCode() { return branchCode; }
    public void setBranchCode(String branchCode) { this.branchCode = branchCode; }

    public List<Long> getAdditionalBranchIds() { return additionalBranchIds; }
    public void setAdditionalBranchIds(List<Long> additionalBranchIds) { this.additionalBranchIds = additionalBranchIds; }

    public Long getPrimaryBranchId() { return primaryBranchId; }
    public void setPrimaryBranchId(Long primaryBranchId) { this.primaryBranchId = primaryBranchId; }

    public String getPrimaryBranchName() { return primaryBranchName; }
    public void setPrimaryBranchName(String primaryBranchName) { this.primaryBranchName = primaryBranchName; }
}
