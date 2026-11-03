package com.billbull.backend.pos.auth;

import com.billbull.backend.exception.AdminApprovalRequiredException;
import com.billbull.backend.pos.audit.PosAuditService;
import com.billbull.backend.pos.settings.PosSettings;
import com.billbull.backend.pos.settings.PosSettingsService;
import com.billbull.backend.role.Role;
import com.billbull.backend.settings.branch.BranchAccessService;
import com.billbull.backend.user.User;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.billbull.backend.pos.auth.PosCloseApprovalService.Action;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class PosCloseApprovalServiceTest {

    private static final Long BRANCH = 7L;
    private static final Long SESSION = 42L;

    @Mock PosSettingsService posSettingsService;
    @Mock BranchAccessService branchAccessService;
    @Mock PosAuditService auditService;

    PosCloseApprovalService service;
    PosSettings settings;

    @BeforeEach
    void setUp() {
        service = new PosCloseApprovalService(posSettingsService, branchAccessService, auditService);
        settings = new PosSettings();
        settings.setBranchId(BRANCH);
        when(posSettingsService.getForBranch(BRANCH)).thenReturn(settings);
        when(branchAccessService.canAccessBranch(any(), eq(BRANCH))).thenReturn(true);
        signIn("cashier1", "CASHIER");
    }

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void offByDefaultSoCloseGoesThroughWithoutApproval() {
        assertNull(service.check(Action.SESSION_CLOSE, BRANCH, SESSION, null));
        assertNull(service.check(Action.DAY_CLOSE, BRANCH, BRANCH, null));
    }

    @Test
    void whenOnACashierCloseWithoutGrantIsRefused() {
        settings.setRequireAdminApprovalForSessionClose(true);
        AdminApprovalRequiredException ex = assertThrows(AdminApprovalRequiredException.class,
                () -> service.check(Action.SESSION_CLOSE, BRANCH, SESSION, null));
        assertEquals("SESSION_CLOSE", ex.getAction());
    }

    @Test
    void sessionAndDayCloseSwitchesAreIndependent() {
        settings.setRequireAdminApprovalForDayClose(true);
        assertNull(service.check(Action.SESSION_CLOSE, BRANCH, SESSION, null));
        assertThrows(AdminApprovalRequiredException.class,
                () -> service.check(Action.DAY_CLOSE, BRANCH, BRANCH, null));
    }

    @Test
    void signedInAdminApprovesImplicitly() {
        settings.setRequireAdminApprovalForSessionClose(true);
        signIn("boss", "ROLE_ADMIN");
        assertEquals("boss", service.check(Action.SESSION_CLOSE, BRANCH, SESSION, null));
    }

    @Test
    void adminGrantLetsCloseThroughAndIsSpentOnCompletion() {
        settings.setRequireAdminApprovalForSessionClose(true);
        AuthorizationResult r = service.approve(Action.SESSION_CLOSE, SESSION, BRANCH, user(1L, "boss", "BRANCH_ADMIN"));
        assertTrue(r.authorized(), r.reasonCode() + ": " + r.message());
        String token = r.authorizationToken();

        // check does not spend it — a close that fails for another reason can retry
        assertEquals("boss", service.check(Action.SESSION_CLOSE, BRANCH, SESSION, token));
        assertEquals("boss", service.check(Action.SESSION_CLOSE, BRANCH, SESSION, token));

        service.complete(Action.SESSION_CLOSE, BRANCH, SESSION, "T1", token, "boss");
        verify(auditService).logSessionEvent(SESSION, "T1", BRANCH, "SESSION_CLOSE_ADMIN_APPROVED", "approvedBy=boss");
        assertThrows(AdminApprovalRequiredException.class,
                () -> service.check(Action.SESSION_CLOSE, BRANCH, SESSION, token));
    }

    @Test
    void grantIsBoundToActionAndTarget() {
        settings.setRequireAdminApprovalForSessionClose(true);
        settings.setRequireAdminApprovalForDayClose(true);
        String token = service.approve(Action.SESSION_CLOSE, SESSION, BRANCH, user(1L, "boss", "ADMIN"))
                .authorizationToken();
        assertThrows(AdminApprovalRequiredException.class,
                () -> service.check(Action.SESSION_CLOSE, BRANCH, 99L, token));
        assertThrows(AdminApprovalRequiredException.class,
                () -> service.check(Action.DAY_CLOSE, BRANCH, BRANCH, token));
    }

    @Test
    void supervisorOrManagerCannotApprove() {
        AuthorizationResult sup = service.approve(Action.SESSION_CLOSE, SESSION, BRANCH, user(2L, "sup", "SUPERVISOR"));
        AuthorizationResult mgr = service.approve(Action.DAY_CLOSE, BRANCH, BRANCH, user(3L, "mgr", "MANAGER"));
        assertFalse(sup.authorized());
        assertEquals("ADMIN_REQUIRED", sup.reasonCode());
        assertFalse(mgr.authorized());
        assertNull(sup.authorizationToken());
    }

    @Test
    void adminWithoutBranchAccessCannotApprove() {
        when(branchAccessService.canAccessBranch(any(), eq(BRANCH))).thenReturn(false);
        AuthorizationResult r = service.approve(Action.SESSION_CLOSE, SESSION, BRANCH, user(5L, "other", "BRANCH_ADMIN"));
        assertFalse(r.authorized());
        assertEquals("BRANCH_NOT_ACCESSIBLE", r.reasonCode());
    }

    // ── fixtures ────────────────────────────────────────────────────────────────

    private static void signIn(String username, String authority) {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
                username, null, List.of(new SimpleGrantedAuthority(authority))));
    }

    private static User user(Long id, String username, String roleName) {
        User u = new User();
        u.setId(id);
        u.setUsername(username);
        Role role = new Role();
        role.setName(roleName);
        u.setRoles(Set.of(role));
        return u;
    }
}
