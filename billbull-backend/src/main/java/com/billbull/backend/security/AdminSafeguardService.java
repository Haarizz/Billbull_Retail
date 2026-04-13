package com.billbull.backend.security;

import com.billbull.backend.user.User;
import com.billbull.backend.user.UserRepository;
import org.springframework.stereotype.Service;

/**
 * Admin Safeguard Service.
 * Prevents accidental lockout by ensuring at least one ADMIN always exists.
 */
@Service
public class AdminSafeguardService {

    private final UserRepository userRepository;

    public AdminSafeguardService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    /**
     * Check if user is the last ADMIN in the system.
     */
    public boolean isLastAdmin(User user) {
        boolean isAdmin = user.getRoles().stream()
                .anyMatch(role -> role.getName().equals("ADMIN"));

        if (!isAdmin) {
            return false;
        }

        // Count total ADMIN users
        long adminCount = userRepository.findAll().stream()
                .filter(u -> u.getRoles().stream()
                        .anyMatch(role -> role.getName().equals("ADMIN")))
                .count();

        return adminCount <= 1;
    }

    /**
     * Validate that operation won't remove last ADMIN.
     * Throws exception if it would leave system without ADMIN.
     */
    public void validateNotLastAdmin(User user, String operation) {
        if (isLastAdmin(user)) {
            throw new IllegalStateException(
                    "Cannot " + operation + ": This is the last ADMIN user in the system. " +
                            "At least one ADMIN must exist to prevent system lockout.");
        }
    }

    /**
     * Check if removing ADMIN role from user is safe.
     */
    public void validateRemoveAdminRole(User user) {
        validateNotLastAdmin(user, "remove ADMIN role");
    }

    /**
     * Check if deleting user is safe.
     */
    public void validateDeleteUser(User user) {
        validateNotLastAdmin(user, "delete user");
    }

    /**
     * Check if at least one ADMIN exists in the system.
     */
    public boolean hasAdminUser() {
        return userRepository.findAll().stream()
                .anyMatch(user -> user.getRoles().stream()
                        .anyMatch(role -> role.getName().equals("ADMIN")));
    }
}
