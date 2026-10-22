package com.billbull.backend.common.crypto;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

import static org.junit.jupiter.api.Assertions.assertThrows;

/** ARCHFIX S4 — AES-GCM at-rest encryption converter for reversible secrets (SMTP password). */
class EncryptedStringConverterTest {

    private final EncryptedStringConverter converter = new EncryptedStringConverter("unit-test-key");

    @Test
    void roundTripsPlaintextThroughCiphertext() {
        String plain = "s3cr3t-app-password";
        String stored = converter.convertToDatabaseColumn(plain);

        assertNotEquals(plain, stored, "stored value must not be plaintext");
        assertTrue(stored.startsWith("enc:v1:"), "ciphertext carries the version marker");
        assertEquals(plain, converter.convertToEntityAttribute(stored), "decrypt restores the original");
    }

    @Test
    void encryptionIsNonDeterministic() {
        // Random IV per call -> same input encrypts to different ciphertexts, both decrypting back.
        String a = converter.convertToDatabaseColumn("same");
        String b = converter.convertToDatabaseColumn("same");
        assertNotEquals(a, b, "random IV makes ciphertext non-deterministic");
        assertEquals("same", converter.convertToEntityAttribute(a));
        assertEquals("same", converter.convertToEntityAttribute(b));
    }

    @Test
    void legacyPlaintextIsReturnedAsIs() {
        // A value without the enc:v1: marker is pre-encryption legacy data — pass through unchanged.
        assertEquals("legacy-plain", converter.convertToEntityAttribute("legacy-plain"));
    }

    @Test
    void nullAndEmptyArePreserved() {
        assertNull(converter.convertToDatabaseColumn(null));
        assertNull(converter.convertToEntityAttribute(null));
        assertEquals("", converter.convertToDatabaseColumn(""));
        assertEquals("", converter.convertToEntityAttribute(""));
    }

    @Test
    void wrongKeyCannotDecrypt() {
        String stored = converter.convertToDatabaseColumn("topsecret");
        EncryptedStringConverter other = new EncryptedStringConverter("a-different-key");
        // GCM auth tag fails under the wrong key -> decryption throws rather than returning garbage.
        boolean threw = false;
        try {
            other.convertToEntityAttribute(stored);
        } catch (IllegalStateException e) {
            threw = true;
        }
        assertTrue(threw, "ciphertext must not decrypt under a different key");
        assertFalse(stored.contains("topsecret"));
    }

    // ── T-P0-2: key policy wiring and compatibility with stored ciphertext ──────────────

    /** Written by the converter as it was before the key policy (HEAD 6bb8a87c), with a test key. */
    private static final String GOLDEN_KEY = "golden-test-key-0123456789-abcdefghij";
    private static final String GOLDEN_CIPHERTEXT =
            "enc:v1:cJZo2awBYDngd9mcavGGIAZqlf58UMhbfYmU7FlPstTa+UulKKl2oKsrZjIERQXKGxU=";
    /** Written before the key policy under the public development key, as an unset deployment did. */
    private static final String DEV_KEY_CIPHERTEXT =
            "enc:v1:S0xjAsSvMSTOfbACHfASgA3EXiXZqTCZH0mPIoX/wWa/OwOLhJmM/lLM2N8Y";

    @Test
    void ciphertextWrittenBeforeTheKeyPolicyStillDecryptsUnderTheSameKey() {
        MockEnvironment deployment = new MockEnvironment();
        deployment.setActiveProfiles("royaltools");
        EncryptedStringConverter springBuilt = new EncryptedStringConverter(GOLDEN_KEY, deployment);

        assertEquals("app-password-from-2026", springBuilt.convertToEntityAttribute(GOLDEN_CIPHERTEXT));
        assertEquals("app-password-from-2026",
                new EncryptedStringConverter(GOLDEN_KEY).convertToEntityAttribute(GOLDEN_CIPHERTEXT));
    }

    @Test
    void aLocalRunWithoutAKeyStillReadsDevelopmentKeyCiphertext() {
        EncryptedStringConverter local = new EncryptedStringConverter("", new MockEnvironment());
        assertEquals("legacy-dev-secret", local.convertToEntityAttribute(DEV_KEY_CIPHERTEXT));
    }

    @Test
    void theSpringConstructorRefusesAnUnusableKeyForADeployment() {
        MockEnvironment deployment = new MockEnvironment();
        deployment.setActiveProfiles("prod");
        assertThrows(IllegalStateException.class, () -> new EncryptedStringConverter("", deployment));
        assertThrows(IllegalStateException.class,
                () -> new EncryptedStringConverter(EncryptionKeyPolicy.DEV_FALLBACK_KEY, deployment));
        assertThrows(IllegalStateException.class, () -> new EncryptedStringConverter("short", deployment));
    }
}
