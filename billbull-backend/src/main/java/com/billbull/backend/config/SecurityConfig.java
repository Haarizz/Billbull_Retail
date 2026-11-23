package com.billbull.backend.config;

import com.billbull.backend.platform.PlatformAgentAuthFilter;
import com.billbull.backend.platform.PlatformPolicyFilter;

import org.springframework.context.annotation.Bean;
import org.springframework.http.HttpStatus;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.access.hierarchicalroles.RoleHierarchy;
import org.springframework.security.access.hierarchicalroles.RoleHierarchyImpl;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.web.cors.CorsConfigurationSource;

import com.billbull.backend.ratelimit.RateLimitFilter;

@Configuration
@EnableMethodSecurity
public class SecurityConfig {

    private final JwtFilter jwtFilter;
    private final RateLimitFilter rateLimitFilter;
    private final CorsConfigurationSource corsConfigurationSource;
    private final PlatformAgentAuthFilter platformAgentAuthFilter;
    private final PlatformPolicyFilter platformPolicyFilter;

    // ✅ SINGLE constructor (this is important)
    public SecurityConfig(JwtFilter jwtFilter,
            RateLimitFilter rateLimitFilter,
            CorsConfigurationSource corsConfigurationSource,
            PlatformAgentAuthFilter platformAgentAuthFilter,
            PlatformPolicyFilter platformPolicyFilter) {
        this.jwtFilter = jwtFilter;
        this.rateLimitFilter = rateLimitFilter;
        this.corsConfigurationSource = corsConfigurationSource;
        this.platformAgentAuthFilter = platformAgentAuthFilter;
        this.platformPolicyFilter = platformPolicyFilter;
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {

        http
                .cors(cors -> cors.configurationSource(corsConfigurationSource))
                .csrf(csrf -> csrf.disable())
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/api/auth/**", "/api/client-logs/**", "/uploads/**", "/tools/**").permitAll()
                        // Meta's WhatsApp webhook carries no JWT; WhatsAppController authenticates it with
                        // the verify token (GET) and the X-Hub-Signature-256 HMAC (POST).
                        .requestMatchers("/api/whatsapp/webhook").permitAll()
                        // RFQ vendor portal: no JWT; RfqPortalService checks the per-vendor link
                        // secret + emailed one-time code, then an X-Vendor-Session token.
                        .requestMatchers("/api/vendor-portal/**").permitAll()
                        // Customer-facing document links sent on WhatsApp (/d/:token): the 256-bit
                        // link token is the credential; DocumentShareLinkService checks it.
                        .requestMatchers("/api/public/documents/**").permitAll()
                        // Control-plane agent: HMAC-signed by PlatformAgentAuthFilter, never a tenant JWT.
                        .requestMatchers("/api/platform", "/api/platform/**").hasRole("PLATFORM_AGENT")
                        .anyRequest().authenticated())
                // Without an explicit entry point Spring falls back to Http403ForbiddenEntryPoint,
                // so a missing/expired JWT came back as 403 — indistinguishable from a real
                // permission denial. The POS front end then showed "You do not have permission to
                // perform this action" and kept the cashier on a dead session instead of taking the
                // 401 path that clears the token and returns to /login. Authenticated-but-denied
                // requests still get 403 from the default AccessDeniedHandler.
                .exceptionHandling(ex -> ex
                        .authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)))
                .sessionManagement(sess -> sess.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .addFilterBefore(jwtFilter, UsernamePasswordAuthenticationFilter.class)
                // Signed control-plane calls are authenticated before (and instead of) the JWT.
                .addFilterBefore(platformAgentAuthFilter, JwtFilter.class)
                // Rate limiter runs AFTER JwtFilter so the authenticated principal is available for
                // per-user bucket keys (design §4/§6). No-op unless ratelimit.enabled=true.
                .addFilterAfter(rateLimitFilter, JwtFilter.class)
                // Suspension / read-only / module entitlements pushed by the control plane. No-op
                // for a tenant the control plane has never managed.
                .addFilterAfter(platformPolicyFilter, RateLimitFilter.class);

        return http.build();
    }

    /**
     * ADMIN inherits every BRANCH_ADMIN authority (not the other way round): BRANCH_ADMIN does not
     * pass hasRole(ADMIN), which is what keeps user/role administration ADMIN-only. Branch
     * scoping is enforced separately via BranchScope (BRANCH_ADMIN is not in JwtUtil.ALL_BRANCH_ROLES).
     */
    @Bean
    public RoleHierarchy roleHierarchy() {
        return RoleHierarchyImpl.fromHierarchy("ROLE_ADMIN > ROLE_BRANCH_ADMIN");
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public AuthenticationManager authenticationManager(
            AuthenticationConfiguration config) throws Exception {
        return config.getAuthenticationManager();
    }
}
