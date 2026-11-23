package com.billbull.platform.auth;

import java.security.Key;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import com.billbull.platform.config.PlatformSecrets;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import io.jsonwebtoken.security.Keys;

/**
 * Platform session tokens. Signed with {@code PLATFORM_JWT_SECRET} — a key no tenant backend
 * holds — and pinned to audience {@value #AUDIENCE}, so a tenant JWT can never be replayed here
 * and a platform token means nothing to a tenant.
 *
 * <p>Token types ({@code typ} claim): {@code access} (a signed-in session), {@code mfa} (password
 * accepted, waiting for the authenticator code) and {@code mfa-setup} (password accepted, MFA must
 * be enrolled first). Challenge tokens live five minutes and can't call anything else.
 */
@Service
public class JwtService {

    public static final String AUDIENCE = "billbull-platform";
    public static final String TYPE_ACCESS = "access";
    public static final String TYPE_MFA = "mfa";
    public static final String TYPE_MFA_SETUP = "mfa-setup";
    private static final Duration CHALLENGE_TTL = Duration.ofMinutes(5);

    private final Key key;
    private final Duration accessTtl;

    public JwtService(PlatformSecrets secrets, @Value("${platform.security.jwt-ttl-minutes:480}") long ttlMinutes) {
        try {
            this.key = Keys.hmacShaKeyFor(MessageDigest.getInstance("SHA-256").digest(secrets.jwtSecretBytes()));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
        this.accessTtl = Duration.ofMinutes(Math.max(5, Math.min(24 * 60, ttlMinutes)));
    }

    public String issueAccess(PlatformUser user) {
        return issue(user, TYPE_ACCESS, accessTtl);
    }

    public String issueChallenge(PlatformUser user, String type) {
        return issue(user, type, CHALLENGE_TTL);
    }

    public Duration accessTtl() {
        return accessTtl;
    }

    private String issue(PlatformUser user, String type, Duration ttl) {
        Instant now = Instant.now();
        return Jwts.builder()
                .setSubject(String.valueOf(user.id))
                .setAudience(AUDIENCE)
                .setIssuer(AUDIENCE)
                .claim("typ", type)
                .claim("ver", user.tokenVersion)
                .claim("email", user.email)
                .setIssuedAt(Date.from(now))
                .setExpiration(Date.from(now.plus(ttl)))
                .signWith(key, SignatureAlgorithm.HS256)
                .compact();
    }

    /** Parsed, verified token of the expected type. */
    public record Verified(long userId, int tokenVersion, String type) {}

    /** @throws JwtException when the token is invalid, expired, for another audience or another type. */
    public Verified verify(String token, String expectedType) {
        Claims c = Jwts.parserBuilder()
                .setSigningKey(key)
                .requireAudience(AUDIENCE)
                .requireIssuer(AUDIENCE)
                .build()
                .parseClaimsJws(token)
                .getBody();
        Object typ = c.get("typ");
        if (!expectedType.equals(typ)) throw new JwtException("Wrong token type");
        Object ver = c.get("ver");
        return new Verified(Long.parseLong(c.getSubject()), ver instanceof Number n ? n.intValue() : -1, expectedType);
    }
}
