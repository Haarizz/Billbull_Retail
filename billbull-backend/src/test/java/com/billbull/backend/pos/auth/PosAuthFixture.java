package com.billbull.backend.pos.auth;

import com.billbull.backend.role.Role;
import com.billbull.backend.security.BranchContextHolder;
import com.billbull.backend.security.ModulePermissionService;
import com.billbull.backend.security.RolePermission;
import com.billbull.backend.security.RolePermissionRepository;
import com.billbull.backend.settings.branch.BranchAccessService;
import com.billbull.backend.settings.branch.BranchRepository;
import com.billbull.backend.user.UserRepository;
import org.junit.jupiter.api.function.Executable;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * The real authorization services over mocked storage, shared by the hardening tests.
 *
 * <p>{@link ModulePermissionService} decides from role_permissions rows ({@link #rowsFor}), so
 * explicit rows, parent fallback and explicit denies behave as in production.
 * {@link BranchAccessService} decides from a real {@link BranchContextHolder}, as JwtFilter sets
 * it. Branch {@link #OWN} is the signed-in user's; {@link #OTHER} is one they cannot reach.
 */
public final class PosAuthFixture {

    public static final long OWN = 1L;
    public static final long OTHER = 2L;

    public final RolePermissionRepository rolePermissionRepository = mock(RolePermissionRepository.class);
    public final ModulePermissionService permissions = new ModulePermissionService(rolePermissionRepository);
    public final BranchAccessService branchAccess =
            new BranchAccessService(mock(UserRepository.class), mock(BranchRepository.class));

    public PosAuthFixture() {
        when(rolePermissionRepository.findByRole_NameIn(anyCollection())).thenAnswer(inv -> {
            List<RolePermission> rows = new ArrayList<>();
            for (Object role : (Collection<?>) inv.getArgument(0)) {
                rows.addAll(rowsFor(role.toString()));
            }
            return rows;
        });
    }

    /** A branch-restricted user ("user") whose only branch is {@code branch}. */
    public void signIn(String role, long branch) {
        signIn("user", role, branch);
    }

    public void signIn(String username, String role, long branch) {
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken(username, "pw", "ROLE_" + role));
        BranchContextHolder.set(new BranchContextHolder.BranchContext(branch, Set.of(branch), false));
    }

    /** ADMIN on the consolidated all-branches view, as JwtFilter sets it. */
    public void signInAsAdministrator() {
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken("admin", "pw", "ROLE_ADMIN"));
        BranchContextHolder.set(new BranchContextHolder.BranchContext(null, Set.of(), true));
    }

    public void clear() {
        SecurityContextHolder.clearContext();
        BranchContextHolder.clear();
    }

    public static void assertForbidden(Executable call) {
        ResponseStatusException refused = assertThrows(ResponseStatusException.class, call);
        assertEquals(HttpStatus.FORBIDDEN, refused.getStatusCode());
    }

    /** role_permissions rows per role: (module, view, create, edit, delete, approve). */
    static List<RolePermission> rowsFor(String role) {
        return switch (role) {
            // Least-privilege till cashier: the documented till grants, nothing in POS admin.
            case "TILL_CASHIER" -> List.of(
                    row(role, "sales.pos", true, true, false, false, false),
                    row(role, "sales.invoice", true, false, false, false, false),
                    row(role, "inventory.product", true, false, false, false, false));
            case "TILL_ONLY" -> List.of(row(role, "sales.pos", true, true, false, false, false));
            case "INVOICE_CLERK" -> List.of(row(role, "sales.invoice", true, true, true, false, false));
            case "INVENTORY_CLERK" -> List.of(row(role, "inventory.product", true, false, false, false, false));
            case "PURCHASER" -> List.of(row(role, "purchases.grn", true, true, true, false, false));
            case "CRM" -> List.of(row(role, "customer", true, true, true, false, false));
            // Back-office Cash Drop / Outs operator, no till.
            case "CASH_OFFICE" -> List.of(
                    row(role, "permissions.pos.cashmovement.create", true, true, true, true, true),
                    row(role, "permissions.pos.cashmovement.view", true, true, true, true, true),
                    row(role, "permissions.pos.cashmovement.viewall", true, true, true, true, true),
                    row(role, "permissions.pos.cashmovement.edit", true, true, true, true, true),
                    row(role, "permissions.pos.cashmovement.void", true, true, true, true, true));
            // Seeded by RolePermissionInitializer.
            case "SALES" -> List.of(
                    row(role, "sales", true, true, true, false, false),
                    row(role, "pos", true, false, false, false, false),
                    row(role, "permissions.pos.cashmovement.create", true, true, true, true, true),
                    row(role, "permissions.pos.cashmovement.view", true, true, true, true, true));
            case "MANAGER" -> List.of(
                    row(role, "sales", true, false, false, false, true),
                    row(role, "pos", true, false, true, true, false));
            case "BRANCH_ADMIN", "ADMIN" -> List.of(
                    row(role, "sales", true, true, true, true, true),
                    row(role, "pos", true, true, true, true, true),
                    row(role, "inventory", true, true, true, true, true),
                    row(role, "permissions.pos.cashmovement.create", true, true, true, true, true),
                    row(role, "permissions.pos.cashmovement.view", true, true, true, true, true),
                    row(role, "permissions.pos.cashmovement.viewall", true, true, true, true, true),
                    row(role, "permissions.pos.cashmovement.edit", true, true, true, true, true),
                    row(role, "permissions.pos.cashmovement.void", true, true, true, true, true));
            case "HR" -> List.of(row(role, "hr", true, true, true, false, false));
            default -> List.of();
        };
    }

    private static RolePermission row(String roleName, String module,
                                      boolean view, boolean create, boolean edit, boolean delete, boolean approve) {
        Role role = new Role();
        role.setName(roleName);
        RolePermission rp = new RolePermission();
        rp.setRole(role);
        rp.setModule(module);
        rp.setCanView(view);
        rp.setCanCreate(create);
        rp.setCanEdit(edit);
        rp.setCanDelete(delete);
        rp.setCanApprove(approve);
        return rp;
    }
}
