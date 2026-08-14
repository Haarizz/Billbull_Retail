package com.billbull.backend.sales.returns;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.backend.pos.auth.CredentialVerificationResult;
import com.billbull.backend.pos.auth.PosCredentialVerificationService;
import com.billbull.backend.role.Role;
import com.billbull.backend.security.AuditLogService;
import com.billbull.backend.user.User;

/**
 * Supervisor sign-off for high-risk returns (§15), and the policy that decides when it applies.
 *
 * <p>The gate is enforced in the service, not the UI: a caller hitting the API directly with no
 * credentials must be refused exactly as a cashier clicking Confirm would be (§10).
 */
@ExtendWith(MockitoExtension.class)
class SalesReturnAuthorizationTest {

    @Mock private PosCredentialVerificationService credentialVerificationService;
    @Mock private AuditLogService auditLogService;
    @Mock private SalesReturnAuthorizationPolicy authorizationPolicy;

    @InjectMocks private SalesReturnAuthorizationService service;

    // ---------------------------------------------------------------
    // Policy — when is sign-off required at all
    // ---------------------------------------------------------------

    @Test
    void policyDefaultsMeanNoApprovalIsEverRequired() {
        // Both settings default to 0, which must preserve the pre-existing behaviour exactly:
        // no return window, and no cash approval threshold.
        SalesReturnAuthorizationPolicy policy = policyWith(0, BigDecimal.ZERO);

        assertNull(policy.resolveAuthorizationReason(
                SalesReturnRefundMethod.CASH_REFUND, new BigDecimal("100000"), false));
        assertNull(policy.getReturnWindowDays());
        assertEquals(false, policy.isReturnWindowExpired(99999));
    }

    @Test
    void cashRefundAtOrAboveTheThresholdRequiresApproval() {
        SalesReturnAuthorizationPolicy policy = policyWith(0, new BigDecimal("500"));

        assertEquals("HIGH_VALUE_CASH_REFUND", policy.resolveAuthorizationReason(
                SalesReturnRefundMethod.CASH_REFUND, new BigDecimal("500"), false), "boundary is inclusive");
        assertEquals("HIGH_VALUE_CASH_REFUND", policy.resolveAuthorizationReason(
                SalesReturnRefundMethod.CASH_REFUND, new BigDecimal("500.01"), false));
        assertNull(policy.resolveAuthorizationReason(
                SalesReturnRefundMethod.CASH_REFUND, new BigDecimal("499.99"), false));
    }

    @Test
    void theThresholdAppliesOnlyToCashBecauseOnlyCashLeavesIrreversibly() {
        SalesReturnAuthorizationPolicy policy = policyWith(0, new BigDecimal("100"));

        for (SalesReturnRefundMethod method : Set.of(SalesReturnRefundMethod.CARD_REFUND,
                SalesReturnRefundMethod.BANK_TRANSFER, SalesReturnRefundMethod.CREDIT_VOUCHER,
                SalesReturnRefundMethod.CUSTOMER_CREDIT)) {
            assertNull(policy.resolveAuthorizationReason(method, new BigDecimal("9999"), false),
                    method + " is traceable and reversible, so it must not trip the cash threshold");
        }
    }

    @Test
    void anExpiredReturnWindowTakesPrecedenceOverTheCashThreshold() {
        SalesReturnAuthorizationPolicy policy = policyWith(30, new BigDecimal("100"));

        // A late, high-value cash refund is reported as the window breach — the more
        // significant of the two policies.
        assertEquals("RETURN_WINDOW_EXPIRED", policy.resolveAuthorizationReason(
                SalesReturnRefundMethod.CASH_REFUND, new BigDecimal("9999"), true));
        assertEquals(Integer.valueOf(30), policy.getReturnWindowDays());
        assertEquals(true, policy.isReturnWindowExpired(31));
        assertEquals(false, policy.isReturnWindowExpired(30), "the window itself is still inside");
    }

    // ---------------------------------------------------------------
    // Enforcement
    // ---------------------------------------------------------------

    @Test
    void approvalWithNoCredentialsIsForbidden() {
        SalesReturn ret = returnOf("SR-1");

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.authorize(ret, "HIGH_VALUE_CASH_REFUND", null, null));

        assertEquals(HttpStatus.FORBIDDEN, ex.getStatusCode());
        assertNull(ret.getAuthorizedByUserId(), "nothing may be stamped on a refused return");
        verify(credentialVerificationService, never()).verifyCredentials(anyString(), anyString());
    }

    @Test
    void blankCredentialsAreTreatedAsAbsent() {
        SalesReturn ret = returnOf("SR-1");

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.authorize(ret, "HIGH_VALUE_CASH_REFUND", "   ", "  "));

        assertEquals(HttpStatus.FORBIDDEN, ex.getStatusCode());
    }

    @Test
    void wrongCredentialsAreUnauthorizedAndAudited() {
        when(credentialVerificationService.verifyCredentials("sue", "wrong"))
                .thenReturn(CredentialVerificationResult.invalid("Incorrect password."));

        SalesReturn ret = returnOf("SR-1");
        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.authorize(ret, "HIGH_VALUE_CASH_REFUND", "sue", "wrong"));

        assertEquals(HttpStatus.UNAUTHORIZED, ex.getStatusCode());
        assertNull(ret.getAuthorizedByUserId());
        // Repeated failures against a refund approval are exactly what loss prevention looks for.
        verify(auditLogService).logDomainEvent(eqStr("SALES_RETURN"), eqStr("SR-1"),
                eqStr("RETURN_AUTHORIZATION_DENIED"), anyString());
    }

    @Test
    void aValidUserWithoutSupervisorRightsIsForbidden() {
        when(credentialVerificationService.verifyCredentials("bob", "pw"))
                .thenReturn(CredentialVerificationResult.valid(user(5L, "bob", "Bob Cashier", "CASHIER")));

        SalesReturn ret = returnOf("SR-1");
        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.authorize(ret, "HIGH_VALUE_CASH_REFUND", "bob", "pw"));

        assertEquals(HttpStatus.FORBIDDEN, ex.getStatusCode());
        assertNull(ret.getAuthorizedByUserId(), "a cashier must not be able to approve their own refund");
    }

    @Test
    void eachSupervisorRoleCanAuthorize() {
        for (String role : Set.of("ADMIN", "BRANCH_ADMIN", "MANAGER", "SUPERVISOR")) {
            lenient().when(credentialVerificationService.verifyCredentials("sup", "pw"))
                    .thenReturn(CredentialVerificationResult.valid(user(9L, "sup", "Sam Super", role)));

            SalesReturn ret = returnOf("SR-1");
            service.authorize(ret, "HIGH_VALUE_CASH_REFUND", "sup", "pw");

            assertEquals(Long.valueOf(9L), ret.getAuthorizedByUserId(), role + " should be able to authorize");
        }
    }

    @Test
    void successfulAuthorizationStampsTheApproverAndAudits() {
        when(credentialVerificationService.verifyCredentials("sup", "pw"))
                .thenReturn(CredentialVerificationResult.valid(user(9L, "sup", "Sam Super", "MANAGER")));

        SalesReturn ret = returnOf("SR-1");
        service.authorize(ret, "HIGH_VALUE_CASH_REFUND", "sup", "pw");

        assertEquals(Long.valueOf(9L), ret.getAuthorizedByUserId());
        assertEquals("sup", ret.getAuthorizedByUsername());
        assertEquals("HIGH_VALUE_CASH_REFUND", ret.getAuthorizationReason());
        assertNotNull(ret.getAuthorizedAt(), "approval time is part of the audit trail");

        verify(auditLogService).logDomainEvent(eqStr("SALES_RETURN"), eqStr("SR-1"),
                eqStr("RETURN_AUTHORIZED"), anyString());
    }

    // ---------------------------------------------------------------

    private static String eqStr(String v) {
        return org.mockito.ArgumentMatchers.eq(v);
    }

    private SalesReturnAuthorizationPolicy policyWith(int windowDays, BigDecimal threshold) {
        SalesReturnAuthorizationPolicy policy = new SalesReturnAuthorizationPolicy();
        ReflectionTestUtils.setField(policy, "returnWindowDays", windowDays);
        ReflectionTestUtils.setField(policy, "cashApprovalThreshold", threshold);
        return policy;
    }

    private static SalesReturn returnOf(String returnNumber) {
        SalesReturn r = new SalesReturn();
        r.setReturnNumber(returnNumber);
        r.setLinkedInvoice("INV-1");
        r.setRefundMethod(SalesReturnRefundMethod.CASH_REFUND);
        r.setRefundAmount(new BigDecimal("500.00"));
        return r;
    }

    private static User user(Long id, String username, String fullName, String roleName) {
        User u = new User();
        // User declares its own @Id field that shadows BaseEntity's, and overrides getId() to
        // read the shadowing one — while setId() is inherited and writes the base field. In
        // production Hibernate populates User.id directly, so the shadowing is invisible; in a
        // plain constructor it means setId() has no observable effect. Set the real field.
        ReflectionTestUtils.setField(u, "id", id);
        u.setUsername(username);
        u.setFullName(fullName);
        Role role = new Role();
        role.setName(roleName);
        u.setRoles(Set.of(role));
        return u;
    }
}
