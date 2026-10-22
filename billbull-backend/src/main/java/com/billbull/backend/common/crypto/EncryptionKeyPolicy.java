package com.billbull.backend.common.crypto;

import java.util.Arrays;
import java.util.Locale;
import java.util.Set;

/**
 * Decides whether the configured {@code EMAIL_ENC_KEY} may be used to encrypt stored integration
 * secrets: the SMTP password and the WhatsApp access token, app secret and verify token.
 *
 * <p>The key is a free-form string that {@link EncryptedStringConverter} SHA-256-folds into an
 * AES-256 key, so any string "works". This policy refuses the ones that protect nothing:
 * <ul>
 *   <li>unset or blank, and the public development key in this repository: allowed only for a
 *       local run (see {@link #devFallbackAllowed});</li>
 *   <li>shorter than {@link #MIN_LENGTH} characters: refused everywhere.</li>
 * </ul>
 * Refusals never include the configured value.
 */
public final class EncryptionKeyPolicy {

    /** Environment variable (or property) holding the key. */
    public static final String PROPERTY = "EMAIL_ENC_KEY";

    /** In the repository, so it protects nothing. Usable only for a local run. */
    static final String DEV_FALLBACK_KEY = "billbull-dev-email-encryption-key-change-me";

    /** `openssl rand -base64 48` gives 64 characters; 32 is the floor. */
    public static final int MIN_LENGTH = 32;

    /**
     * Profiles that are a developer's machine. No such profile file exists; every
     * application-{client}.properties profile is a deployment and needs a real key.
     */
    static final Set<String> DEV_PROFILES = Set.of("dev", "local", "test");

    private EncryptionKeyPolicy() {}

    /**
     * True for a local run: no profile active (plain {@code mvn spring-boot:run} or a test
     * context), or only {@link #DEV_PROFILES}. Deployments start with
     * {@code --spring.profiles.active=<client>}, which is never in that set.
     */
    static boolean devFallbackAllowed(String[] activeProfiles) {
        if (activeProfiles == null || activeProfiles.length == 0) return true;
        return Arrays.stream(activeProfiles)
                .allMatch(p -> p != null && DEV_PROFILES.contains(p.trim().toLowerCase(Locale.ROOT)));
    }

    /**
     * The secret to derive the AES key from: {@code configured} itself, or the development key for
     * a local run with nothing configured.
     *
     * @throws IllegalStateException when the key cannot be used under {@code activeProfiles}. The
     *         message names the problem and the profiles, never the value.
     */
    public static String resolve(String configured, String[] activeProfiles) {
        boolean local = devFallbackAllowed(activeProfiles);
        if (configured == null || configured.isBlank()) {
            if (local) return DEV_FALLBACK_KEY;
            throw refused("is not set", activeProfiles);
        }
        if (configured.trim().equals(DEV_FALLBACK_KEY)) {
            if (local) return configured;
            throw refused("is the public development key from the source code", activeProfiles);
        }
        if (configured.length() < MIN_LENGTH) {
            throw refused("is shorter than " + MIN_LENGTH + " characters", activeProfiles);
        }
        return configured;
    }

    private static IllegalStateException refused(String problem, String[] activeProfiles) {
        String profiles = activeProfiles == null || activeProfiles.length == 0
                ? "none" : String.join(",", activeProfiles);
        return new IllegalStateException(PROPERTY + " " + problem + " (active profiles: " + profiles + "). "
                + "It encrypts the stored SMTP password and WhatsApp tokens, so every deployment needs its own "
                + "random value of at least " + MIN_LENGTH + " characters, for example from "
                + "`openssl rand -base64 48`. Set it in the service environment, not in a properties file. "
                + "If this database already holds secrets encrypted under another key, re-encrypt them with "
                + "EncryptionKeyRotationTool first. See DEPLOYMENT_GUIDE.md, \"Encryption key (EMAIL_ENC_KEY)\".");
    }
}
