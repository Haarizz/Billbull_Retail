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
     * Check if user is the last ACTIVE ADMIN in the system.
     * Frozen (inactive) admins do not count — they cannot perform admin operations.
     */
    public boolean isLastAdmin(User user) {
        boolean isAdmin = user.getRoles().stream()
                .anyMatch(role -> role.getName().equals("ADMIN"));

        if (!isAdmin) {
            return false;
        }

        // Count only ACTIVE ADMIN users (frozen admins must not count)
        long activeAdminCount = userRepository.findAll().stream()
                .filter(u -> u.isActive())
                .filter(u -> u.getRoles().stream()
                        .anyMatch(role -> role.getName().equals("ADMIN")))
                .count();

        return activeAdminCount <= 1;
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
     * Check if freezing user is safe (would not remove last active ADMIN).
     */
    public void validateFreezeUser(User user) {
        validateNotLastAdmin(user, "freeze user");
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
