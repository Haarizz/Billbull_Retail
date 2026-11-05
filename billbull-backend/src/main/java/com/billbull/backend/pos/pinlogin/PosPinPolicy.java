package com.billbull.backend.pos.pinlogin;

import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

/**
 * Rules and hashing for an employee's till PIN. The PIN is only ever stored as a BCrypt hash
 * (the same encoder as user passwords); the plain PIN never leaves the request that set it.
 */
@Component
public class PosPinPolicy {

    public static final int MIN_LENGTH = 4;
    public static final int MAX_LENGTH = 6;

    private final PasswordEncoder passwordEncoder;

    public PosPinPolicy(PasswordEncoder passwordEncoder) {
        this.passwordEncoder = passwordEncoder;
    }

    /** Throws {@link IllegalArgumentException} with a user-facing message when the PIN is unusable. */
    public void validate(String pin) {
        if (pin == null || !pin.matches("\\d{" + MIN_LENGTH + "," + MAX_LENGTH + "}")) {
            throw new IllegalArgumentException("POS PIN must be " + MIN_LENGTH + " to " + MAX_LENGTH + " digits.");
        }
        if (isTrivial(pin)) {
            throw new IllegalArgumentException(
                    "POS PIN is too easy to guess. Avoid repeated digits (1111) and runs (1234, 4321).");
        }
    }

    public String hash(String pin) {
        validate(pin);
        return passwordEncoder.encode(pin);
    }

    /** Hashes without the strength rules — only for carrying over PINs set before they existed. */
    String encodeUnchecked(String pin) {
        return passwordEncoder.encode(pin);
    }

    public boolean matches(String pin, String hash) {
        if (pin == null || hash == null || hash.isBlank()) {
            return false;
        }
        return passwordEncoder.matches(pin, hash);
    }

    /** All digits equal, or a run up or down the keypad, wrapping 9-0 (1234, 98765, 7890). */
    static boolean isTrivial(String pin) {
        boolean same = true;
        boolean up = true;
        boolean down = true;
        for (int i = 1; i < pin.length(); i++) {
            int step = Math.floorMod(pin.charAt(i) - pin.charAt(i - 1), 10);
            same &= step == 0;
            up &= step == 1;
            down &= step == 9;
        }
        return same || up || down;
    }
}
