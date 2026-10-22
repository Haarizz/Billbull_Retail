package com.billbull.backend.common.crypto;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.WebApplicationType;
import org.springframework.context.ApplicationContextInitializer;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.support.SpringFactoriesLoader;
import org.springframework.mock.env.MockEnvironment;

import java.util.concurrent.atomic.AtomicBoolean;

import static org.junit.jupiter.api.Assertions.*;

/**
 * T-P0-2: the key is checked when the application starts, before any bean exists. A deployment
 * profile with no usable key never reaches Flyway, the database or the web port.
 */
class EncryptionKeyStartupCheckTest {

    private static final String VALID = "q8Jx3vN0bT7mWc2LrP5sY9dK1fH4gZ6a-startup";
    private static final AtomicBoolean BEAN_CREATED = new AtomicBoolean();

    @AfterEach
    void reset() {
        BEAN_CREATED.set(false);
    }

    @Test
    void isRegisteredAsAnApplicationContextInitializer() {
        assertTrue(SpringFactoriesLoader.forDefaultResourceLocation(getClass().getClassLoader())
                .load(ApplicationContextInitializer.class).stream()
                .anyMatch(EncryptionKeyStartupCheck.class::isInstance));
    }

    @Test
    void aDeploymentWithoutAKeyFailsToStartBeforeAnyBeanIsCreated() {
        IllegalStateException e = assertThrows(IllegalStateException.class, () -> start("royaltools"));
        assertTrue(e.getMessage().startsWith("EMAIL_ENC_KEY is not set"), e.getMessage());
        assertFalse(BEAN_CREATED.get(), "the context must not get as far as creating beans");
    }

    @Test
    void aDeploymentWithTheDevelopmentKeyFailsToStart() {
        IllegalStateException e = assertThrows(IllegalStateException.class,
                () -> start("royaltools", "--EMAIL_ENC_KEY=" + EncryptionKeyPolicy.DEV_FALLBACK_KEY));
        assertTrue(e.getMessage().contains("public development key"));
        assertFalse(e.getMessage().contains(EncryptionKeyPolicy.DEV_FALLBACK_KEY));
        assertFalse(BEAN_CREATED.get());
    }

    @Test
    void aDeploymentWithAMalformedKeyFailsToStart() {
        assertThrows(IllegalStateException.class, () -> start("royaltools", "--EMAIL_ENC_KEY=too-short"));
        assertFalse(BEAN_CREATED.get());
    }

    @Test
    void aDeploymentWithAValidKeyStarts() {
        try (ConfigurableApplicationContext ctx = start("royaltools", "--EMAIL_ENC_KEY=" + VALID)) {
            assertTrue(BEAN_CREATED.get());
            assertNotNull(ctx.getBean(EncryptedStringConverter.class));
        }
    }

    @Test
    void aLocalRunWithoutAKeyStarts() {
        try (ConfigurableApplicationContext ctx = start(null)) {
            assertTrue(BEAN_CREATED.get());
        }
    }

    @Test
    void checkReadsTheKeyAndProfilesFromTheEnvironment() {
        MockEnvironment env = new MockEnvironment();
        env.setActiveProfiles("prod");
        assertThrows(IllegalStateException.class, () -> EncryptionKeyStartupCheck.check(env));
        env.setProperty("EMAIL_ENC_KEY", VALID);
        assertDoesNotThrow(() -> EncryptionKeyStartupCheck.check(env));
    }

    private static ConfigurableApplicationContext start(String profile, String... args) {
        SpringApplication app = new SpringApplication(MinimalContext.class);
        app.setWebApplicationType(WebApplicationType.NONE);
        if (profile != null) app.setAdditionalProfiles(profile);
        return app.run(args);
    }

    /** No auto-configuration: no datasource, Flyway or web server, only the converter and a marker bean. */
    @Configuration(proxyBeanMethods = false)
    static class MinimalContext {
        @Bean
        Object marker() {
            BEAN_CREATED.set(true);
            return new Object();
        }

        @Bean
        EncryptedStringConverter encryptedStringConverter(org.springframework.core.env.Environment env) {
            return new EncryptedStringConverter(env.getProperty("EMAIL_ENC_KEY", ""), env);
        }
    }
}
