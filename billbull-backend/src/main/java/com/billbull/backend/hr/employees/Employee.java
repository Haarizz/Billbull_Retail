package com.billbull.backend.hr.employees;

import com.billbull.backend.settings.branch.Branch;
import jakarta.persistence.*;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(
    name = "employees",
    indexes = { @Index(name = "idx_employee_branch", columnList = "branch_id") }
)
public class Employee {

    // =========================
    // PRIMARY KEY
    // =========================
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // =========================
    // BASIC DETAILS
    // =========================
    @Column(nullable = false, unique = true)
    private String employeeCode;

    @Column(nullable = false)
    private String firstName;

    private String middleName;

    @Column(nullable = false)
    private String lastName;

    private String gender;

    private LocalDate dateOfBirth;

    // =========================
    // CONTACT DETAILS
    // =========================
    @Column(nullable = false)
    private String phone;

    @Column(nullable = false)
    private String email;

    @Column(length = 500)
    private String currentAddress;

    private String nationality;

    // =========================
    // JOB & ORGANIZATION
    // =========================
    private String role;
    private String department;

    /** Legacy free-text branch label; kept until all callers migrate to {@link #branchEntity}. */
    private String branch;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "branch_id")
    @com.fasterxml.jackson.annotation.JsonIgnore
    private Branch branchEntity;
    private String reportingManager;
    private String workLocation;
    private String employmentType;
    private LocalDate joinDate;
    private Integer probationPeriod;
    private LocalDate confirmationDate;

    // =========================
    // ACCESS & PERMISSIONS
    // =========================
    private Boolean posAccess;
    private String posPin;
    private String permissionProfile;

    // =========================
    // PAYROLL
    // =========================
    private String salaryType;
    private Double basicSalary;

    // =========================
    // DOCUMENTS
    // =========================
    private String emiratesId;
    private LocalDate emiratesIdExpiry;

    // =========================
    // WORKFLOW
    // =========================
    @Column(nullable = false)
    private String status;          // Pending / Active / Inactive / Rejected

    private String workflowStage;   // HR Review / Manager Approval / Accounts Approval / Completed

    private LocalDateTime submittedAt;

    // =========================
    // MEDIA
    // =========================
    private String avatarUrl;

    // =========================
    // LIFECYCLE
    // =========================
    @PrePersist
    public void onCreate() {
        this.submittedAt = LocalDateTime.now();
        if (this.status == null) this.status = "Pending";
        if (this.workflowStage == null) this.workflowStage = "HR Review";
        if (this.posAccess == null) this.posAccess = Boolean.TRUE;
    }

    // =========================
    // GETTERS & SETTERS
    // =========================
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getEmployeeCode() { return employeeCode; }
    public void setEmployeeCode(String employeeCode) { this.employeeCode = employeeCode; }

    public String getFirstName() { return firstName; }
    public void setFirstName(String firstName) { this.firstName = firstName; }

    public String getMiddleName() { return middleName; }
    public void setMiddleName(String middleName) { this.middleName = middleName; }

    public String getLastName() { return lastName; }
    public void setLastName(String lastName) { this.lastName = lastName; }

    public String getGender() { return gender; }
    public void setGender(String gender) { this.gender = gender; }

    public LocalDate getDateOfBirth() { return dateOfBirth; }
    public void setDateOfBirth(LocalDate dateOfBirth) { this.dateOfBirth = dateOfBirth; }

    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    public String getCurrentAddress() { return currentAddress; }
    public void setCurrentAddress(String currentAddress) { this.currentAddress = currentAddress; }

    public String getNationality() { return nationality; }
    public void setNationality(String nationality) { this.nationality = nationality; }

    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }

    public String getDepartment() { return department; }
    public void setDepartment(String department) { this.department = department; }

    public String getBranch() { return branch; }
    public void setBranch(String branch) { this.branch = branch; }

    public Branch getBranchEntity() { return branchEntity; }
    public void setBranchEntity(Branch branchEntity) { this.branchEntity = branchEntity; }

    public String getReportingManager() { return reportingManager; }
    public void setReportingManager(String reportingManager) { this.reportingManager = reportingManager; }

    public String getWorkLocation() { return workLocation; }
    public void setWorkLocation(String workLocation) { this.workLocation = workLocation; }

    public String getEmploymentType() { return employmentType; }
    public void setEmploymentType(String employmentType) { this.employmentType = employmentType; }

    public LocalDate getJoinDate() { return joinDate; }
    public void setJoinDate(LocalDate joinDate) { this.joinDate = joinDate; }

    public Integer getProbationPeriod() { return probationPeriod; }
    public void setProbationPeriod(Integer probationPeriod) { this.probationPeriod = probationPeriod; }

    public LocalDate getConfirmationDate() { return confirmationDate; }
    public void setConfirmationDate(LocalDate confirmationDate) { this.confirmationDate = confirmationDate; }

    public Boolean getPosAccess() { return posAccess; }
    public void setPosAccess(Boolean posAccess) { this.posAccess = posAccess; }

    public String getPosPin() { return posPin; }
    public void setPosPin(String posPin) { this.posPin = posPin; }

    public String getPermissionProfile() { return permissionProfile; }
    public void setPermissionProfile(String permissionProfile) { this.permissionProfile = permissionProfile; }

    public String getSalaryType() { return salaryType; }
    public void setSalaryType(String salaryType) { this.salaryType = salaryType; }

    public Double getBasicSalary() { return basicSalary; }
    public void setBasicSalary(Double basicSalary) { this.basicSalary = basicSalary; }

    public String getEmiratesId() { return emiratesId; }
    public void setEmiratesId(String emiratesId) { this.emiratesId = emiratesId; }

    public LocalDate getEmiratesIdExpiry() { return emiratesIdExpiry; }
    public void setEmiratesIdExpiry(LocalDate emiratesIdExpiry) { this.emiratesIdExpiry = emiratesIdExpiry; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getWorkflowStage() { return workflowStage; }
    public void setWorkflowStage(String workflowStage) { this.workflowStage = workflowStage; }

    public LocalDateTime getSubmittedAt() { return submittedAt; }
    public void setSubmittedAt(LocalDateTime submittedAt) { this.submittedAt = submittedAt; }

    public String getAvatarUrl() { return avatarUrl; }
    public void setAvatarUrl(String avatarUrl) { this.avatarUrl = avatarUrl; }
}
