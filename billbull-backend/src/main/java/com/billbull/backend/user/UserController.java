package com.billbull.backend.user;

import com.billbull.backend.security.AuditLogService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Set;

/**
 * User Management Controller — ADMIN ONLY.
 * All responses use UserSafeDto — password is never exposed.
 */
@RestController
@RequestMapping("/api/users")
public class UserController {

    private final UserService userService;
    private final AuditLogService auditLogService;

    public UserController(UserService userService, AuditLogService auditLogService) {
        this.userService = userService;
        this.auditLogService = auditLogService;
    }

    /**
     * Get all users.
     */
    @GetMapping
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<List<UserSafeDto>> getAllUsers(HttpServletRequest request) {
        auditLogService.logAllowedAccess("/api/users", "GET", request);
        return ResponseEntity.ok(userService.getAllUsers());
    }

    /**
     * Get user by ID.
     */
    @GetMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<UserSafeDto> getUserById(
            @PathVariable Long id, HttpServletRequest request) {
        auditLogService.logAllowedAccess("/api/users/" + id, "GET", request);
        return ResponseEntity.ok(userService.getUserById(id));
    }

    /**
     * Create user with optional employee linkage.
     */
    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<UserSafeDto> createUser(
            @RequestBody UserCreateRequest request, HttpServletRequest httpRequest) {
        auditLogService.logAllowedAccess("/api/users", "POST", httpRequest);
        return ResponseEntity.ok(userService.createUser(request));
    }

    /**
     * Update user safe fields (fullName, email, phone).
     */
    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<UserSafeDto> updateUser(
            @PathVariable Long id,
            @RequestBody UserUpdateRequest request,
            HttpServletRequest httpRequest) {
        auditLogService.logAllowedAccess("/api/users/" + id, "PUT", httpRequest);
        return ResponseEntity.ok(userService.updateUser(id, request));
    }

    /**
     * Assign roles to user. Prevents removal of last ADMIN.
     */
    @PostMapping("/{id}/roles")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<UserSafeDto> assignRoles(
            @PathVariable Long id,
            @RequestBody RoleAssignmentRequest request,
            HttpServletRequest httpRequest) {
        auditLogService.logAllowedAccess("/api/users/" + id + "/roles", "POST", httpRequest);
        return ResponseEntity.ok(userService.assignRoles(id, request.getRoleIds(), request.getPrimaryRoleId()));
    }

    /**
     * Freeze user (set isActive=false). Blocked if last active ADMIN.
     */
    @PutMapping("/{id}/freeze")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<UserSafeDto> freezeUser(
            @PathVariable Long id, HttpServletRequest httpRequest) {
        auditLogService.logAllowedAccess("/api/users/" + id + "/freeze", "PUT", httpRequest);
        return ResponseEntity.ok(userService.freezeUser(id));
    }

    /**
     * Unfreeze user (set isActive=true).
     */
    @PutMapping("/{id}/unfreeze")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<UserSafeDto> unfreezeUser(
            @PathVariable Long id, HttpServletRequest httpRequest) {
        auditLogService.logAllowedAccess("/api/users/" + id + "/unfreeze", "PUT", httpRequest);
        return ResponseEntity.ok(userService.unfreezeUser(id));
    }

    /**
     * Admin reset password for a user.
     */
    @PostMapping("/{id}/reset-password")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Void> resetPassword(
            @PathVariable Long id,
            @RequestBody ResetPasswordRequest request,
            HttpServletRequest httpRequest) {
        auditLogService.logAllowedAccess("/api/users/" + id + "/reset-password", "POST", httpRequest);
        userService.resetPassword(id, request.getNewPassword());
        return ResponseEntity.ok().build();
    }

    /**
     * Delete user. Does NOT delete the linked employee. Blocked if last ADMIN.
     */
    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Void> deleteUser(
            @PathVariable Long id, HttpServletRequest httpRequest) {
        auditLogService.logAllowedAccess("/api/users/" + id, "DELETE", httpRequest);
        userService.deleteUser(id);
        return ResponseEntity.ok().build();
    }
}
