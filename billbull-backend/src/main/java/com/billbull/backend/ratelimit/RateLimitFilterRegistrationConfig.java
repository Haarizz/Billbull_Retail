package com.billbull.backend.ratelimit;

import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * {@link RateLimitFilter} is a {@code @Component}, so Spring Boot would auto-register it in the main
 * servlet filter chain. But we add it explicitly <b>inside the Spring Security chain</b> (after
 * JwtFilter) via SecurityConfig, so the security context is populated when it runs. Left to
 * auto-register as well, the filter would run twice per request and double-consume tokens.
 *
 * <p>This registration bean disables the automatic servlet-container registration; the security
 * chain remains the single place the filter executes.
 */
@Configuration
public class RateLimitFilterRegistrationConfig {

    @Bean
    public FilterRegistrationBean<RateLimitFilter> disableAutoRegistration(RateLimitFilter filter) {
        FilterRegistrationBean<RateLimitFilter> registration = new FilterRegistrationBean<>(filter);
        registration.setEnabled(false);
        return registration;
    }
}
