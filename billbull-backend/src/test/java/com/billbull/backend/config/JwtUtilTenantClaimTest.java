package com.billbull.backend.config;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Duration;
import java.util.Date;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import com.billbull.backend.platform.TenantIdentity;
import com.billbull.backend.role.Role;
import com.billbull.backend.user.User;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import io.jsonwebtoken.security.Keys;

/**
 * Audit risk R1: clients that share a signing key must not accept each other's tokens. Every
 * token now names its client ({@code tid}); a token naming another client is refused.
 */
class JwtUtilTenantClaimTest {

    /** Two backends sharing one key, as nine client profiles did. */
    private static final String SHARED_SECRET = "shared-signing-key-of-at-least-32-bytes-long!!";

    private static JwtUtil util(String tenant, boolean requireClaim) {
        JwtUtil u = new JwtUtil();
        ReflectionTestUtils.setField(u, "secret", SHARED_SECRET);
        ReflectionTestUtils.setField(u, "expiration", 3_600_000L);
        ReflectionTestUtils.setField(u, "requireTenantClaim", requireClaim);
        if (tenant != null) u.setTenantIdentity(new TenantIdentity(tenant, null));
        return u;
    }

    private static User admin() {
        Role role = new Role();
        role.setName("ADMIN");
        User user = new User();
        user.setUsername("admin");
        user.setRoles(new java.util.HashSet<>(Set.of(role)));
        return user;
    }

    @Test
    void tokenIsAcceptedByItsOwnTenant() {
        JwtUtil qa = util("qa", false);
        assertTrue(qa.isTokenValid(qa.generateToken(admin())));
        assertEquals("qa", qa.extractClaims(qa.generateToken(admin())).get(JwtUtil.TENANT_CLAIM));
    }

    @Test
    void tokenFromAnotherTenantWithTheSameKeyIsRefused() {
        String qaAdminToken = util("qa", false).generateToken(admin());
        assertFalse(util("nest", false).isTokenValid(qaAdminToken));
    }

    @Test
    void legacyTokenWithoutTenantClaimIsAcceptedUntilRequired() {
        String legacy = Jwts.builder()
                .setSubject("admin")
                .setExpiration(new Date(System.currentTimeMillis() + 60_000))
                .signWith(Keys.hmacShaKeyFor(SHARED_SECRET.getBytes()), SignatureAlgorithm.HS256)
                .compact();
        assertTrue(util("nest", false).isTokenValid(legacy));
        assertFalse(util("nest", true).isTokenValid(legacy));
    }

    @Test
    void supportTokenCarriesItsSessionAndShortLifetime() {
        JwtUtil u = util("demo", false);
        String token = u.generateSupportToken(admin(), 42L, Duration.ofMinutes(15));
        assertEquals(42L, u.extractSupportSessionId(token));
        long ttl = u.extractClaims(token).getExpiration().getTime() - System.currentTimeMillis();
        assertTrue(ttl <= Duration.ofMinutes(15).toMillis() && ttl > Duration.ofMinutes(14).toMillis());
        assertNull(u.extractSupportSessionId(u.generateToken(admin())), "ordinary sign-ins carry no session");
    }
}
