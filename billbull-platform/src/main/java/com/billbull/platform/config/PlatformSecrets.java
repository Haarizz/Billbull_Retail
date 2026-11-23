package com.billbull.platform.config;

import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Base64;
import java.util.Locale;
import java.util.Set;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

/**
 * The control plane's two keys, read from the service environment only:
 *
 * <ul>
 *   <li>{@code PLATFORM_JWT_SECRET} signs platform users' sessions.</li>
 *   <li>{@code PLATFORM_ENC_KEY} encrypts stored tenant agent secrets and MFA seeds.</li>
 * </ul>
 * Each must be at least {@value #MIN_LENGTH} characters and the two must differ; otherwise the
 * service refuses to start. Only the {@code dev}/{@code test} profiles may run without them, and
 * then they get random throwaway keys for that run (never a constant from the source code — the
 * mistake the tenant backends made with {@code jwt.secret}).
 */
@Component
public class PlatformSecrets {

    public static final int MIN_LENGTH = 32;
    private static final Set<String> DEV_PROFILES = Set.of("dev", "test");
    private static final Logger log = LoggerFactory.getLogger(PlatformSecrets.class);

    private final String jwtSecret;
    private final String encryptionKey;

    public PlatformSecrets(@Value("${PLATFORM_JWT_SECRET:}") String jwtSecret,
                           @Value("${PLATFORM_ENC_KEY:}") String encryptionKey,
                           Environment environment) {
        boolean dev = isDev(environment.getActiveProfiles());
        this.jwtSecret = resolve("PLATFORM_JWT_SECRET", jwtSecret, dev);
        this.encryptionKey = resolve("PLATFORM_ENC_KEY", encryptionKey, dev);
        if (this.jwtSecret.equals(this.encryptionKey)) {
            throw new IllegalStateException("PLATFORM_JWT_SECRET and PLATFORM_ENC_KEY must be different values");
        }
    }

    static boolean isDev(String[] profiles) {
        return profiles != null && profiles.length > 0 && Arrays.stream(profiles)
                .allMatch(p -> p != null && DEV_PROFILES.contains(p.trim().toLowerCase(Locale.ROOT)));
    }

    static String resolve(String name, String configured, boolean dev) {
        String value = configured == null ? "" : configured.trim();
        if (value.isEmpty()) {
            if (!dev) {
                throw new IllegalStateException(name + " is not set. Generate one with `openssl rand -base64 48`"
                        + " and put it in the service environment (/etc/billbull/platform.env).");
            }
            byte[] random = new byte[48];
            new SecureRandom().nextBytes(random);
            log.warn("{} not set: using a random key for this dev run only.", name);
            return Base64.getEncoder().encodeToString(random);
        }
        if (value.length() < MIN_LENGTH) {
            throw new IllegalStateException(name + " is shorter than " + MIN_LENGTH + " characters.");
        }
        return value;
    }

    public byte[] jwtSecretBytes() {
        return jwtSecret.getBytes(StandardCharsets.UTF_8);
    }

    public byte[] encryptionKeyBytes() {
        return encryptionKey.getBytes(StandardCharsets.UTF_8);
    }
}
