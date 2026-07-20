package com.billbull.backend.security;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.when;

import java.util.List;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import com.billbull.backend.role.Role;

@ExtendWith(MockitoExtension.class)
class ModulePermissionServiceTest {

    @Mock private RolePermissionRepository rolePermissionRepository;

    private ModulePermissionService service;

    @BeforeEach
    void setUp() {
        service = new ModulePermissionService(rolePermissionRepository);
    }

    @AfterEach
    void clearContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void deniesWhenNoAuthentication() {
        SecurityContextHolder.clearContext();
        assertFalse(service.canView("sales"));
    }

    @Test
    void deniesByDefaultWhenNoPermissionRowExists() {
        authenticateAs("SALES");
        when(rolePermissionRepository.findByRole_NameIn(anyCollection())).thenReturn(List.of());
        assertFalse(service.canView("sales"));
    }

    @Test
    void allowsWhenExactRowGrantsFlag() {
        authenticateAs("SALES");
        when(rolePermissionRepository.findByRole_NameIn(anyCollection()))
                .thenReturn(List.of(permission("SALES", "sales", true, false)));
        assertTrue(service.canView("sales"));
        assertFalse(service.canApprove("sales"));
    }

    @Test
    void exactRowIsAuthoritativeAndBlocksParentFallback() {
        authenticateAs("SALES");
        when(rolePermissionRepository.findByRole_NameIn(anyCollection()))
                .thenReturn(List.of(
                        permission("SALES", "sales", true, true),
                        permission("SALES", "sales.quotation", false, false)));
        // sales.quotation has an explicit all-false row → parent grant must NOT leak through
        assertFalse(service.canView("sales.quotation"));
        assertFalse(service.canApprove("sales.quotation"));
    }

    @Test
    void fallsBackToParentWhenNoExactRowExists() {
        authenticateAs("SALES");
        when(rolePermissionRepository.findByRole_NameIn(anyCollection()))
                .thenReturn(List.of(permission("SALES", "sales", true, false)));
        assertTrue(service.canView("sales.quotation"));
    }

    /**
     * The exact scenario an admin sees as a green sub-toggle on a grey module:
     * parent module view is OFF, but the sub-resource has an explicit view=true row.
     * The API for that page MUST allow — otherwise the toggle lies (403 despite green).
     */
    @Test
    void allowsSubResourceWhenParentIsOffButSubRowGrantsIt() {
        authenticateAs("CASHIER");
        when(rolePermissionRepository.findByRole_NameIn(anyCollection()))
                .thenReturn(List.of(
                        permission("CASHIER", "sales", false, false),          // module header grey
                        permission("CASHIER", "sales.pos", true, false)));      // POS toggle green
        assertTrue(service.canView("sales.pos"), "green POS toggle must not 403");
        assertFalse(service.canView("sales.invoice"), "sibling stays denied (explicit parent off)");
    }

    /**
     * Multi-segment key: parent must be the top-level segment, not the two-segment prefix,
     * so inherited access resolves against the real module row.
     */
    @Test
    void multiSegmentSubKeyFallsBackToTopLevelParent() {
        authenticateAs("ACCOUNTANT");
        when(rolePermissionRepository.findByRole_NameIn(anyCollection()))
                .thenReturn(List.of(permission("ACCOUNTANT", "finance", true, true)));
        assertTrue(service.canView("finance.config"));
        assertTrue(service.canApprove("finance.voucher"));
    }

    @Test
    void moduleMatchingIsCaseInsensitive() {
        authenticateAs("ADMIN");
        when(rolePermissionRepository.findByRole_NameIn(anyCollection()))
                .thenReturn(List.of(permission("ADMIN", "userManagement", true, true)));
        assertTrue(service.canView("usermanagement"));
        assertTrue(service.canView("userManagement.role")); // parent fallback, case-insensitive
    }

    @Test
    void allowWinsAcrossMultipleRoles() {
        authenticateAs("SALES", "ACCOUNTANT");
        when(rolePermissionRepository.findByRole_NameIn(anyCollection()))
                .thenReturn(List.of(
                        permission("SALES", "finance", false, false),
                        permission("ACCOUNTANT", "finance", true, true)));
        assertTrue(service.canView("finance"));
        assertTrue(service.canApprove("finance"));
    }

    @Test
    void requireCanApproveThrowsWhenDenied() {
        authenticateAs("SALES");
        when(rolePermissionRepository.findByRole_NameIn(anyCollection()))
                .thenReturn(List.of(permission("SALES", "finance", true, false)));
        assertThrows(AccessDeniedException.class, () -> service.requireCanApprove("finance"));
        assertDoesNotThrow(() -> service.requireCanView("finance"));
    }

    // ── Fixtures ────────────────────────────────────────────────────────────

    private void authenticateAs(String... roles) {
        String[] authorities = new String[roles.length];
        for (int i = 0; i < roles.length; i++) {
            authorities[i] = "ROLE_" + roles[i];
        }
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken("user", "pw", authorities));
    }

    private RolePermission permission(String roleName, String module, boolean view, boolean approve) {
        Role role = new Role();
        role.setName(roleName);
        RolePermission rp = new RolePermission();
        rp.setRole(role);
        rp.setModule(module);
        rp.setCanView(view);
        rp.setCanApprove(approve);
        return rp;
    }
}
