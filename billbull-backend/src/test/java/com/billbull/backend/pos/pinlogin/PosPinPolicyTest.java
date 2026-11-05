package com.billbull.backend.pos.pinlogin;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

class PosPinPolicyTest {

    private final PosPinPolicy policy = new PosPinPolicy(new BCryptPasswordEncoder(4));

    @ParameterizedTest
    @ValueSource(strings = {"2580", "73914", "907153"})
    void acceptsFourToSixDigitPins(String pin) {
        assertDoesNotThrow(() -> policy.validate(pin));
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "123", "1234567", "12a4", " 2580", "1111", "1234", "4321", "567890"})
    void rejectsMalformedOrEasyPins(String pin) {
        assertThrows(IllegalArgumentException.class, () -> policy.validate(pin));
    }

    @Test
    void hashesWithBcryptAndMatchesOnlyTheRightPin() {
        String hash = policy.hash("2580");

        assertTrue(hash.startsWith("$2"));
        assertTrue(policy.matches("2580", hash));
        assertFalse(policy.matches("2581", hash));
        assertFalse(policy.matches("2580", null));
        assertFalse(policy.matches(null, hash));
    }
}
