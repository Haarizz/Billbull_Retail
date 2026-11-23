package com.billbull.backend.platform;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.Test;

/**
 * Pins the signing format to vectors computed independently (Node's crypto module). The control
 * plane's {@code AgentSignatureTest} pins the same two values, so the two sides can't drift apart.
 */
class PlatformSignatureTest {

    static final String SECRET = "test-secret-0123456789-abcdefghijklmnop";

    @Test
    void signsBodyRequestsToThePinnedVector() {
        byte[] body = "{\"status\":\"SUSPENDED\"}".getBytes(StandardCharsets.UTF_8);
        assertEquals("2f6e99bbcefd099a0d3fcc7980d551d21b746a56e80e0dce0c7d1a0e39694873",
                PlatformSignature.sign(SECRET, "put", "/api/platform/state", "1700000000", "nonce-123", body));
    }

    @Test
    void signsEmptyBodyRequestsToThePinnedVector() {
        assertEquals("cf3a3be26bfabd77b370c7199c42e9919547c74deb6a91c76ead8ba42d9b3016",
                PlatformSignature.sign(SECRET, "GET", "/api/platform/health", "1700000000", "n2", null));
    }

    @Test
    void comparisonIsCaseInsensitiveAndRejectsMismatch() {
        String sig = PlatformSignature.sign(SECRET, "GET", "/api/platform/health", "1", "n", new byte[0]);
        assertTrue(PlatformSignature.matches(sig, sig.toUpperCase()));
        assertFalse(PlatformSignature.matches(sig, sig.substring(1) + "0"));
        assertFalse(PlatformSignature.matches(sig, null));
    }
}
