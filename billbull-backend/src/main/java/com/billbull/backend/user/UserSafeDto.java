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
    public LocalDateTime getCreatedAt() { return createdAt; }
}
