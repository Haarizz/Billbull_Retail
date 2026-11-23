package com.billbull.platform.auth;

import java.io.IOException;
import java.util.List;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Authenticates platform users from {@code Authorization: Bearer <access token>}.
 *
 * <p>The user row is re-read on every request (platform traffic is tiny), so deactivating a
 * user, changing their role or bumping {@code token_version} takes effect on their very next
 * call — a stolen token can't outlive the account. A user who must change their password can
 * only reach {@code /api/auth/**} until they do.
 */
@Component
public class JwtAuthFilter extends OncePerRequestFilter {

    private final JwtService jwtService;
    private final PlatformUserRepository users;

    public JwtAuthFilter(JwtService jwtService, PlatformUserRepository users) {
        this.jwtService = jwtService;
        this.users = users;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String header = request.getHeader("Authorization");
        if (header != null && header.startsWith("Bearer ")) {
            try {
                JwtService.Verified v = jwtService.verify(header.substring(7).trim(), JwtService.TYPE_ACCESS);
                PlatformUser user = users.findById(v.userId()).orElse(null);
                if (user == null || !user.active || user.tokenVersion != v.tokenVersion()) {
                    deny(response);
                    return;
                }
                String path = request.getRequestURI();
                if (user.mustChangePassword && !path.startsWith("/api/auth/")) {
                    response.setStatus(HttpServletResponse.SC_FORBIDDEN);
                    response.setContentType("application/json");
                    response.getWriter().write("{\"code\":\"PASSWORD_CHANGE_REQUIRED\",\"message\":\"Change your password first\"}");
                    return;
                }
                PlatformPrincipal principal = new PlatformPrincipal(user.id, user.email, user.role, user.mustChangePassword);
                var auth = new UsernamePasswordAuthenticationToken(principal, null,
                        List.of(new SimpleGrantedAuthority("ROLE_" + user.role.name())));
                SecurityContextHolder.getContext().setAuthentication(auth);
            } catch (RuntimeException e) {
                deny(response);
                return;
            }
        }
        try {
            chain.doFilter(request, response);
        } finally {
            SecurityContextHolder.clearContext();
        }
    }

    private static void deny(HttpServletResponse response) throws IOException {
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setContentType("application/json");
        response.getWriter().write("{\"code\":\"UNAUTHENTICATED\",\"message\":\"Session expired. Sign in again.\"}");
    }
}
