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
                               "batch_manual_select", "notification", "pos"};
        roleRepository.findByName("ADMIN").ifPresent(role -> {
            for (String module : allModules) {
                seedIfAbsent(role, module, true, true, true, true, true);
            }
        });

        // BRANCH_ADMIN: full module access like ADMIN but branch-scoped (not in ALL_BRANCH_ROLES).
        // userManagement is deliberately excluded: role/user administration endpoints are
        // hasRole('ADMIN') only, so granting the module would only show a dead page.
        roleRepository.findByName("BRANCH_ADMIN").ifPresent(role -> {
            for (String module : allModules) {
                if ("userManagement".equals(module)) continue;
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
        //   permissions.customer.advance.*           → ACCOUNTANT/MANAGER/ADMIN can manage customer advances
        roleRepository.findByName("ACCOUNTANT").ifPresent(role -> {
            seedIfAbsent(role, "permissions.journal.create",         true, true, true, false, false);
            seedIfAbsent(role, "permissions.journal.approve",        true, true, true, true,  false);
            seedIfAbsent(role, "permissions.vendor.advance",         true, true, true, false, false);
            seedIfAbsent(role, "permissions.customer.advance.view",  true, true, true, false, false);
            seedIfAbsent(role, "permissions.customer.advance.receive",true, true, true, false, false);
            seedIfAbsent(role, "permissions.customer.advance.apply", true, true, true, false, false);
            seedIfAbsent(role, "permissions.customer.advance.refund",true, true, true, false, false);
            seedIfAbsent(role, "permissions.customer.advance.adjust",true, true, true, false, false);
            seedIfAbsent(role, "permissions.customer.advance.void",  true, true, true, false, false);
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
            seedIfAbsent(role, "permissions.customer.advance.view",        true, true, true, true,  false);
            seedIfAbsent(role, "permissions.customer.advance.receive",     true, true, true, true,  false);
            seedIfAbsent(role, "permissions.customer.advance.apply",       true, true, true, true,  false);
            seedIfAbsent(role, "permissions.customer.advance.refund",      true, true, true, true,  false);
            seedIfAbsent(role, "permissions.customer.advance.adjust",      true, true, true, true,  false);
            seedIfAbsent(role, "permissions.customer.advance.void",        true, true, true, true,  false);
        });
        roleRepository.findByName("ADMIN").ifPresent(role -> {
            seedIfAbsent(role, "permissions.journal.approve-high-value",   true, true, true, true,  false);
            seedIfAbsent(role, "permissions.posting.backdate-into-locked", true, true, true, true,  false);
            seedIfAbsent(role, "permissions.sales.override-credit-limit",  true, true, true, true,  false);
            seedIfAbsent(role, "permissions.customer.advance.view",        true, true, true, true,  false);
            seedIfAbsent(role, "permissions.customer.advance.receive",     true, true, true, true,  false);
            seedIfAbsent(role, "permissions.customer.advance.apply",       true, true, true, true,  false);
            seedIfAbsent(role, "permissions.customer.advance.refund",      true, true, true, true,  false);
            seedIfAbsent(role, "permissions.customer.advance.adjust",      true, true, true, true,  false);
            seedIfAbsent(role, "permissions.customer.advance.void",        true, true, true, true,  false);
        });

        // SUPERVISOR: POS floor oversight — authorizes cashier shift handovers/takeovers,
        // read access to sales + dashboard, no finance/inventory management.
        roleRepository.findByName("SUPERVISOR").ifPresent(role -> {
            seedIfAbsent(role, "sales",        true,  false, false, true,  false);
            seedIfAbsent(role, "customer",     true,  false, false, false, false);
            seedIfAbsent(role, "dashboard",    true,  false, false, false, false);
            seedIfAbsent(role, "notification", true,  true,  false, false, false);
        });
        roleRepository.findByName("BRANCH_ADMIN").ifPresent(role -> {
            seedIfAbsent(role, "permissions.journal.approve-high-value",   true, true, true, true,  false);
            seedIfAbsent(role, "permissions.posting.backdate-into-locked", true, true, true, true,  false);
            seedIfAbsent(role, "permissions.sales.override-credit-limit",  true, true, true, true,  false);
            seedIfAbsent(role, "permissions.customer.advance.view",        true, true, true, true,  false);
            seedIfAbsent(role, "permissions.customer.advance.receive",     true, true, true, true,  false);
            seedIfAbsent(role, "permissions.customer.advance.apply",       true, true, true, true,  false);
            seedIfAbsent(role, "permissions.customer.advance.refund",      true, true, true, true,  false);
            seedIfAbsent(role, "permissions.customer.advance.adjust",      true, true, true, true,  false);
            seedIfAbsent(role, "permissions.customer.advance.void",        true, true, true, true,  false);
        });

        // ── User-Based Data Visibility / Ownership Filtering (Topic 2) ────────────────────────────
        // permissions.records.view-all (canView=true) is the ownership override: holders bypass
        // ownership filtering and see every user's records (still subject to branch scope). ADMIN /
        // BRANCH_ADMIN / SUPER_ADMIN bypass in code regardless (OwnershipAccessService.rolesGrantViewAll)
        // — seeding an explicit row here surfaces the toggle in Roles & Permissions and grants it to
        // the oversight roles by default. Everyone NOT holding it is ownership-restricted (own records
        // only) once ownership.filtering.enabled is turned on for the tenant.
        for (String overrideRole : new String[]{"ADMIN", "BRANCH_ADMIN", "MANAGER", "SUPERVISOR"}) {
            roleRepository.findByName(overrideRole).ifPresent(role ->
                    seedIfAbsent(role, "permissions.records.view-all", true, false, false, false, false));
        }

        // ── POS Terminal Lifecycle RBAC extension ─────────────────────────────────────────────
        // pos.terminals (and the other pos.* sub-resources) carry the ordinary 6-flag CRUD shape
        // for horizontal/vertical access; terminal-lifecycle *actions* (approve/reject/archive/
        // restore/block/unblock/decommission/rename/assign-counter/set-main) don't map cleanly onto
        // those 6 flags — Decommission and Block are both "destructive-ish" but must be independently
        // grantable, so each action gets its own permissions.pos.terminal.<action> single-switch row,
        // mirroring the existing permissions.journal.*/permissions.sales.* pattern. ADMIN/BRANCH_ADMIN
        // already receive full "pos" + sub-resource access from the allModules loops above; this
        // section only adds their per-action terminal grants plus the narrower MANAGER/SUPERVISOR/
        // SALES defaults described in BillBull-POS-RBAC-Extension (design doc).
        String[] allTerminalActions = {
                "permissions.pos.terminal.register", "permissions.pos.terminal.rename",
                "permissions.pos.terminal.assigncounter", "permissions.pos.terminal.setmain",
                "permissions.pos.terminal.approve", "permissions.pos.terminal.reject",
                "permissions.pos.terminal.archive", "permissions.pos.terminal.restore",
                "permissions.pos.terminal.block", "permissions.pos.terminal.unblock",
                "permissions.pos.terminal.decommission",
                "permissions.pos.terminal.keepactive", "permissions.pos.terminal.setautoarchiveexempt",
        };
        for (String fullAdminRole : new String[]{"ADMIN", "BRANCH_ADMIN"}) {
            roleRepository.findByName(fullAdminRole).ifPresent(role -> {
                for (String action : allTerminalActions) {
                    seedIfAbsent(role, action, true, true, true, true, true);
                }
            });
        }

        // MANAGER: "Most POS administration" — every terminal action except permanent Decommission,
        // which stays reserved for ADMIN/BRANCH_ADMIN given it's irreversible and burns a slot forever.
        roleRepository.findByName("MANAGER").ifPresent(role -> {
            seedIfAbsent(role, "pos",             true,  false, true,  false, false);
            seedIfAbsent(role, "pos.terminals",   true,  false, true,  false, false);
            for (String action : new String[]{
                    "permissions.pos.terminal.register", "permissions.pos.terminal.rename",
                    "permissions.pos.terminal.assigncounter", "permissions.pos.terminal.setmain",
                    "permissions.pos.terminal.approve", "permissions.pos.terminal.reject",
                    "permissions.pos.terminal.archive", "permissions.pos.terminal.restore",
                    "permissions.pos.terminal.block", "permissions.pos.terminal.unblock",
                    "permissions.pos.terminal.keepactive", "permissions.pos.terminal.setautoarchiveexempt"}) {
                seedIfAbsent(role, action, true, true, true, true, true);
            }
        });

        // SUPERVISOR: "Limited terminal administration" — floor-level actions only (rename, assign
        // counter, approve/reject a new registration, block/unblock, restore, dismiss a stale
        // warning). No Archive (changes branch slot availability), no Decommission (irreversible),
        // and no auto-archive-exempt toggle (a policy/configuration change) — all three reserved
        // for MANAGER/ADMIN/BRANCH_ADMIN.
        roleRepository.findByName("SUPERVISOR").ifPresent(role -> {
            seedIfAbsent(role, "pos",             true,  false, false, false, false);
            seedIfAbsent(role, "pos.terminals",   true,  false, true,  false, false);
            for (String action : new String[]{
                    "permissions.pos.terminal.rename", "permissions.pos.terminal.assigncounter",
                    "permissions.pos.terminal.approve", "permissions.pos.terminal.reject",
                    "permissions.pos.terminal.block", "permissions.pos.terminal.unblock",
                    "permissions.pos.terminal.restore", "permissions.pos.terminal.keepactive"}) {
                seedIfAbsent(role, action, true, true, true, true, true);
            }
        });

        // SALES (cashier): POS usage only — sales.pos already covers day-to-day checkout. No
        // terminal-administration module access and no terminal-action grants at all.
        roleRepository.findByName("SALES").ifPresent(role -> {
            seedIfAbsent(role, "pos",           true, false, false, false, false);
            seedIfAbsent(role, "pos.terminals", true, false, false, false, false);
            seedIfAbsent(role, "permissions.customer.advance.view", true, false, false, false, false);
            seedIfAbsent(role, "permissions.customer.advance.receive", true, true, false, false, false);
            seedIfAbsent(role, "permissions.customer.advance.apply", true, true, false, false, false);
        });

        // ── Cash Drop / Outs Management RBAC ──────────────────────────────────────────────────
        // Single-switch permissions.pos.cashmovement.<action> rows, same mechanism as
        // permissions.pos.terminal.<action> above — canView expresses "granted" for these rows.
        // Cashier: create + view own session's movements only (PosCashMovementController
        // requires an explicit sessionId filter for holders of view-without-viewall).
        // Supervisor/Manager/Admin/Branch Admin: full create/view/viewall/edit/void.
        String[] allCashMovementActions = {
                "permissions.pos.cashmovement.create", "permissions.pos.cashmovement.view",
                "permissions.pos.cashmovement.viewall", "permissions.pos.cashmovement.edit",
                "permissions.pos.cashmovement.void",
        };
        for (String fullAccessRole : new String[]{"ADMIN", "BRANCH_ADMIN", "MANAGER", "SUPERVISOR"}) {
            roleRepository.findByName(fullAccessRole).ifPresent(role -> {
                for (String action : allCashMovementActions) {
                    seedIfAbsent(role, action, true, true, true, true, true);
                }
            });
        }
        roleRepository.findByName("SALES").ifPresent(role -> {
            for (String action : new String[]{
                    "permissions.pos.cashmovement.create", "permissions.pos.cashmovement.view"}) {
                seedIfAbsent(role, action, true, true, true, true, true);
            }
        });

        // ── POS Receipt Reprint RBAC ───────────────────────────────────────────────────────────
        // Single-switch permissions.pos.receipt.reprint row (canView == "granted"), same mechanism
        // as permissions.pos.cashmovement.* above. Deliberately NOT tied to invoice ownership:
        // reprinting a duplicate copy is a counter-service action any authorised cashier of the
        // invoice's branch performs, including for sales rung up by a colleague on another
        // terminal. Branch/tenant isolation is enforced separately by BranchAccessService.
        for (String reprintRole : new String[]{
                "ADMIN", "BRANCH_ADMIN", "MANAGER", "SUPERVISOR", "SALES"}) {
            roleRepository.findByName(reprintRole).ifPresent(role ->
                    seedIfAbsent(role, "permissions.pos.receipt.reprint", true, true, true, true, true));
        }

        // ── POS Reports RBAC (Customers & Sales > Reports > POS Reports) ────────────────────────
        // Read-only historical X/Z-Report browser. Admin/Branch Admin/Manager/Supervisor: full
        // view/viewall/print/export. Sales (cashier-level): view only, own branch (viewall stays
        // off, matching the branch-pinned fallback in PosReportsController#resolveBranchFilter).
        String[] allPosReportsActions = {
                "permissions.pos.reports.view", "permissions.pos.reports.viewall",
                "permissions.pos.reports.print", "permissions.pos.reports.export",
        };
        for (String fullAccessRole : new String[]{"ADMIN", "BRANCH_ADMIN", "MANAGER", "SUPERVISOR"}) {
            roleRepository.findByName(fullAccessRole).ifPresent(role -> {
                for (String action : allPosReportsActions) {
                    seedIfAbsent(role, action, true, true, true, true, true);
                }
            });
        }
        roleRepository.findByName("SALES").ifPresent(role -> {
            seedIfAbsent(role, "permissions.pos.reports.view", true, true, true, true, true);
        });

        // ── Enterprise Console > POS Administration RBAC (Phase 1) ─────────────────────────────
        // Post-transaction financial governance module — deliberately NOT part of "pos"/"sales"
        // operational access above. Modules follow the brief's pos.admin.* naming, mapped onto
        // the existing 6-flag shape (canView/canCreate/canEdit/canDelete/canApprove/canExport)
        // since ModulePermissionService has no other action vocabulary:
        //   pos.admin                          -> pos.admin.view                        (canView)
        //   pos.admin.session                  -> pos.admin.session.correct             (canView+canCreate)
        //   pos.admin.transaction               -> pos.admin.transaction.correct         (canView+canCreate)
        //   pos.admin.cashmovement.category     -> .view (canView) / .manage (canCreate+canEdit+canDelete)
        //   pos.admin.approvals                 -> .view (canView) / .approve+.reject (canApprove — both
        //                                          actions share one flag, same single-approval-permission
        //                                          model JournalEntryService uses)
        //   pos.admin.audit                     -> pos.admin.audit.view                 (canView)
        //
        // Role mapping: there is no literal Cashier/Finance/Branch Manager role seeded in this
        // system, so the review's hierarchy (§8/§12) is mapped onto the closest existing roles —
        // ADMIN=Enterprise Admin, BRANCH_ADMIN=Branch Manager, ACCOUNTANT=Finance,
        // SUPERVISOR=Supervisor (request-only, no approve). Cashier-equivalent roles (SALES,
        // INVENTORY_MANAGER, HR, DELIVERY_PERSON, MANAGER) get no pos.admin.* access — this
        // module is Enterprise Governance, not operational POS (§2 of the review).
        for (String fullAccessRole : new String[]{"ADMIN", "BRANCH_ADMIN"}) {
            roleRepository.findByName(fullAccessRole).ifPresent(role -> {
                seedIfAbsent(role, "pos.admin",                      true, false, false, false, false);
                seedIfAbsent(role, "pos.admin.session",              true, true,  false, false, false);
                seedIfAbsent(role, "pos.admin.transaction",          true, true,  false, false, false);
                seedIfAbsent(role, "pos.admin.cashmovement.category",true, true,  true,  false, false);
                seedIfAbsent(role, "pos.admin.approvals",            true, false, false, true,  false);
                seedIfAbsent(role, "pos.admin.audit",                true, false, false, false, false);
            });
        }
        roleRepository.findByName("SUPERVISOR").ifPresent(role -> {
            seedIfAbsent(role, "pos.admin",             true, false, false, false, false);
            seedIfAbsent(role, "pos.admin.session",     true, true,  false, false, false);
            seedIfAbsent(role, "pos.admin.transaction", true, true,  false, false, false);
        });
        roleRepository.findByName("ACCOUNTANT").ifPresent(role -> {
            seedIfAbsent(role, "pos.admin",                       true, false, false, false, false);
            seedIfAbsent(role, "pos.admin.cashmovement.category", true, true,  true,  false, false);
            seedIfAbsent(role, "pos.admin.approvals",             true, false, false, true,  false);
            seedIfAbsent(role, "pos.admin.audit",                 true, false, false, false, false);
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
