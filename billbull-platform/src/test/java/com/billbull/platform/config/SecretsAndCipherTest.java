package com.billbull.platform.config;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

class SecretsAndCipherTest {

    private static final String A = "first-secret-value-that-is-long-enough-1234";
    private static final String B = "second-secret-value-that-is-long-enough-567";

    @Test
    void productionRefusesMissingShortOrEqualKeys() {
        MockEnvironment prod = new MockEnvironment();
        prod.setActiveProfiles("prod");
        assertThrows(IllegalStateException.class, () -> new PlatformSecrets("", B, prod));
        assertThrows(IllegalStateException.class, () -> new PlatformSecrets("short", B, prod));
        assertThrows(IllegalStateException.class, () -> new PlatformSecrets(A, A, prod));
        assertThrows(IllegalStateException.class, () -> new PlatformSecrets("", "", new MockEnvironment()),
                "no profile is not a dev run, so missing keys are refused");
        new PlatformSecrets(A, B, prod);
    }

    @Test
    void devProfileGetsRandomKeysPerRun() {
        MockEnvironment dev = new MockEnvironment();
        dev.setActiveProfiles("dev");
        PlatformSecrets one = new PlatformSecrets("", "", dev);
        PlatformSecrets two = new PlatformSecrets("", "", dev);
        assertNotEquals(new String(one.jwtSecretBytes(), StandardCharsets.UTF_8),
                new String(two.jwtSecretBytes(), StandardCharsets.UTF_8));
        assertFalse(PlatformSecrets.isDev(new String[] {"dev", "prod"}));
    }

    @Test
    void cipherRoundTripsAndDetectsTampering() {
        SecretCipher c = new SecretCipher(A.getBytes(StandardCharsets.UTF_8));
        String enc = c.encrypt("agent-secret");
        assertTrue(enc.startsWith("v1:"));
        assertNotEquals(enc, c.encrypt("agent-secret"), "random IV per encryption");
        assertEquals("agent-secret", c.decrypt(enc));
        String tampered = enc.substring(0, enc.length() - 2) + (enc.endsWith("A") ? "B" : "A") + enc.charAt(enc.length() - 1);
        assertThrows(IllegalStateException.class, () -> c.decrypt(tampered));
        assertThrows(IllegalStateException.class,
                () -> new SecretCipher(B.getBytes(StandardCharsets.UTF_8)).decrypt(enc), "another key can't read it");
        assertEquals(64, c.newSecret().length());
    }
}
