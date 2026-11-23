package com.billbull.backend.platform;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class PlatformPolicyFilterTest {

    private static PlatformState state(TenantLifecycleStatus status, Map<String, Boolean> modules) {
        return new PlatformState(true, status, null, "GROWTH", modules, Map.of(), 3L, null, "ops");
    }

    private static Outcome run(PlatformState state, String method, String path) throws Exception {
        PlatformStateService service = mock(PlatformStateService.class);
        when(service.current()).thenReturn(state);
        PlatformPolicyFilter filter = new PlatformPolicyFilter(service);
        MockHttpServletRequest req = new MockHttpServletRequest(method, path);
        MockHttpServletResponse res = new MockHttpServletResponse();
        AtomicBoolean passed = new AtomicBoolean();
        filter.doFilter(req, res, (r, s) -> passed.set(true));
        return new Outcome(passed.get(), res);
    }

    record Outcome(boolean passed, MockHttpServletResponse response) {}

    @Test
    void unmanagedTenantPassesEverything() throws Exception {
        assertTrue(run(PlatformState.unmanaged(), "POST", "/api/pos/checkout").passed());
    }

    @Test
    void suspendedTenantRefusesSignInAndEveryCall() throws Exception {
        PlatformState s = state(TenantLifecycleStatus.SUSPENDED, Map.of());
        Outcome login = run(s, "POST", "/api/auth/login");
        assertFalse(login.passed());
        assertEquals(423, login.response().getStatus());
        assertTrue(login.response().getContentAsString().contains("TENANT_SUSPENDED"));
        assertFalse(run(s, "GET", "/api/products").passed());
    }

    @Test
    void suspendedTenantStillAnswersThePlatformAgentAndClientLogs() throws Exception {
        PlatformState s = state(TenantLifecycleStatus.SUSPENDED, Map.of());
        assertTrue(run(s, "PUT", "/api/platform/state").passed());
        assertTrue(run(s, "POST", "/api/client-logs").passed());
        assertTrue(run(s, "GET", "/uploads/products/x.png").passed(), "non-API paths are not filtered");
    }

    @Test
    void readOnlyAllowsReadsAndSignInButNotWrites() throws Exception {
        PlatformState s = state(TenantLifecycleStatus.READ_ONLY, Map.of());
        assertTrue(run(s, "GET", "/api/sales/invoices").passed());
        assertTrue(run(s, "POST", "/api/auth/login").passed());
        assertTrue(run(s, "POST", "/api/session/switch-branch").passed());
        Outcome write = run(s, "POST", "/api/sales/invoices");
        assertFalse(write.passed());
        assertEquals(423, write.response().getStatus());
        assertTrue(write.response().getContentAsString().contains("TENANT_READ_ONLY"));
        assertFalse(run(s, "DELETE", "/api/products/5").passed());
    }

    @Test
    void disabledModuleIsForbiddenOnItsPathsOnly() throws Exception {
        PlatformState s = state(TenantLifecycleStatus.ACTIVE, Map.of("pos", false, "finance", true));
        Outcome pos = run(s, "GET", "/api/pos/sessions/active");
        assertFalse(pos.passed());
        assertEquals(403, pos.response().getStatus());
        assertTrue(pos.response().getContentAsString().contains("MODULE_NOT_ENTITLED"));
        assertFalse(run(s, "POST", "/api/auth/pos/pin/login").passed(), "till PIN sign-in belongs to POS");
        assertTrue(run(s, "GET", "/api/ledger/accounts").passed());
        assertTrue(run(s, "GET", "/api/sales/invoices").passed());
        assertTrue(run(s, "GET", "/api/possible").passed(), "prefix match is on a path-segment boundary");
    }

    @Test
    void preflightIsNeverBlocked() throws Exception {
        assertTrue(run(state(TenantLifecycleStatus.SUSPENDED, Map.of()), "OPTIONS", "/api/products").passed());
    }

    @Test
    void customMessageIsJsonEscaped() throws Exception {
        PlatformState s = new PlatformState(true, TenantLifecycleStatus.SUSPENDED, "Overdue \"invoice\"\nCall us",
                null, Map.of(), Map.of(), 1L, null, null);
        String body = run(s, "GET", "/api/products").response().getContentAsString();
        assertTrue(body.contains("Overdue \\\"invoice\\\"\\nCall us"), body);
    }
}
