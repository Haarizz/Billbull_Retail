package com.billbull.backend.security;

import com.billbull.backend.role.Role;
import com.billbull.backend.role.RoleRepository;
import com.billbull.backend.settings.branch.Branch;
import com.billbull.backend.settings.branch.BranchRepository;
import com.billbull.backend.settings.branch.BranchType;
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
 * Creates default roles, ensures at least one ADMIN user exists, and seeds a
 * "Main Branch" (headquarters) on a fresh deployment so that the admin can
 * immediately create branch-scoped transactions without any manual setup.
 *
 * All methods are idempotent — safe to run on every startup.
 */
@Configuration
public class RBACInitializer {

    @Bean
    @Order(1)   // must run before RolePermissionInitializer (@Order 2)
    CommandLineRunner initRBAC(
            RoleRepository roleRepository,
            UserRepository userRepository,
            BranchRepository branchRepository,
            PasswordEncoder passwordEncoder) {
        return args -> {
            // 1. Core roles
            createRoleIfNotExists(roleRepository, "ADMIN");
            createRoleIfNotExists(roleRepository, "BRANCH_ADMIN");
            createRoleIfNotExists(roleRepository, "MANAGER");
            createRoleIfNotExists(roleRepository, "SALES");
            createRoleIfNotExists(roleRepository, "INVENTORY_MANAGER");
            createRoleIfNotExists(roleRepository, "ACCOUNTANT");
            createRoleIfNotExists(roleRepository, "HR");
            createRoleIfNotExists(roleRepository, "DELIVERY_PERSON");

            // 2. Default branch — must exist before the admin is assigned to it
            Branch defaultBranch = ensureDefaultBranch(branchRepository);

            // 3. Default admin — assigned to the branch so it can act immediately
            ensureAdminExists(userRepository, roleRepository, passwordEncoder, defaultBranch);
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

    /**
     * Seeds a single "Main Branch" (headquarters + default) when the branches
     * table is completely empty. Returns whatever the headquarters branch is,
     * whether freshly created or pre-existing.
     */
    private Branch ensureDefaultBranch(BranchRepository branchRepository) {
        // Existing HQ branch — nothing to do
        return branchRepository.findByIsHeadquartersTrue().orElseGet(() -> {
            // If there are already branches but none is flagged as HQ, promote
            // whichever has the lowest id rather than creating a duplicate.
            return branchRepository.findAll().stream()
                    .min(java.util.Comparator.comparingLong(Branch::getId))
                    .orElseGet(() -> {
                        Branch main = new Branch();
                        main.setName("Main Branch");
                        main.setCode("BR-01");
                        main.setType(BranchType.HEADQUARTERS);
                        main.setHeadquarters(true);
                        main.setDefault(true);
                        main.setSortOrder(0);
                        Branch saved = branchRepository.save(main);
                        System.out.println("✅ Created default 'Main Branch' (id=" + saved.getId() + ")");
                        System.out.println("ℹ️  Rename it in Settings → Branch/Outlets during onboarding.");
                        return saved;
                    });
        });
    }

    /**
     * Creates the default admin user if no ADMIN user exists yet, and ensures
     * the admin has a primary branch so branch-scoped transactions work on
     * first login without any manual setup.
     */
    private void ensureAdminExists(
            UserRepository userRepository,
            RoleRepository roleRepository,
            PasswordEncoder passwordEncoder,
            Branch defaultBranch) {

        Role adminRole = roleRepository.findByName("ADMIN")
                .orElseThrow(() -> new RuntimeException("ADMIN role not found"));

        boolean adminExists = userRepository.findAll().stream()
                .anyMatch(user -> user.getRoles().stream()
                        .anyMatch(role -> role.getName().equals("ADMIN")));

        if (!adminExists) {
            // Read password from env var; generate a secure random one if not set
            String initialPassword = System.getenv("ADMIN_INITIAL_PASSWORD");
            if (initialPassword == null || initialPassword.isBlank()) {
                initialPassword = java.util.UUID.randomUUID().toString().replace("-", "").substring(0, 16);
            }

            User admin = new User();
            admin.setUsername("admin");
            admin.setPassword(passwordEncoder.encode(initialPassword));
            admin.setFullName("System Administrator");
            admin.setEmail("admin@billbull.app");
            admin.setBranch(defaultBranch);

            Set<Role> roles = new HashSet<>();
            roles.add(adminRole);
            admin.getRoles().addAll(roles);

            userRepository.save(admin);
            System.out.println("✅ Created default ADMIN user (username: admin)");
            System.out.println("⚠️  INITIAL PASSWORD: " + initialPassword);
            System.out.println("⚠️  Change the admin password immediately after first login!");
            return;
        }

        // Admin already exists — back-fill the branch if they somehow have none.
        // This handles existing deployments that were upgraded after this change.
        userRepository.findByUsername("admin").ifPresent(admin -> {
            if (admin.getBranch() == null) {
                admin.setBranch(defaultBranch);
                userRepository.save(admin);
                System.out.println("✅ Back-filled branch for existing admin user → " + defaultBranch.getName());
            }
        });
    }
}
