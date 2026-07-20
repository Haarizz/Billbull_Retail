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
import com.billbull.backend.common.ownership.OwnershipAccessService;
import com.billbull.backend.common.ownership.OwnershipContextHolder;
import com.billbull.backend.logging.LogContext;
import com.billbull.backend.user.UserRepository;

@Component
public class JwtFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(JwtFilter.class);

    private final JwtUtil jwtUtil;
    private final UserRepository userRepository;
    private final OwnershipAccessService ownershipAccessService;

    public JwtFilter(JwtUtil jwtUtil, UserRepository userRepository,
                     OwnershipAccessService ownershipAccessService) {
        this.jwtUtil = jwtUtil;
        this.userRepository = userRepository;
        this.ownershipAccessService = ownershipAccessService;
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

                // Reject tokens belonging to frozen/deleted users. ARCHFIX §1.6: a boolean exists-
                // query touches only the users row — the old findByUsername(...).map(isActive)
                // dragged the EAGER roles + additionalBranches join-tables on every request, which
                // the filter never reads (roles/branches come from the JWT claims below).
                boolean isActive = userRepository.existsByUsernameAndIsActiveTrue(username);
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

                // ── Ownership context (user-based data visibility) ────────────
                // viewAll = true means "not ownership-restricted". When the feature toggle is off we
                // set viewAll=true unconditionally so nothing filters (byte-identical to today).
                // When on, a principal is restricted only if their roles do NOT grant the override
                // (admins/supervisors + permissions.records.view-all holders bypass). Owner id is
                // taken from the validated JWT claim — never from a client-supplied value.
                boolean viewAll = !ownershipAccessService.filteringEnabled()
                        || ownershipAccessService.rolesGrantViewAll(roles);
                OwnershipContextHolder.set(new OwnershipContextHolder.OwnershipContext(userId, viewAll));

                contextSet = true;
            }
        }

        try {
            filterChain.doFilter(request, response);
        } finally {
            if (contextSet) {
                BranchContextHolder.clear();
                OwnershipContextHolder.clear();
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
