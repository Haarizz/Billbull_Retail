package com.billbull.platform.agent;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.Test;

/**
 * Same vectors as the tenant backend's {@code PlatformSignatureTest} (computed independently with
 * Node's crypto module). If either side changes the canonical string, one of the two suites fails.
 */
class AgentSignatureTest {

    static final String SECRET = "test-secret-0123456789-abcdefghijklmnop";

    @Test
    void matchesTenantVectorWithBody() {
        assertEquals("2f6e99bbcefd099a0d3fcc7980d551d21b746a56e80e0dce0c7d1a0e39694873",
                AgentSignature.sign(SECRET, "PUT", "/api/platform/state", "1700000000", "nonce-123",
                        "{\"status\":\"SUSPENDED\"}".getBytes(StandardCharsets.UTF_8)));
    }

    @Test
    void matchesTenantVectorWithoutBody() {
        assertEquals("cf3a3be26bfabd77b370c7199c42e9919547c74deb6a91c76ead8ba42d9b3016",
                AgentSignature.sign(SECRET, "get", "/api/platform/health", "1700000000", "n2", new byte[0]));
    }
}
