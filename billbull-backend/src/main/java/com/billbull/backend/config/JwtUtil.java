package com.billbull.backend.config;

import java.security.Key;
import java.util.Collections;
import java.util.Date;
import java.util.List;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import com.billbull.backend.platform.TenantIdentity;
import com.billbull.backend.user.User;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import io.jsonwebtoken.security.Keys;

@Component
public class JwtUtil {

    private static final List<String> ALL_BRANCH_ROLES = List.of("ADMIN", "SUPER_ADMIN");

    @Value("${jwt.secret}")
    private String secret;

    @Value("${jwt.expiration}")
    private long expiration;

    /** Client code stamped into every token; see {@link #tenantMatches}. */
    public static final String TENANT_CLAIM = "tid";
    /** Support session id on control-plane support sign-ins; absent on ordinary tokens. */
    public static final String SUPPORT_SESSION_CLAIM = "sst";

    @Value("${billbull.jwt.require-tenant-claim:false}")
    private boolean requireTenantClaim;

    private TenantIdentity tenantIdentity;

    @Autowired(required = false)
    public void setTenantIdentity(TenantIdentity tenantIdentity) {
        this.tenantIdentity = tenantIdentity;
    }

    private Key getSigningKey() {
        return Keys.hmacShaKeyFor(secret.getBytes());
    }

    public String generateToken(User user) {
        return generateToken(user, user.getBranch() != null ? user.getBranch().getId() : null);
    }

    /**
     * Generates a token whose {@code branchId/branchName/branchCode} claims reflect
     * {@code activeBranchId} (so admins can switch branches without re-logging in).
     * Falls back to the user's primary branch if {@code activeBranchId} is null.
     */
    public String generateToken(User user, Long activeBranchId) {
        return buildToken(user, activeBranchId, expiration, null);
    }

    private String buildToken(User user, Long activeBranchId, long ttlMillis, Long supportSessionId) {

        List<String> roles = user.getRoles()
                .stream()
                .map(r -> r.getName())
                .collect(Collectors.toList());

        boolean isAllBranches = roles.stream().anyMatch(ALL_BRANCH_ROLES::contains);

        Long primaryBranchId = user.getBranch() != null ? user.getBranch().getId() : null;
        Long resolvedActiveId = activeBranchId != null ? activeBranchId : primaryBranchId;

        String branchName = null;
        String branchCode = null;
        Long defaultWarehouseId = null;
        String defaultWarehouseName = null;

        // When the resolved active branch matches the user's primary branch we
        // can read the rich fields straight off the User entity. For cross-branch
        // admin switches the JWT only carries the ID; the frontend re-fetches.
        if (user.getBranch() != null
                && (resolvedActiveId == null || resolvedActiveId.equals(primaryBranchId))) {
            branchName = user.getBranch().getName();
            branchCode = user.getBranch().getCode();
            if (user.getBranch().getDefaultWarehouse() != null) {
                defaultWarehouseId = user.getBranch().getDefaultWarehouse().getId();
                defaultWarehouseName = user.getBranch().getDefaultWarehouse().getName();
            }
        }

        // PDF §2.3 multi-branch user support: union of primary + additional branches.
        List<Long> branchIds;
        if (isAllBranches) {
            branchIds = Collections.emptyList();
        } else {
            java.util.LinkedHashSet<Long> ids = new java.util.LinkedHashSet<>();
            if (primaryBranchId != null) {
                ids.add(primaryBranchId);
            }
            if (user.getAdditionalBranches() != null) {
                user.getAdditionalBranches().stream()
                        .filter(b -> b != null && b.getId() != null)
                        .forEach(b -> ids.add(b.getId()));
            }
            branchIds = new java.util.ArrayList<>(ids);
        }

        return Jwts.builder()
                .setSubject(user.getUsername())
                .claim("userId", user.getId())
                .claim("roles", roles)
                .claim("branchId", resolvedActiveId)
                .claim("branchName", branchName)
                .claim("branchCode", branchCode)
                .claim("branchIds", branchIds)
                .claim("isAllBranches", isAllBranches)
                .claim("defaultWarehouseId", defaultWarehouseId)
                .claim("defaultWarehouseName", defaultWarehouseName)
                .claim(TENANT_CLAIM, tenantCode())
                .claim(SUPPORT_SESSION_CLAIM, supportSessionId)
                .setIssuedAt(new Date())
                .setExpiration(new Date(System.currentTimeMillis() + ttlMillis))
                .signWith(getSigningKey(), SignatureAlgorithm.HS256)
                .compact();
    }

    /**
     * A support sign-in token for the control plane ({@code platform.PlatformSupportService}):
     * the user's normal claims plus the support session id, valid for {@code ttl} only.
     */
    public String generateSupportToken(User user, long supportSessionId, java.time.Duration ttl) {
        return buildToken(user, null, ttl.toMillis(), supportSessionId);
    }

    /** The support session this token was issued for, or {@code null} for an ordinary sign-in. */
    public Long extractSupportSessionId(String token) {
        Object raw = extractClaims(token).get(SUPPORT_SESSION_CLAIM);
        return raw instanceof Number n ? n.longValue() : null;
    }

    private String tenantCode() {
        return tenantIdentity != null ? tenantIdentity.code() : null;
    }

    /**
     * A token issued by another client's backend is refused here, even when the two clients share a
     * signing key: its {@code tid} names the other client. Tokens with no {@code tid} (issued before
     * this check existed) are accepted until {@code billbull.jwt.require-tenant-claim=true}.
     */
    boolean tenantMatches(Claims claims) {
        String expected = tenantCode();
        if (expected == null) return true;
        Object tid = claims.get(TENANT_CLAIM);
        if (tid == null) return !requireTenantClaim;
        return expected.equals(tid.toString());
    }

    public Claims extractClaims(String token) {
        return Jwts.parserBuilder()
                .setSigningKey(getSigningKey())
                .build()
                .parseClaimsJws(token)
                .getBody();
    }

    public String extractUsername(String token) {
        return extractClaims(token).getSubject();
    }

    @SuppressWarnings("unchecked")
    public List<String> extractRoles(String token) {
        return (List<String>) extractClaims(token).get("roles");
    }

    public Long extractBranchId(String token) {
        Object branchId = extractClaims(token).get("branchId");
        if (branchId instanceof Number number) {
            return number.longValue();
        }
        return null;
    }

    public Long extractUserId(String token) {
        Object userId = extractClaims(token).get("userId");
        if (userId instanceof Number number) {
            return number.longValue();
        }
        return null;
    }

    @SuppressWarnings("unchecked")
    public List<Long> extractBranchIds(String token) {
        Object raw = extractClaims(token).get("branchIds");
        if (raw instanceof List<?> list) {
            return list.stream()
                    .filter(v -> v instanceof Number)
                    .map(v -> ((Number) v).longValue())
                    .collect(Collectors.toList());
        }
        return Collections.emptyList();
    }

    public boolean extractIsAllBranches(String token) {
        Object raw = extractClaims(token).get("isAllBranches");
        return raw instanceof Boolean b && b;
    }

    public boolean isTokenValid(String token) {
        try {
            return tenantMatches(extractClaims(token));
        } catch (Exception e) {
            return false;
        }
    }
}
