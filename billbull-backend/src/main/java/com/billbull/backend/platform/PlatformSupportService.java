package com.billbull.backend.platform;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.backend.config.JwtUtil;
import com.billbull.backend.security.AuditLogService;
import com.billbull.backend.user.User;
import com.billbull.backend.user.UserRepository;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;

/**
 * Time-boxed support sign-in for BillBull staff, with the tenant's consent.
 *
 * <p>Consent is two deliberate acts on the tenant side, never something the control plane can do:
 * the deployment sets {@code billbull.platform.support-access.enabled=true}, and the tenant's admin
 * keeps an active user named {@code billbull.platform.support-access.username} (default
 * {@code platform.support}) with whatever roles they are willing to grant. Freezing that user
 * ends support access immediately.
 *
 * <p>Each sign-in is a row in {@code platform_support_sessions} and an {@code audit_logs} event.
 * The token carries the session id ({@code sst} claim), {@code JwtFilter} checks it on every
 * request, and revoking the row (from either side) cuts the token off within
 * {@link #LIVE_CACHE_SECONDS} seconds — it does not have to run out.
 */
@Service
public class PlatformSupportService {

    static final long LIVE_CACHE_SECONDS = 20;

    private final JdbcTemplate jdbc;
    private final PlatformAgentProperties properties;
    private final UserRepository userRepository;
    private final JwtUtil jwtUtil;
    private final AuditLogService auditLogService;
    private final Cache<Long, Boolean> liveCache = Caffeine.newBuilder()
            .expireAfterWrite(Duration.ofSeconds(LIVE_CACHE_SECONDS))
            .maximumSize(10_000)
            .build();

    public PlatformSupportService(JdbcTemplate jdbc, PlatformAgentProperties properties,
                                  UserRepository userRepository, JwtUtil jwtUtil, AuditLogService auditLogService) {
        this.jdbc = jdbc;
        this.properties = properties;
        this.userRepository = userRepository;
        this.jwtUtil = jwtUtil;
        this.auditLogService = auditLogService;
    }

    public record IssueRequest(String platformUser, String reason, String ticketRef, Integer minutes) {}

    @Transactional
    public Map<String, Object> issue(IssueRequest request, String actor) {
        if (!properties.isSupportAccessEnabled()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "SUPPORT_ACCESS_DISABLED: this tenant has not enabled BillBull support access");
        }
        if (request == null || request.reason() == null || request.reason().trim().length() < 10) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A reason of at least 10 characters is required");
        }
        String username = properties.getSupportUsername();
        User user = userRepository.findByUsernameAndIsActiveTrue(username)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT,
                        "SUPPORT_USER_MISSING: the tenant has no active '" + username + "' user, so it has not"
                                + " granted support access"));

        int max = properties.getSupportMaxMinutes();
        int minutes = request.minutes() == null ? Math.min(30, max) : Math.max(5, Math.min(max, request.minutes()));
        Instant expires = Instant.now().plus(Duration.ofMinutes(minutes));
        String platformUser = clip(request.platformUser() != null ? request.platformUser() : actor, 200);
        String reason = clip(request.reason().trim(), 1000);
        String ticket = request.ticketRef() == null ? null : clip(request.ticketRef().trim(), 100);

        GeneratedKeyHolder keys = new GeneratedKeyHolder();
        jdbc.update(con -> {
            var ps = con.prepareStatement(
                    "INSERT INTO platform_support_sessions (platform_user, reason, ticket_ref, tenant_username, expires_at)"
                            + " VALUES (?, ?, ?, ?, ?)", new String[] {"id"});
            ps.setString(1, platformUser);
            ps.setString(2, reason);
            ps.setString(3, ticket);
            ps.setString(4, username);
            ps.setTimestamp(5, Timestamp.from(expires));
            return ps;
        }, keys);
        long id = keys.getKey().longValue();
        liveCache.put(id, Boolean.TRUE);

        String token = jwtUtil.generateSupportToken(user, id, Duration.ofMinutes(minutes));
        auditLogService.logDomainEvent("PlatformSupportSession", String.valueOf(id), "ISSUED",
                "Support sign-in for " + platformUser + " as " + username + " until " + expires
                        + (ticket != null ? " (ticket " + ticket + ")" : "") + ": " + reason);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("sessionId", id);
        out.put("token", token);
        out.put("username", username);
        out.put("expiresAt", expires.toString());
        return out;
    }

    public List<Map<String, Object>> list(int limit) {
        return jdbc.query(
                "SELECT id, platform_user, reason, ticket_ref, tenant_username, issued_at, expires_at, revoked_at, revoked_by"
                        + " FROM platform_support_sessions ORDER BY issued_at DESC LIMIT ?",
                (rs, i) -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", rs.getLong("id"));
                    m.put("platformUser", rs.getString("platform_user"));
                    m.put("reason", rs.getString("reason"));
                    m.put("ticketRef", rs.getString("ticket_ref"));
                    m.put("tenantUsername", rs.getString("tenant_username"));
                    m.put("issuedAt", str(rs.getObject("issued_at", OffsetDateTime.class)));
                    OffsetDateTime exp = rs.getObject("expires_at", OffsetDateTime.class);
                    OffsetDateTime rev = rs.getObject("revoked_at", OffsetDateTime.class);
                    m.put("expiresAt", str(exp));
                    m.put("revokedAt", str(rev));
                    m.put("revokedBy", rs.getString("revoked_by"));
                    m.put("live", rev == null && exp != null && exp.toInstant().isAfter(Instant.now()));
                    return m;
                },
                Math.max(1, Math.min(500, limit)));
    }

    @Transactional
    public boolean revoke(long id, String by) {
        int n = jdbc.update("UPDATE platform_support_sessions SET revoked_at = now(), revoked_by = ?"
                + " WHERE id = ? AND revoked_at IS NULL", clip(by, 200), id);
        liveCache.put(id, Boolean.FALSE);
        if (n > 0) {
            auditLogService.logDomainEvent("PlatformSupportSession", String.valueOf(id), "REVOKED", "Revoked by " + by);
        }
        return n > 0;
    }

    /** Whether support session {@code id} may still be used (not revoked, not expired). */
    public boolean isLive(long id) {
        return liveCache.get(id, key -> {
            List<Boolean> r = jdbc.query(
                    "SELECT (revoked_at IS NULL AND expires_at > now()) AS live FROM platform_support_sessions WHERE id = ?",
                    (rs, i) -> rs.getBoolean("live"), key);
            return !r.isEmpty() && r.get(0);
        });
    }

    private static String str(OffsetDateTime t) {
        return t == null ? null : t.toInstant().toString();
    }

    private static String clip(String s, int max) {
        if (s == null) return null;
        return s.length() <= max ? s : s.substring(0, max);
    }
}
