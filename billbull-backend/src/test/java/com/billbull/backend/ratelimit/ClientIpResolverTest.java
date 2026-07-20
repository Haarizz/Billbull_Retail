package com.billbull.backend.ratelimit;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

/**
 * Roadmap Phase 1: untrusted XFF ignored; trusted proxy hop honoured.
 */
class ClientIpResolverTest {

    private RateLimitProperties propsWithProxyCount(int count) {
        return new RateLimitProperties(
                true, "inmemory", "", true, count,
                List.of("ADMIN"),
                10, 60, 5, 900, 300,
                60, 100, 300, 100, 120, 40, 10, 5, 2);
    }

    @Test
    void oneTrustedProxy_takesLastXffHop() {
        ClientIpResolver resolver = new ClientIpResolver(propsWithProxyCount(1));
        MockHttpServletRequest req = new MockHttpServletRequest();
        req.setRemoteAddr("192.168.0.10"); // the proxy's socket address
        // client -> our-nginx. Attacker prepends a spoofed hop; nginx appends the real client last.
        req.addHeader("X-Forwarded-For", "1.2.3.4-SPOOFED, 203.0.113.7");
        assertEquals("203.0.113.7", resolver.resolve(req), "with 1 trusted proxy, take the last XFF hop");
    }

    @Test
    void zeroTrustedProxies_ignoresXffEntirely() {
        ClientIpResolver resolver = new ClientIpResolver(propsWithProxyCount(0));
        MockHttpServletRequest req = new MockHttpServletRequest();
        req.setRemoteAddr("198.51.100.1");
        req.addHeader("X-Forwarded-For", "1.2.3.4"); // must be ignored — no proxy in front
        assertEquals("198.51.100.1", resolver.resolve(req));
    }

    @Test
    void twoTrustedProxies_takesClientAtLenMinusN() {
        ClientIpResolver resolver = new ClientIpResolver(propsWithProxyCount(2));
        MockHttpServletRequest req = new MockHttpServletRequest();
        // Immediate peer (our nginx) is remoteAddr and is NOT in XFF. Two trusted proxies in front
        // (cloudflare + nginx): XFF = [client, cloudflare]; nginx appended cloudflare. client = XFF[len-2].
        req.setRemoteAddr("192.168.0.10");
        req.addHeader("X-Forwarded-For", "203.0.113.9, 172.16.0.1");
        assertEquals("203.0.113.9", resolver.resolve(req));
    }

    @Test
    void shorterChainThanTrustedCount_fallsBackToRemoteAddr() {
        ClientIpResolver resolver = new ClientIpResolver(propsWithProxyCount(3));
        MockHttpServletRequest req = new MockHttpServletRequest();
        req.setRemoteAddr("10.0.0.5");
        req.addHeader("X-Forwarded-For", "203.0.113.9"); // only 1 hop but 3 trusted expected → suspicious
        assertEquals("10.0.0.5", resolver.resolve(req), "malformed/short chain falls back to socket peer");
    }

    @Test
    void noXffHeader_usesRemoteAddr() {
        ClientIpResolver resolver = new ClientIpResolver(propsWithProxyCount(1));
        MockHttpServletRequest req = new MockHttpServletRequest();
        req.setRemoteAddr("203.0.113.55");
        assertEquals("203.0.113.55", resolver.resolve(req));
    }
}
