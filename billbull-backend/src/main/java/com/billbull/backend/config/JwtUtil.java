package com.billbull.backend.config;

import java.security.Key;
import java.util.Date;
import java.util.List;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import com.billbull.backend.user.User;
import com.billbull.backend.role.Role;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import io.jsonwebtoken.security.Keys;

@Component
public class JwtUtil {

    @Value("${jwt.secret}")
    private String secret;

    @Value("${jwt.expiration}")
    private long expiration;

    private Key getSigningKey() {
        return Keys.hmacShaKeyFor(secret.getBytes());
    }

    public String generateToken(User user) {

        List<String> roles = user.getRoles()
                .stream()
                .map(r -> r.getName())
                .collect(Collectors.toList());

        return Jwts.builder()
                .setSubject(user.getUsername())
                .claim("roles", roles)
                .claim("branchId", user.getBranch() != null ? user.getBranch().getId() : null)
                .claim("branchName", user.getBranch() != null ? user.getBranch().getName() : null)
                .claim("branchCode", user.getBranch() != null ? user.getBranch().getCode() : null)
                .claim("defaultWarehouseId",
                        user.getBranch() != null && user.getBranch().getDefaultWarehouse() != null
                                ? user.getBranch().getDefaultWarehouse().getId()
                                : null)
                .claim("defaultWarehouseName",
                        user.getBranch() != null && user.getBranch().getDefaultWarehouse() != null
                                ? user.getBranch().getDefaultWarehouse().getName()
                                : null)
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

    public boolean isTokenValid(String token) {
        try {
            extractClaims(token);
            return true;
        } catch (Exception e) {
            return false;
        }
    }
}
