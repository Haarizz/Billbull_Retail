package com.billbull.backend.config;

import java.security.Key;
import java.util.Collections;
import java.util.Date;
import java.util.List;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

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
                .setIssuedAt(new Date())
                .setExpiration(new Date(System.currentTimeMillis() + expiration))
                .signWith(getSigningKey(), SignatureAlgorithm.HS256)
                .compact();
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
            extractClaims(token);
            return true;
        } catch (Exception e) {
            return false;
        }
    }
}
