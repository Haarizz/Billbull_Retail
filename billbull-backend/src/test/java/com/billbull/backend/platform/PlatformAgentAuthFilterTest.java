package com.billbull.backend.platform;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.concurrent.atomic.AtomicReference;

import jakarta.servlet.FilterChain;
import jakarta.servlet.http.HttpServletRequest;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

class PlatformAgentAuthFilterTest {

    private static final String SECRET = "a-very-long-platform-agent-secret-0123456789";

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    private static PlatformAgentProperties props(boolean enabled, String secret) {
        return new PlatformAgentProperties(enabled, secret, 300, false, "platform.support", 60);
    }

    private static MockHttpServletRequest signed(String method, String path, String body, long ts, String nonce, String secret) {
        MockHttpServletRequest req = new MockHttpServletRequest(method, path);
        byte[] bytes = body == null ? new byte[0] : body.getBytes(StandardCharsets.UTF_8);
        req.setContent(bytes);
        req.addHeader(PlatformSignature.HEADER_TIMESTAMP, String.valueOf(ts));
        req.addHeader(PlatformSignature.HEADER_NONCE, nonce);
        req.addHeader(PlatformSignature.HEADER_SIGNATURE,
                PlatformSignature.sign(secret, method, path, String.valueOf(ts), nonce, bytes));
        req.addHeader(PlatformSignature.HEADER_ACTOR, "ops@billbull.app");
        return req;
    }

    /** Runs the filter; returns the request the chain saw, or null when the chain was not called. */
    private static Result run(PlatformAgentAuthFilter filter, HttpServletRequest req) throws Exception {
        MockHttpServletResponse res = new MockHttpServletResponse();
        AtomicReference<HttpServletRequest> seen = new AtomicReference<>();
        AtomicReference<Authentication> auth = new AtomicReference<>();
        FilterChain chain = (r, s) -> {
            seen.set((HttpServletRequest) r);
            auth.set(SecurityContextHolder.getContext().getAuthentication());
        };
        filter.doFilter(req, res, chain);
        return new Result(res, seen.get(), auth.get());
    }

    record Result(MockHttpServletResponse response, HttpServletRequest passed, Authentication auth) {}

    @Test
    void disabledAgentAnswers404() throws Exception {
        Result r = run(new PlatformAgentAuthFilter(props(false, SECRET)),
                signed("GET", "/api/platform/health", null, Instant.now().getEpochSecond(), "n1", SECRET));
        assertEquals(404, r.response().getStatus());
        assertNull(r.passed());
    }

    @Test
    void shortSecretRefusesEveryCall() throws Exception {
        Result r = run(new PlatformAgentAuthFilter(props(true, "short")),
                signed("GET", "/api/platform/health", null, Instant.now().getEpochSecond(), "n1", "short"));
        assertEquals(503, r.response().getStatus());
        assertNull(r.passed());
    }

    @Test
    void validSignaturePassesWithAgentRoleBodyAndActor() throws Exception {
        String body = "{\"status\":\"SUSPENDED\"}";
        Result r = run(new PlatformAgentAuthFilter(props(true, SECRET)),
                signed("PUT", "/api/platform/state", body, Instant.now().getEpochSecond(), "n-ok", SECRET));
        assertNotNull(r.passed());
        assertEquals(body, new String(r.passed().getInputStream().readAllBytes(), StandardCharsets.UTF_8));
        assertEquals("ops@billbull.app", r.passed().getAttribute(PlatformAgentAuthFilter.ACTOR_ATTRIBUTE));
        assertTrue(r.auth().getAuthorities().stream()
                .anyMatch(a -> a.getAuthority().equals(PlatformAgentAuthFilter.ROLE)));
        assertNull(SecurityContextHolder.getContext().getAuthentication(), "context cleared afterwards");
    }

    @Test
    void tamperedBodyIsRejected() throws Exception {
        MockHttpServletRequest req = signed("PUT", "/api/platform/state", "{\"status\":\"ACTIVE\"}",
                Instant.now().getEpochSecond(), "n-t", SECRET);
        req.setContent("{\"status\":\"SUSPENDED\"}".getBytes(StandardCharsets.UTF_8));
        Result r = run(new PlatformAgentAuthFilter(props(true, SECRET)), req);
        assertEquals(401, r.response().getStatus());
        assertNull(r.passed());
    }

    @Test
    void wrongSecretIsRejected() throws Exception {
        Result r = run(new PlatformAgentAuthFilter(props(true, SECRET)),
                signed("GET", "/api/platform/health", null, Instant.now().getEpochSecond(), "n-w",
                        "another-tenants-secret-0123456789-xyz"));
        assertEquals(401, r.response().getStatus());
    }

    @Test
    void staleTimestampIsRejected() throws Exception {
        Result r = run(new PlatformAgentAuthFilter(props(true, SECRET)),
                signed("GET", "/api/platform/health", null, Instant.now().getEpochSecond() - 3600, "n-s", SECRET));
        assertEquals(401, r.response().getStatus());
        assertTrue(r.response().getContentAsString().contains("SIGNATURE_EXPIRED"));
    }

    @Test
    void replayedNonceIsRejected() throws Exception {
        PlatformAgentAuthFilter filter = new PlatformAgentAuthFilter(props(true, SECRET));
        long ts = Instant.now().getEpochSecond();
        assertNotNull(run(filter, signed("GET", "/api/platform/health", null, ts, "same", SECRET)).passed());
        Result second = run(filter, signed("GET", "/api/platform/health", null, ts, "same", SECRET));
        assertEquals(401, second.response().getStatus());
        assertTrue(second.response().getContentAsString().contains("SIGNATURE_REPLAYED"));
    }

    @Test
    void unsignedRequestIsRejectedEvenWithABearerToken() throws Exception {
        MockHttpServletRequest req = new MockHttpServletRequest("GET", "/api/platform/health");
        req.addHeader("Authorization", "Bearer tenant-admin-token");
        Result r = run(new PlatformAgentAuthFilter(props(true, SECRET)), req);
        assertEquals(401, r.response().getStatus());
        assertNull(r.passed());
    }

    @Test
    void ignoresEveryOtherPath() throws Exception {
        MockHttpServletRequest req = new MockHttpServletRequest("GET", "/api/products");
        Result r = run(new PlatformAgentAuthFilter(props(true, SECRET)), req);
        assertNotNull(r.passed());
        assertNull(r.auth());
    }
}
