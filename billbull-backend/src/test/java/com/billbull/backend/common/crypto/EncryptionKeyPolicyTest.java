package com.billbull.backend.common.crypto;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/** T-P0-2: which EMAIL_ENC_KEY values a deployment and a local run may use. */
class EncryptionKeyPolicyTest {

    private static final String[] CLIENT = {"royaltools"};
    private static final String[] LOCAL = {};
    private static final String VALID = "q8Jx3vN0bT7mWc2LrP5sY9dK1fH4gZ6a";   // 32 characters

    @Test
    void aDeploymentProfileWithoutAKeyIsRefused() {
        IllegalStateException e = assertThrows(IllegalStateException.class,
                () -> EncryptionKeyPolicy.resolve(null, CLIENT));
        assertTrue(e.getMessage().startsWith("EMAIL_ENC_KEY is not set"), e.getMessage());
        assertTrue(e.getMessage().contains("royaltools"));
    }

    @Test
    void aDeploymentProfileWithABlankKeyIsRefused() {
        assertThrows(IllegalStateException.class, () -> EncryptionKeyPolicy.resolve("", CLIENT));
        assertThrows(IllegalStateException.class, () -> EncryptionKeyPolicy.resolve("   \t", CLIENT));
    }

    @Test
    void theDevelopmentKeyIsRefusedForADeploymentEvenWithSurroundingSpaces() {
        String dev = EncryptionKeyPolicy.DEV_FALLBACK_KEY;
        IllegalStateException e = assertThrows(IllegalStateException.class,
                () -> EncryptionKeyPolicy.resolve(dev, CLIENT));
        assertTrue(e.getMessage().contains("public development key"));
        assertFalse(e.getMessage().contains(dev), "the refusal must not repeat the key");
        assertThrows(IllegalStateException.class, () -> EncryptionKeyPolicy.resolve(" " + dev + " ", CLIENT));
    }

    @Test
    void aShortKeyIsRefusedEverywhereWithoutEchoingIt() {
        String shortKey = "Tenant-Key-2026-xyz";
        for (String[] profiles : new String[][] {CLIENT, LOCAL, {"dev"}}) {
            IllegalStateException e = assertThrows(IllegalStateException.class,
                    () -> EncryptionKeyPolicy.resolve(shortKey, profiles));
            assertTrue(e.getMessage().contains("shorter than 32"), e.getMessage());
            assertFalse(e.getMessage().contains(shortKey), "the refusal must not repeat the key");
        }
        assertThrows(IllegalStateException.class,
                () -> EncryptionKeyPolicy.resolve(VALID.substring(1), CLIENT), "31 characters");
    }

    @Test
    void aValidKeyIsUsedUnchangedInEveryProfile() {
        assertEquals(VALID, EncryptionKeyPolicy.resolve(VALID, CLIENT));
        assertEquals(VALID, EncryptionKeyPolicy.resolve(VALID, new String[] {"prod"}));
        assertEquals(VALID, EncryptionKeyPolicy.resolve(VALID, LOCAL));
        // Not trimmed: the derived AES key must stay what existing ciphertext was written with.
        assertEquals(VALID + " ", EncryptionKeyPolicy.resolve(VALID + " ", CLIENT));
    }

    @Test
    void aLocalRunFallsBackToTheDevelopmentKey() {
        assertEquals(EncryptionKeyPolicy.DEV_FALLBACK_KEY, EncryptionKeyPolicy.resolve(null, LOCAL));
        assertEquals(EncryptionKeyPolicy.DEV_FALLBACK_KEY, EncryptionKeyPolicy.resolve(null, null));
        assertEquals(EncryptionKeyPolicy.DEV_FALLBACK_KEY, EncryptionKeyPolicy.resolve("", new String[] {"dev"}));
        assertEquals(EncryptionKeyPolicy.DEV_FALLBACK_KEY,
                EncryptionKeyPolicy.resolve(null, new String[] {"local", "TEST"}));
        assertEquals(EncryptionKeyPolicy.DEV_FALLBACK_KEY,
                EncryptionKeyPolicy.resolve(EncryptionKeyPolicy.DEV_FALLBACK_KEY, LOCAL));
    }

    @Test
    void everyRepositoryClientProfileAndAnyMixWithOneCountsAsADeployment() {
        for (String profile : new String[] {"prod", "qa", "testing", "demo", "client1", "geebu", "hilite",
                "leroyalflowers", "leroyalgifts", "royaltools", "alfahad", "bikevillage"}) {
            assertFalse(EncryptionKeyPolicy.devFallbackAllowed(new String[] {profile}), profile);
        }
        assertFalse(EncryptionKeyPolicy.devFallbackAllowed(new String[] {"dev", "royaltools"}));
        assertThrows(IllegalStateException.class,
                () -> EncryptionKeyPolicy.resolve(null, new String[] {"dev", "royaltools"}));
    }
}
