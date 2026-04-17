package com.billbull.backend.security;

import com.billbull.backend.role.Role;
import com.billbull.backend.role.RoleRepository;
import com.billbull.backend.user.User;
import com.billbull.backend.user.UserRepository;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.HashSet;
import java.util.Set;

/**
 * RBAC Database Initialization.
 * Creates default roles and ensures at least one ADMIN user exists.
 */
@Configuration
public class RBACInitializer {

    @Bean
    @Order(1)   // must run before RolePermissionInitializer (@Order 2)
    CommandLineRunner initRBAC(
            RoleRepository roleRepository,
            UserRepository userRepository,
            PasswordEncoder passwordEncoder) {
        return args -> {
            // Create 5 core roles if they don't exist
            createRoleIfNotExists(roleRepository, "ADMIN");
            createRoleIfNotExists(roleRepository, "SALES");
            createRoleIfNotExists(roleRepository, "INVENTORY_MANAGER");
            createRoleIfNotExists(roleRepository, "ACCOUNTANT");
            createRoleIfNotExists(roleRepository, "HR");

            // Ensure at least one ADMIN user exists
            ensureAdminExists(userRepository, roleRepository, passwordEncoder);
        };
    }

    private void createRoleIfNotExists(RoleRepository roleRepository, String roleName) {
        if (roleRepository.findByName(roleName).isEmpty()) {
            Role role = new Role();
            role.setName(roleName);
            roleRepository.save(role);
            System.out.println("✅ Created role: " + roleName);
        }
    }

    private void ensureAdminExists(
            UserRepository userRepository,
            RoleRepository roleRepository,
            PasswordEncoder passwordEncoder) {
        // Check if any ADMIN user exists
        Role adminRole = roleRepository.findByName("ADMIN")
                .orElseThrow(() -> new RuntimeException("ADMIN role not found"));

        boolean adminExists = userRepository.findAll().stream()
                .anyMatch(user -> user.getRoles().stream()
                        .anyMatch(role -> role.getName().equals("ADMIN")));

        if (!adminExists) {
            // Create default admin user
            User admin = new User();
            admin.setUsername("admin");
            admin.setPassword(passwordEncoder.encode("admin123"));
            admin.setFullName("System Administrator");
            admin.setEmail("admin@billbull.app");

            Set<Role> roles = new HashSet<>();
            roles.add(adminRole);
            admin.getRoles().addAll(roles);

            userRepository.save(admin);
            System.out.println("✅ Created default ADMIN user (username: admin, password: admin123)");
            System.out.println("⚠️  IMPORTANT: Change the default admin password immediately!");
        }
    }
}
