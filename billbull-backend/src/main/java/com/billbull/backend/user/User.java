package com.billbull.backend.user;

import java.util.HashSet;
import java.util.Set;

import com.billbull.backend.common.BaseEntity;
import com.billbull.backend.hr.employees.Employee;
import com.billbull.backend.role.Role;

import jakarta.persistence.*;

@Entity
@Table(name = "users",
        uniqueConstraints = {
                @UniqueConstraint(columnNames = "username")
        },
        indexes = {
                @Index(name = "idx_user_linked_employee", columnList = "linked_employee_id")
        })
public class User extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String username;

    @Column(nullable = false)
    private String password;

    private String fullName;
    private String email;
    private String phone;
    private String address;
    private String jobTitle;
    private String department;
    private String avatarUrl;
    private String employeeId;
    private java.time.LocalDate joinDate;
    @Column(nullable = false, columnDefinition = "boolean default false")
    private boolean pendingEmployeeActivation = false;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "linked_employee_id", unique = true)
    private Employee linkedEmployee;

    @ManyToMany(fetch = FetchType.EAGER)
    @JoinTable(name = "user_roles", joinColumns = @JoinColumn(name = "user_id"), inverseJoinColumns = @JoinColumn(name = "role_id"))
    private Set<Role> roles = new HashSet<>();

    // --- getters & setters ---

    public Long getId() {
        return id;
    }

    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public String getPassword() {
        return password;
    }

    public void setPassword(String password) {
        this.password = password;
    }

    public String getFullName() {
        return fullName;
    }

    public void setFullName(String fullName) {
        this.fullName = fullName;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public String getPhone() {
        return phone;
    }

    public void setPhone(String phone) {
        this.phone = phone;
    }

    public String getAddress() {
        return address;
    }

    public void setAddress(String address) {
        this.address = address;
    }

    public String getJobTitle() {
        return jobTitle;
    }

    public void setJobTitle(String jobTitle) {
        this.jobTitle = jobTitle;
    }

    public String getDepartment() {
        return department;
    }

    public void setDepartment(String department) {
        this.department = department;
    }

    public String getAvatarUrl() {
        return avatarUrl;
    }

    public void setAvatarUrl(String avatarUrl) {
        this.avatarUrl = avatarUrl;
    }

    public String getEmployeeId() {
        return employeeId;
    }

    public void setEmployeeId(String employeeId) {
        this.employeeId = employeeId;
    }

    public java.time.LocalDate getJoinDate() {
        return joinDate;
    }

    public void setJoinDate(java.time.LocalDate joinDate) {
        this.joinDate = joinDate;
    }

    public boolean isPendingEmployeeActivation() {
        return pendingEmployeeActivation;
    }

    public void setPendingEmployeeActivation(boolean pendingEmployeeActivation) {
        this.pendingEmployeeActivation = pendingEmployeeActivation;
    }

    public Set<Role> getRoles() {
        return roles;
    }

    public void setRoles(Set<Role> roles) {
        this.roles = roles;
    }

    public Employee getLinkedEmployee() {
        return linkedEmployee;
    }

    public void setLinkedEmployee(Employee linkedEmployee) {
        this.linkedEmployee = linkedEmployee;
    }
}
