package com.billbull.platform;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * BillBull Platform Control Center — the service behind admin.billbull.app.
 *
 * <p>It keeps the client registry, plans, entitlements, platform users and an append-only audit
 * trail in its own database, and manages each tenant only through that tenant backend's signed
 * platform agent ({@code /api/platform/**}). It never opens a tenant database.
 */
// No in-memory user: platform users live in platform_users and authenticate through JwtAuthFilter.
@SpringBootApplication(exclude = org.springframework.boot.autoconfigure.security.servlet.UserDetailsServiceAutoConfiguration.class)
@EnableScheduling
public class PlatformApplication {

    public static void main(String[] args) {
        SpringApplication.run(PlatformApplication.class, args);
    }
}
