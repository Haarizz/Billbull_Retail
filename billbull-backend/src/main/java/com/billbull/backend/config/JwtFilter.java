package com.billbull.backend.config;

import java.io.IOException;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import com.billbull.backend.security.BranchContextHolder;
import com.billbull.backend.logging.LogContext;
import com.billbull.backend.user.UserRepository;

@Component
public class JwtFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(JwtFilter.class);

    private final JwtUtil jwtUtil;
    private final UserRepository userRepository;

    public JwtFilter(JwtUtil jwtUtil, UserRepository userRepository) {
        this.jwtUtil = jwtUtil;
        this.userRepository = userRepository;
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain)
            throws ServletException, IOException {

        String authHeader = request.getHeader("Authorization");
        boolean contextSet = false;

        if (authHeader != null && authHeader.startsWith("Bearer ")) {

            String token = authHeader.substring(7);

            if (jwtUtil.isTokenValid(token)) {

                String username = jwtUtil.extractUsername(token);

                // Reject tokens belonging to frozen/deleted users
                boolean isActive = userRepository.findByUsername(username)
                        .map(u -> u.isActive())
                        .orElse(false);
                if (!isActive) {
                    response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                    return;
                }

                Long userId = jwtUtil.extractUserId(token);
                List<String> roles = jwtUtil.extractRoles(token);
                log.debug("JWT authenticated username={} roles={}", username, roles);

                List<SimpleGrantedAuthority> authorities = roles != null ? roles.stream()
                        .map(r -> new SimpleGrantedAuthority("ROLE_" + r))
                        .collect(Collectors.toList()) : List.of();
                log.debug("JWT authorities={}", authorities);

                UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken(
                        username,
                        null,
                        authorities);

                authentication.setDetails(
                        new WebAuthenticationDetailsSource().buildDetails(request));

                SecurityContextHolder.getContext().setAuthentication(authentication);

                // ── Branch context ────────────────────────────────────────────
                boolean isAllBranches = jwtUtil.extractIsAllBranches(token);
                List<Long> allowedFromToken = jwtUtil.extractBranchIds(token);
                Long jwtBranchId = jwtUtil.extractBranchId(token);

                Set<Long> allowed = new HashSet<>(allowedFromToken);
                if (jwtBranchId != null) {
                    allowed.add(jwtBranchId);
                }

                Long activeBranchId = resolveActiveBranchId(request, jwtBranchId, isAllBranches, allowed);

                LogContext.put(LogContext.USER_ID, userId);
                LogContext.put(LogContext.USERNAME, username);
                LogContext.put(LogContext.ROLES, roles != null ? String.join(",", roles) : "NONE");
                LogContext.put(LogContext.BRANCH_ID, activeBranchId != null ? activeBranchId : "ALL");
                LogContext.put(LogContext.ALL_BRANCHES, isAllBranches);

                BranchContextHolder.set(new BranchContextHolder.BranchContext(
                        activeBranchId,
                        allowed,
                        isAllBranches));
                contextSet = true;
            }
        }

        try {
            filterChain.doFilter(request, response);
        } finally {
            if (contextSet) {
                BranchContextHolder.clear();
            }
        }
    }

    /**
     * Header value wins when the user is allowed to access that branch.
     * Otherwise fall back to the JWT's primary branch. Admins viewing
     * "all branches" send no header (or "ALL") and active stays null.
     */
    private Long resolveActiveBranchId(
            HttpServletRequest request,
            Long jwtBranchId,
            boolean isAllBranches,
            Set<Long> allowed) {
        String headerValue = request.getHeader("X-Branch-Id");
        if (headerValue == null || headerValue.isBlank() || "ALL".equalsIgnoreCase(headerValue)) {
            return isAllBranches ? null : jwtBranchId;
        }
        try {
            long parsed = Long.parseLong(headerValue.trim());
            if (isAllBranches || allowed.contains(parsed)) {
                return parsed;
            }
        } catch (NumberFormatException ignored) {
            // fall through to JWT default
        }
        return jwtBranchId;
    }
}
