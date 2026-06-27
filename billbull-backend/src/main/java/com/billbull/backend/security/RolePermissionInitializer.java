package com.billbull.backend.security;

import com.billbull.backend.role.Role;
import com.billbull.backend.role.RoleRepository;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

/**
 * Seeds default role_permissions rows on startup.
 * Idempotent: skips rows that already exist.
 * @Order(2) ensures this runs after RBACInitializer which seeds roles and the admin user.
 */
@Component
@Order(2)
public class RolePermissionInitializer implements ApplicationRunner {

    private final RolePermissionRepository rolePermissionRepository;
    private final RoleRepository roleRepository;

    public RolePermissionInitializer(
            RolePermissionRepository rolePermissionRepository,
            RoleRepository roleRepository) {
        this.rolePermissionRepository = rolePermissionRepository;
        this.roleRepository = roleRepository;
    }

    @Override
    public void run(ApplicationArguments args) {
        // ADMIN: seed full access only if no row exists yet (first deployment).
        // Using seedIfAbsent so UI changes to ADMIN permissions are preserved across restarts.
        // The AdminSafeguardService prevents complete lockout of the ADMIN role.
        String[] allModules = {"sales", "inventory", "purchases", "finance",
                               "hr", "customer", "dashboard", "userManagement",
                               "batch_manual_select", "notification"};
        roleRepository.findByName("ADMIN").ifPresent(role -> {
            for (String module : allModules) {
                seedIfAbsent(role, module, true, true, true, true, true);
            }
        });

        // BRANCH_ADMIN: same full module access as ADMIN but branch-scoped (not in ALL_BRANCH_ROLES).
        roleRepository.findByName("BRANCH_ADMIN").ifPresent(role -> {
            for (String module : allModules) {
                seedIfAbsent(role, module, true, true, true, true, true);
            }
        });

        // SALES: sales operations, customer, read-only inventory, dashboard
        roleRepository.findByName("SALES").ifPresent(role -> {
            seedIfAbsent(role, "sales",        true,  true,  true,  false, true);
            seedIfAbsent(role, "customer",     true,  true,  true,  false, false);
            seedIfAbsent(role, "inventory",    true,  false, false, false, false);
            seedIfAbsent(role, "dashboard",    true,  false, false, false, false);
            seedIfAbsent(role, "notification", true,  true,  false, false, false);
        });

        // INVENTORY_MANAGER: full inventory + purchases, dashboard
        roleRepository.findByName("INVENTORY_MANAGER").ifPresent(role -> {
            seedIfAbsent(role, "inventory",    true,  true,  true,  false, true);
            seedIfAbsent(role, "purchases",    true,  true,  true,  false, true);
            seedIfAbsent(role, "dashboard",    true,  false, false, false, false);
            seedIfAbsent(role, "notification", true,  true,  false, false, false);
        });

        // DELIVERY_PERSON: delivery-focused employee role, configurable in Roles & Permissions.
        roleRepository.findByName("DELIVERY_PERSON").ifPresent(role -> {
            seedIfAbsent(role, "sales",        true,  false, false, false, false);
            seedIfAbsent(role, "customer",     true,  false, false, false, false);
            seedIfAbsent(role, "dashboard",    true,  false, false, false, false);
            seedIfAbsent(role, "notification", true,  true,  false, false, false);
        });

        // ACCOUNTANT: full finance, read/export purchases+sales, dashboard
        roleRepository.findByName("ACCOUNTANT").ifPresent(role -> {
            seedIfAbsent(role, "finance",      true,  true,  true,  true,  true);
            seedIfAbsent(role, "purchases",    true,  false, false, false, true);
            seedIfAbsent(role, "sales",        true,  false, false, false, true);
            seedIfAbsent(role, "dashboard",    true,  false, false, false, false);
            seedIfAbsent(role, "notification", true,  true,  false, false, false);
        });

        // HR: employee management, dashboard
        roleRepository.findByName("HR").ifPresent(role -> {
            seedIfAbsent(role, "hr",           true,  true,  true,  false, true);
            seedIfAbsent(role, "dashboard",    true,  false, false, false, false);
            seedIfAbsent(role, "notification", true,  true,  false, false, false);
        });

        // Financial flow Phase 8.5 permissions (PDF §21A — maker-checker / override controls):
        //   permissions.journal.create       → ACCOUNTANT can create manual JVs
        //   permissions.journal.approve      → ACCOUNTANT can approve JVs up to threshold
        //   permissions.journal.approve-high-value → MANAGER/ADMIN can approve above threshold
        //   permissions.posting.backdate-into-locked → ADMIN can post into closed period
        //   permissions.sales.override-credit-limit  → MANAGER/ADMIN can override credit check
        //   permissions.vendor.advance               → ACCOUNTANT can manage vendor advances
        //   permissions.customer.advance.refund      → MANAGER/ADMIN can refund customer advances
        roleRepository.findByName("ACCOUNTANT").ifPresent(role -> {
            seedIfAbsent(role, "permissions.journal.create",         true, true, true, false, false);
            seedIfAbsent(role, "permissions.journal.approve",        true, true, true, true,  false);
            seedIfAbsent(role, "permissions.vendor.advance",         true, true, true, false, false);
        });
        roleRepository.findByName("MANAGER").ifPresent(role -> {
            // Base module access so MANAGER can see the modules their approvals pertain to
            seedIfAbsent(role, "sales",      true,  false, false, true,  false);
            seedIfAbsent(role, "finance",    true,  false, false, true,  false);
            seedIfAbsent(role, "purchases",  true,  false, false, true,  false);
            seedIfAbsent(role, "customer",   true,  false, false, false, false);
            seedIfAbsent(role, "dashboard",  true,  false, false, false, false);
            seedIfAbsent(role, "notification", true, true, false, false, false);
            // Special approval permissions
            seedIfAbsent(role, "permissions.journal.approve",              true, true, true, true,  false);
            seedIfAbsent(role, "permissions.journal.approve-high-value",   true, true, true, true,  false);
            seedIfAbsent(role, "permissions.sales.override-credit-limit",  true, true, true, true,  false);
            seedIfAbsent(role, "permissions.customer.advance.refund",      true, true, true, true,  false);
        });
        roleRepository.findByName("ADMIN").ifPresent(role -> {
            seedIfAbsent(role, "permissions.journal.approve-high-value",   true, true, true, true,  false);
            seedIfAbsent(role, "permissions.posting.backdate-into-locked", true, true, true, true,  false);
            seedIfAbsent(role, "permissions.sales.override-credit-limit",  true, true, true, true,  false);
            seedIfAbsent(role, "permissions.customer.advance.refund",      true, true, true, true,  false);
        });
        roleRepository.findByName("BRANCH_ADMIN").ifPresent(role -> {
            seedIfAbsent(role, "permissions.journal.approve-high-value",   true, true, true, true,  false);
            seedIfAbsent(role, "permissions.posting.backdate-into-locked", true, true, true, true,  false);
            seedIfAbsent(role, "permissions.sales.override-credit-limit",  true, true, true, true,  false);
            seedIfAbsent(role, "permissions.customer.advance.refund",      true, true, true, true,  false);
        });
    }

    private void seedIfAbsent(
            Role role, String module,
            boolean view, boolean create, boolean edit,
            boolean approve, boolean export) {

        if (!rolePermissionRepository.existsByRoleAndModule(role, module)) {
            RolePermission rp = new RolePermission();
            rp.setRole(role);
            rp.setModule(module);
            rp.setCanView(view);
            rp.setCanCreate(create);
            rp.setCanEdit(edit);
            // canDelete defaults to same as canEdit for seeded roles
            rp.setCanDelete(edit);
            rp.setCanApprove(approve);
            rp.setCanExport(export);
            rolePermissionRepository.save(rp);
        }
    }
}
