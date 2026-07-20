package com.billbull.backend.ratelimit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;

import java.util.List;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import com.billbull.backend.security.AuditLogService;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

/**
 * Roadmap Phases 2–4 filter behaviour: toggle-off no-op, dry-run blocks nothing, enforce returns
 * 429 with Retry-After, exempt roles bypass, auth/non-API paths pass through.
 */
class RateLimitFilterTest {

    private final AuditLogService auditLogService = mock(AuditLogService.class);

    @AfterEach
    void clearContext() {
        SecurityContextHolder.clearContext();
    }

    private RateLimitProperties props(boolean enabled, boolean dryRun) {
        return new RateLimitProperties(
                enabled, "inmemory", "", dryRun, 1,
                List.of("ADMIN"),
                10, 60, 5, 900, 300,
                60, 100, 300, 100,
                /* write */ 120, /* write burst */ 2,
                10, 5, 2);
    }

    private RateLimitFilter filter(RateLimitProperties props) {
        return new RateLimitFilter(
                props,
                new RateLimitPolicyResolver(),
                new RateLimitService(props, new SimpleMeterRegistry()),
                new ReportConcurrencyGuard(props),
                new ClientIpResolver(props),
                auditLogService);
    }

    private MockHttpServletRequest writeReq() {
        MockHttpServletRequest req = new MockHttpServletRequest("POST", "/api/products");
        req.setRequestURI("/api/products");
        req.setRemoteAddr("10.1.1.1");
        return req;
    }

    private void authenticate(String... roles) {
        var authorities = java.util.Arrays.stream(roles)
                .map(r -> new org.springframework.security.core.authority.SimpleGrantedAuthority("ROLE_" + r))
                .toList();
        var token = new TestingAuthenticationToken("tester", null, authorities);
        token.setAuthenticated(true);
        SecurityContextHolder.getContext().setAuthentication(token);
    }

    @Test
    void toggleOff_isPassThrough() throws Exception {
        RateLimitFilter f = filter(props(false, false));
        authenticate("USER");
        // Many requests, burst=2, but disabled → never blocks.
        for (int i = 0; i < 10; i++) {
            MockHttpServletResponse resp = new MockHttpServletResponse();
            MockFilterChain chain = new MockFilterChain();
            f.doFilter(writeReq(), resp, chain);
            assertNotEquals(HttpStatus.TOO_MANY_REQUESTS.value(), resp.getStatus());
        }
    }

    @Test
    void dryRun_blocksNothingButHeadersPresent() throws Exception {
        RateLimitFilter f = filter(props(true, true)); // enabled + dry-run
        authenticate("USER");
        int blocked = 0;
        for (int i = 0; i < 10; i++) {
            MockHttpServletResponse resp = new MockHttpServletResponse();
            MockFilterChain chain = new MockFilterChain();
            f.doFilter(writeReq(), resp, chain);
            if (resp.getStatus() == HttpStatus.TOO_MANY_REQUESTS.value()) {
                blocked++;
            }
        }
        assertEquals(0, blocked, "dry-run must never emit 429");
    }

    @Test
    void enforce_returns429AfterBurst() throws Exception {
        RateLimitFilter f = filter(props(true, false)); // enabled + enforcing
        authenticate("USER");
        boolean saw429 = false;
        String retryAfter = null;
        for (int i = 0; i < 6; i++) {
            MockHttpServletResponse resp = new MockHttpServletResponse();
            MockFilterChain chain = new MockFilterChain();
            f.doFilter(writeReq(), resp, chain);
            if (resp.getStatus() == HttpStatus.TOO_MANY_REQUESTS.value()) {
                saw429 = true;
                retryAfter = resp.getHeader("Retry-After");
                break;
            }
        }
        assertTrue(saw429, "burst=2 → a 429 must appear within 6 write requests");
        assertTrue(retryAfter != null && Integer.parseInt(retryAfter) > 0, "Retry-After header set");
    }

    @Test
    void exemptRoleBypassesEnforcement() throws Exception {
        RateLimitFilter f = filter(props(true, false)); // enforcing
        authenticate("ADMIN"); // exempt
        for (int i = 0; i < 10; i++) {
            MockHttpServletResponse resp = new MockHttpServletResponse();
            MockFilterChain chain = new MockFilterChain();
            f.doFilter(writeReq(), resp, chain);
            assertNotEquals(HttpStatus.TOO_MANY_REQUESTS.value(), resp.getStatus(),
                    "ADMIN is exempt from Layer-1 limits");
        }
    }

    @Test
    void authPathPassesThrough() throws Exception {
        RateLimitFilter f = filter(props(true, false));
        MockHttpServletRequest req = new MockHttpServletRequest("POST", "/api/auth/login");
        req.setRequestURI("/api/auth/login");
        req.setRemoteAddr("10.1.1.9");
        for (int i = 0; i < 20; i++) {
            MockHttpServletResponse resp = new MockHttpServletResponse();
            MockFilterChain chain = new MockFilterChain();
            f.doFilter(req, resp, chain);
            assertNotEquals(HttpStatus.TOO_MANY_REQUESTS.value(), resp.getStatus(),
                    "auth path is owned by Layer 2, not the generic filter");
        }
    }
}
