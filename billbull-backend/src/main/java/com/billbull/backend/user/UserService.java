package com.billbull.backend.user;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.security.crypto.password.PasswordEncoder;
import com.billbull.backend.role.Role;
import com.billbull.backend.role.RoleRepository;
import com.billbull.backend.security.AdminSafeguardService;

import java.util.List;
import java.util.Set;
import java.util.HashSet;

/**
 * Service for user management operations.
 */
@Service
public class UserService {

    private final UserRepository userRepository;
    private final RoleRepository roleRepository;
    private final PasswordEncoder passwordEncoder;
    private final AdminSafeguardService adminSafeguardService;

    public UserService(
            UserRepository userRepository,
            RoleRepository roleRepository,
            PasswordEncoder passwordEncoder,
            AdminSafeguardService adminSafeguardService) {
        this.userRepository = userRepository;
        this.roleRepository = roleRepository;
        this.passwordEncoder = passwordEncoder;
        this.adminSafeguardService = adminSafeguardService;
    }

    /**
     * Get all users.
     */
    public List<User> getAllUsers() {
        return userRepository.findAll();
    }

    /**
     * Get user by ID.
     */
    public User getUserById(Long id) {
        return userRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("User not found with id: " + id));
    }

    /**
     * Get user by username.
     */
    public User getUserByUsername(String username) {
        return userRepository.findByUsername(username)
                .orElseThrow(() -> new RuntimeException("User not found with username: " + username));
    }

    /**
     * Create new user.
     */
    @Transactional
    public User createUser(UserCreateRequest request) {
        // Check if username already exists
        if (userRepository.findByUsername(request.getUsername()).isPresent()) {
            throw new RuntimeException("Username already exists: " + request.getUsername());
        }

        User user = new User();
        user.setUsername(request.getUsername());
        user.setPassword(passwordEncoder.encode(request.getPassword()));
        user.setFullName(request.getFullName());
        user.setEmail(request.getEmail());
        user.setPhone(request.getPhone());

        // Assign roles
        if (request.getRoleIds() != null && !request.getRoleIds().isEmpty()) {
            Set<Role> roles = new HashSet<>();
            for (Long roleId : request.getRoleIds()) {
                Role role = roleRepository.findById(roleId)
                        .orElseThrow(() -> new RuntimeException("Role not found with id: " + roleId));
                roles.add(role);
            }
            user.setRoles(roles);
        }

        return userRepository.save(user);
    }

    /**
     * Update user.
     */
    @Transactional
    public User updateUser(Long id, UserUpdateRequest request) {
        User user = getUserById(id);

        if (request.getFullName() != null) {
            user.setFullName(request.getFullName());
        }
        if (request.getEmail() != null) {
            user.setEmail(request.getEmail());
        }
        if (request.getPhone() != null) {
            user.setPhone(request.getPhone());
        }
        if (request.getPassword() != null && !request.getPassword().isEmpty()) {
            user.setPassword(passwordEncoder.encode(request.getPassword()));
        }

        return userRepository.save(user);
    }

    /**
     * Assign roles to user (CRITICAL for privilege escalation prevention).
     */
    @Transactional
    public User assignRoles(Long userId, Set<Long> roleIds) {
        User user = getUserById(userId);

        // Check if removing ADMIN role from last admin
        boolean hadAdminRole = user.getRoles().stream()
                .anyMatch(r -> r.getName().equals("ADMIN"));

        Set<Role> newRoles = new HashSet<>();
        for (Long roleId : roleIds) {
            Role role = roleRepository.findById(roleId)
                    .orElseThrow(() -> new RuntimeException("Role not found with id: " + roleId));
            newRoles.add(role);
        }

        boolean hasAdminRoleInNew = newRoles.stream()
                .anyMatch(r -> r.getName().equals("ADMIN"));

        // If user had ADMIN but new roles don't include it, validate not last admin
        if (hadAdminRole && !hasAdminRoleInNew) {
            adminSafeguardService.validateRemoveAdminRole(user);
        }

        user.setRoles(newRoles);
        return userRepository.save(user);
    }

    /**
     * Delete user with admin safeguard.
     */
    @Transactional
    public void deleteUser(Long id) {
        User user = getUserById(id);

        // Check if deleting last admin
        adminSafeguardService.validateDeleteUser(user);

        userRepository.delete(user);
    }
}
