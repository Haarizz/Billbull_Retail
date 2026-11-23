package com.billbull.platform.auth;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import com.billbull.platform.audit.AuditService;

/**
 * Creates the first OWNER when the platform has no users at all, from
 * {@code PLATFORM_BOOTSTRAP_EMAIL} and {@code PLATFORM_BOOTSTRAP_PASSWORD}. The owner must change
 * that password and enrol MFA on first sign-in. Once any user exists this does nothing, so remove
 * both variables from the environment after the first start.
 */
@Component
public class BootstrapOwner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(BootstrapOwner.class);

    private final PlatformUserRepository users;
    private final PasswordEncoder encoder;
    private final AuditService audit;
    private final String email;
    private final String password;

    public BootstrapOwner(PlatformUserRepository users, PasswordEncoder encoder, AuditService audit,
                          @Value("${PLATFORM_BOOTSTRAP_EMAIL:}") String email,
                          @Value("${PLATFORM_BOOTSTRAP_PASSWORD:}") String password) {
        this.users = users;
        this.encoder = encoder;
        this.audit = audit;
        this.email = email == null ? "" : email.trim();
        this.password = password == null ? "" : password;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (users.count() > 0) {
            if (!password.isEmpty()) {
                log.warn("PLATFORM_BOOTSTRAP_PASSWORD is still set although platform users exist; remove it from the environment.");
            }
            return;
        }
        if (email.isEmpty() || password.isEmpty()) {
            log.warn("No platform users exist. Set PLATFORM_BOOTSTRAP_EMAIL and PLATFORM_BOOTSTRAP_PASSWORD"
                    + " (12+ characters) and restart to create the first OWNER.");
            return;
        }
        AuthService.validatePassword(password);
        PlatformUser owner = new PlatformUser();
        owner.email = email.toLowerCase(java.util.Locale.ROOT);
        owner.fullName = "Platform Owner";
        owner.passwordHash = encoder.encode(password);
        owner.role = PlatformRole.OWNER;
        owner.mustChangePassword = true;
        users.save(owner);
        audit.record(PlatformPrincipal.system(), "USER_BOOTSTRAPPED", "PlatformUser", String.valueOf(owner.id), null,
                "First OWNER " + owner.email + " created from the environment", null);
        log.info("Created the first platform OWNER {}. Sign in, change the password and set up MFA.", owner.email);
    }
}
