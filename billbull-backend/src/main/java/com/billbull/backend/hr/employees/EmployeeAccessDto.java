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
}
