package com.billbull.backend.common.crypto;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationContextInitializer;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.core.env.ConfigurableEnvironment;

/**
 * Refuses to start a deployment whose {@code EMAIL_ENC_KEY} fails {@link EncryptionKeyPolicy}.
 *
 * <p>Registered in META-INF/spring.factories, so it runs once the environment and profiles are
 * resolved and before any bean is created: no Flyway migration, database connection or web port
 * happens with an unusable key. {@link EncryptedStringConverter} applies the same policy again,
 * which covers contexts started without spring.factories.
 */
public class EncryptionKeyStartupCheck implements ApplicationContextInitializer<ConfigurableApplicationContext> {

    private static final Logger log = LoggerFactory.getLogger(EncryptionKeyStartupCheck.class);

    @Override
    public void initialize(ConfigurableApplicationContext context) {
        check(context.getEnvironment());
    }

    static void check(ConfigurableEnvironment environment) {
        String configured = environment.getProperty(EncryptionKeyPolicy.PROPERTY);
        String[] profiles = environment.getActiveProfiles();
        String resolved = EncryptionKeyPolicy.resolve(configured, profiles);
        if (EncryptionKeyPolicy.DEV_FALLBACK_KEY.equals(resolved.trim())) {
            log.warn("{} is not set: stored integration secrets use the public development key. "
                    + "Allowed only for a local run; every deployment profile must set its own key.",
                    EncryptionKeyPolicy.PROPERTY);
        }
    }
}
