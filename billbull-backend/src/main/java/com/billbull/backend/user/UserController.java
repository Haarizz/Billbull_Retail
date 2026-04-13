package com.billbull.backend.user;

import com.billbull.backend.security.AuditLogService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Set;

/**
 * User Management Controller - ADMIN ONLY.
 * Prevents privilege escalation by restricting user/role management.
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
     * Get all users - ADMIN ONLY.
     */
    @GetMapping
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<List<User>> getAllUsers(HttpServletRequest request) {
        auditLogService.logAllowedAccess("/api/users", "GET", request);
        List<User> users = userService.getAllUsers();
        return ResponseEntity.ok(users);
    }

    /**
     * Get user by ID - ADMIN ONLY.
     */
    @GetMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<User> getUserById(@PathVariable Long id, HttpServletRequest request) {
        auditLogService.logAllowedAccess("/api/users/" + id, "GET", request);
        User user = userService.getUserById(id);
        return ResponseEntity.ok(user);
    }

    /**
     * Create user - ADMIN ONLY.
     */
    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<User> createUser(@RequestBody UserCreateRequest request, HttpServletRequest httpRequest) {
        auditLogService.logAllowedAccess("/api/users", "POST", httpRequest);
        User user = userService.createUser(request);
        return ResponseEntity.ok(user);
    }

    /**
     * Update user - ADMIN ONLY.
     */
    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<User> updateUser(
            @PathVariable Long id,
            @RequestBody UserUpdateRequest request,
            HttpServletRequest httpRequest) {
        auditLogService.logAllowedAccess("/api/users/" + id, "PUT", httpRequest);
        User user = userService.updateUser(id, request);
        return ResponseEntity.ok(user);
    }

    /**
     * Assign roles to user - ADMIN ONLY (CRITICAL for privilege escalation
     * prevention).
     */
    @PostMapping("/{id}/roles")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<User> assignRoles(
            @PathVariable Long id,
            @RequestBody Set<Long> roleIds,
            HttpServletRequest httpRequest) {
        auditLogService.logAllowedAccess("/api/users/" + id + "/roles", "POST", httpRequest);
        User user = userService.assignRoles(id, roleIds);
        return ResponseEntity.ok(user);
    }

    /**
     * Delete user - ADMIN ONLY.
     */
    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Void> deleteUser(@PathVariable Long id, HttpServletRequest httpRequest) {
        auditLogService.logAllowedAccess("/api/users/" + id, "DELETE", httpRequest);
        userService.deleteUser(id);
        return ResponseEntity.ok().build();
    }
}
