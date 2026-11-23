package com.billbull.backend.platform;

import java.util.Arrays;
import java.util.Locale;
import java.util.Set;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

/**
 * Which client this backend process serves.
 *
 * <p>BillBull runs one JVM per client, so "the tenant" is a deployment fact, not something a
 * request can choose. The code is {@code billbull.tenant.code} when set, otherwise the first
 * active Spring profile that is a client profile (e.g. {@code demo}, {@code royaltools}), otherwise
 * {@code "local"}. It is stamped into every JWT as the {@code tid} claim so a token issued by one
 * client is refused by another, even where two clients still share a signing key.
 */
@Component
public class TenantIdentity {

    /** Profiles that only tune behaviour and never name a client. */
    private static final Set<String> NON_CLIENT_PROFILES = Set.of("prod", "dev", "local", "test", "default");

    private final String code;

    public TenantIdentity(@Value("${billbull.tenant.code:}") String configured, Environment environment) {
        this.code = resolve(configured, environment != null ? environment.getActiveProfiles() : null);
    }

    static String resolve(String configured, String[] activeProfiles) {
        if (configured != null && !configured.isBlank()) {
            return normalise(configured);
        }
        if (activeProfiles != null) {
            return Arrays.stream(activeProfiles)
                    .filter(p -> p != null && !p.isBlank())
                    .map(TenantIdentity::normalise)
                    .filter(p -> !NON_CLIENT_PROFILES.contains(p))
                    .findFirst()
                    .orElse("local");
        }
        return "local";
    }

    private static String normalise(String value) {
        return value.trim().toLowerCase(Locale.ROOT);
    }

    public String code() {
        return code;
    }
}
