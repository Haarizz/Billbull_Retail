package com.billbull.backend.ratelimit;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

/**
 * Roadmap Phase 2: policy resolver maps representative paths correctly (unit table test).
 */
class RateLimitPolicyResolverTest {

    private final RateLimitPolicyResolver resolver = new RateLimitPolicyResolver();

    private RateLimitPolicy resolve(String method, String path) {
        MockHttpServletRequest req = new MockHttpServletRequest(method, path);
        req.setRequestURI(path);
        return resolver.resolve(req);
    }

    @Test
    void authEndpointsAreNotHandledByGenericLimiter() {
        assertEquals(RateLimitPolicy.NONE, resolve("POST", "/api/auth/login"));
        assertEquals(RateLimitPolicy.NONE, resolve("POST", "/api/auth/change-password"));
    }

    @Test
    void nonApiAndStaticAreNone() {
        assertEquals(RateLimitPolicy.NONE, resolve("GET", "/uploads/logo.png"));
        assertEquals(RateLimitPolicy.NONE, resolve("GET", "/actuator/health"));
        assertEquals(RateLimitPolicy.NONE, resolve("GET", "/tools/agent.exe"));
    }

    @Test
    void clientLogsArePublic() {
        assertEquals(RateLimitPolicy.PUBLIC, resolve("POST", "/api/client-logs"));
        assertEquals(RateLimitPolicy.PUBLIC, resolve("POST", "/api/client-logs/batch"));
    }

    @Test
    void reportAndDocumentPathsAreReport() {
        assertEquals(RateLimitPolicy.REPORT, resolve("GET", "/api/documents/123/pdf"));
        assertEquals(RateLimitPolicy.REPORT, resolve("GET", "/api/sales/reports/summary"));
        assertEquals(RateLimitPolicy.REPORT, resolve("GET", "/api/financials/reports/trial-balance"));
        assertEquals(RateLimitPolicy.REPORT, resolve("GET", "/api/inventory/reports/stock-on-hand"));
        assertEquals(RateLimitPolicy.REPORT, resolve("GET", "/api/financials/statement/customer/9"));
    }

    @Test
    void getIsReadAndMutationsAreWrite() {
        assertEquals(RateLimitPolicy.READ, resolve("GET", "/api/products"));
        assertEquals(RateLimitPolicy.READ, resolve("GET", "/api/pos/sessions/current"));
        assertEquals(RateLimitPolicy.WRITE, resolve("POST", "/api/pos/checkout"));
        assertEquals(RateLimitPolicy.WRITE, resolve("PUT", "/api/products/5"));
        assertEquals(RateLimitPolicy.WRITE, resolve("DELETE", "/api/products/5"));
        assertEquals(RateLimitPolicy.WRITE, resolve("PATCH", "/api/products/5"));
    }
}
