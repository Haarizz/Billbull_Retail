package com.billbull.backend.common.crypto;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

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
}
